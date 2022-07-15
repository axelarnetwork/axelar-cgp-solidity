// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';
import { IReceiverImplementation } from '../interfaces/IReceiverImplementation.sol';

// This should be owned by the microservice that is paying for gas.
contract ReceiverImplementation is IReceiverImplementation {
    // Using immutable storage for gas savings
    address public immutable gateway;
    bytes32 internal immutable wrappedSymbolBytes;

    // This public storage for ERC20 token intended to be refunded.
    // It triggers the DepositReceiver to switch into a refund mode.
    // Address is stored and deleted withing the same refund transaction.
    address public refundToken;

    constructor(address gateway_, string memory wrappedSymbol_) {
        if (gateway_ == address(0)) revert InvalidAddress();

        gateway = gateway_;

        // Checking if token symbol exists in the gateway
        if (IAxelarGateway(gateway_).tokenAddresses(wrappedSymbol_) == address(0)) revert InvalidSymbol();

        // Converting a string to bytes32 for immutable storage
        bytes memory symbolBytes = bytes(wrappedSymbol_);

        if (symbolBytes.length == 0 || symbolBytes.length > 31) revert InvalidSymbol();

        uint256 symbolNumber = uint256(bytes32(symbolBytes));

        // Storing string length as the last byte of the data
        symbolNumber |= 0xff & symbolBytes.length;
        wrappedSymbolBytes = bytes32(abi.encodePacked(symbolNumber));
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: msg.sender == ReceiverImplementation, this == DepositReceiver
    function receiveAndSendToken(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata symbol
    ) external {
        // Always refunding native otherwise it's sent on DepositReceiver self destruction
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address tokenAddress = IAxelarGateway(gateway).tokenAddresses(symbol);
        // Checking with ReceiverImplementation if need to refund a token
        address refund = ReceiverImplementation(msg.sender).refundToken();
        if (refund != address(0)) {
            _safeTransfer(refund, refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(tokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        // Sending the token trough the gateway
        IERC20(tokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, symbol, amount);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: msg.sender == ReceiverImplementation, this == DepositReceiver
    function receiveAndSendNative(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        address refund = ReceiverImplementation(msg.sender).refundToken();
        if (refund != address(0)) {
            if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

            _safeTransfer(refund, refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        address wrappedTokenAddress = wrappedToken();
        uint256 amount = address(this).balance;

        if (amount == 0) revert NothingDeposited();

        // Wrapping the native currency and sending WETH-like token through the gateway
        IWETH9(wrappedTokenAddress).deposit{ value: amount }();
        IERC20(wrappedTokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, wrappedSymbol(), amount);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: msg.sender == ReceiverImplementation, this == DepositReceiver
    function receiveAndUnwrapNative(address payable refundAddress, address payable recipient) external {
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address wrappedTokenAddress = wrappedToken();
        address refund = ReceiverImplementation(msg.sender).refundToken();
        if (refund != address(0)) {
            _safeTransfer(refund, refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(wrappedTokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        // Unwrapping the token into native currency and sending it to the recipient
        IWETH9(wrappedTokenAddress).withdraw(amount);
        recipient.transfer(amount);
    }

    function wrappedToken() public view returns (address) {
        return IAxelarGateway(gateway).tokenAddresses(wrappedSymbol());
    }

    // @dev Converts bytes32 from immutable storage into a string
    function wrappedSymbol() public view returns (string memory symbol) {
        bytes32 symbolData = wrappedSymbolBytes;

        // recovering string length as the last byte of the data
        uint256 length = 0xff & uint256(symbolData);

        // restoring the string with the correct length
        // solhint-disable-next-line no-inline-assembly
        assembly {
            symbol := mload(0x40)
            // new "memory end" including padding (the string isn't larger than 32 bytes)
            mstore(0x40, add(symbol, 0x40))
            // store length in memory
            mstore(symbol, length)
            // write actual data
            mstore(add(symbol, 0x20), symbolData)
        }
    }

    function _safeTransfer(
        address tokenAddress,
        address receiver,
        uint256 amount
    ) internal {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returnData) = tokenAddress.call(abi.encodeWithSelector(IERC20.transfer.selector, receiver, amount));
        bool transferred = success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));

        if (!transferred || tokenAddress.code.length == 0) revert TokenTransferFailed();
    }
}
