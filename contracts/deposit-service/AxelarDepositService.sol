// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarDepositService } from '../interfaces/IAxelarDepositService.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';
import { Upgradable } from '../util/Upgradable.sol';
import { DepositReceiver } from './DepositReceiver.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarDepositService is Upgradable, IAxelarDepositService {
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

    // @dev This method is meant to called directly by user to send native token cross-chain
    function sendNative(string calldata destinationChain, string calldata destinationAddress) external payable {
        address wrappedTokenAddress = wrappedToken();
        uint256 amount = msg.value;

        if (amount == 0) revert NothingDeposited();

        IWETH9(wrappedTokenAddress).deposit{ value: amount }();
        IERC20(wrappedTokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, wrappedSymbol(), amount);
    }

    // @dev Generates a deposit address for sending an ERC20 token cross-chain
    function depositAddressForTransferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address) {
        return
            _depositAddress(
                salt,
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferToken.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress,
                    tokenSymbol
                )
            );
    }

    // @dev Generates a deposit address for sending native currency cross-chain
    function depositAddressForTransferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address) {
        return
            _depositAddress(
                salt,
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferNative.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress
                )
            );
    }

    // @dev Generates a deposit address for unwrapping WETH-like token into native currency
    function depositAddressForWithdrawNative(
        bytes32 salt,
        address refundAddress,
        address recipient
    ) external view returns (address) {
        return
            _depositAddress(salt, abi.encodeWithSelector(AxelarDepositService.receiveAndWithdrawNative.selector, refundAddress, recipient));
    }

    // @dev Receives ERC20 token from the deposit address and sends it cross-chain
    function transferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external {
        // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
        new DepositReceiver{ salt: salt }(
            abi.encodeWithSelector(
                AxelarDepositService.receiveAndTransferToken.selector,
                refundAddress,
                destinationChain,
                destinationAddress,
                tokenSymbol
            )
        );
    }

    // @dev Refunds ERC20 tokens from the deposit address if they don't match the intended token
    // Only refundAddress can refund the token that was intended to go cross-chain (if not sent yet)
    function refundFromTransferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol,
        address[] calldata refundTokens
    ) external {
        for (uint256 i; i < refundTokens.length; i++) {
            // Saving to public storage to be accessed by the DepositReceiver
            refundToken = refundTokens[i];
            // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
            new DepositReceiver{ salt: salt }(
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferToken.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress,
                    tokenSymbol
                )
            );
        }

        refundToken = address(0);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: tx.origin == user, msg.sender == AxelarDepositService, this == DepositReceiver
    function receiveAndTransferToken(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata symbol
    ) external {
        // Always refunding native otherwise it's sent on DepositReceiver self destruction
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address tokenAddress = IAxelarGateway(gateway).tokenAddresses(symbol);
        // Checking with AxelarDepositService if need to refund a token
        address refund = AxelarDepositService(msg.sender).refundToken();
        if (refund != address(0)) {
            // Allowing only the refundAddress to refund the intended token
            if (refund == tokenAddress && refundAddress != tx.origin) return;

            IERC20(refund).transfer(refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(tokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        // Sending the token trough the gateway
        IERC20(tokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, symbol, amount);
    }

    // @dev Receives native currency, wraps it into WETH-like token and sends cross-chain
    function transferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
        new DepositReceiver{ salt: salt }(
            abi.encodeWithSelector(
                AxelarDepositService.receiveAndTransferNative.selector,
                refundAddress,
                destinationChain,
                destinationAddress
            )
        );
    }

    // @dev Refunds ERC20 tokens from the deposit address
    // Only refundAddress can refund the native currency intended to go cross-chain (if not sent yet)
    function refundFromTransferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        address[] calldata refundTokens
    ) external {
        for (uint256 i; i < refundTokens.length; i++) {
            refundToken = refundTokens[i];
            // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
            new DepositReceiver{ salt: salt }(
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferNative.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress
                )
            );
        }

        refundToken = address(0);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: tx.origin == user, msg.sender == AxelarDepositService, this == DepositReceiver
    function receiveAndTransferNative(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        address refund = AxelarDepositService(msg.sender).refundToken();
        if (refund != address(0)) {
            // Allowing only the refundAddress to refund the native currency
            if (address(this).balance > 0 && refundAddress == tx.origin) refundAddress.transfer(address(this).balance);

            IERC20(refund).transfer(refundAddress, IERC20(refund).balanceOf(address(this)));
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

    // @dev Receives WETH-like token, unwraps and send native currency to the recipient
    function withdrawNative(
        bytes32 salt,
        address refundAddress,
        address payable recipient
    ) external {
        // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
        new DepositReceiver{ salt: salt }(
            abi.encodeWithSelector(AxelarDepositService.receiveAndWithdrawNative.selector, refundAddress, recipient)
        );
    }

    // @dev Refunds ERC20 tokens from the deposit address except WETH-like token
    // Only refundAddress can refund the WETH-like token intended to be unwrapped (if not yet)
    function refundFromWithdrawNative(
        bytes32 salt,
        address refundAddress,
        address payable recipient,
        address[] calldata refundTokens
    ) external {
        for (uint256 i; i < refundTokens.length; i++) {
            refundToken = refundTokens[i];
            // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
            new DepositReceiver{ salt: salt }(
                abi.encodeWithSelector(AxelarDepositService.receiveAndWithdrawNative.selector, refundAddress, recipient)
            );
        }

        refundToken = address(0);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: tx.origin == user, msg.sender == AxelarDepositService, this == DepositReceiver
    function receiveAndWithdrawNative(address payable refundAddress, address payable recipient) external {
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address wrappedTokenAddress = wrappedToken();
        address refund = AxelarDepositService(msg.sender).refundToken();
        if (refund != address(0)) {
            // Allowing only the refundAddress to refund the WETH-like token
            if (refund == wrappedTokenAddress && refundAddress != tx.origin) return;

            IERC20(refund).transfer(refundAddress, IERC20(refund).balanceOf(address(this)));
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

    function _depositAddress(bytes32 create2Salt, bytes memory delegateData) internal view returns (address) {
        /* Convert a hash which is bytes32 to an address which is 20-byte long
        according to https://docs.soliditylang.org/en/v0.8.1/control-structures.html?highlight=create2#salted-contract-creations-create2 */
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                create2Salt,
                                // Encoding delegateData as a constructor param
                                keccak256(abi.encodePacked(type(DepositReceiver).creationCode, abi.encode(delegateData)))
                            )
                        )
                    )
                )
            );
    }

    function contractId() public pure returns (bytes32) {
        return keccak256('axelar-deposit-service');
    }
}
