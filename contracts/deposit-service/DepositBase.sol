// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';
import { IDepositBase } from '../interfaces/IDepositBase.sol';

// This should be owned by the microservice that is paying for gas.
contract DepositBase is IDepositBase {
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
