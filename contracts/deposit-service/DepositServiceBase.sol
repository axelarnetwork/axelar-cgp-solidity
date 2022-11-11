// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IDepositServiceBase } from '../interfaces/IDepositServiceBase.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { Bytes32ToString, StringToBytes32 } from '../util/BytesStringUtil.sol';

// This should be owned by the microservice that is paying for gas.
contract DepositServiceBase is IDepositServiceBase {
    using StringToBytes32 for string;
    using Bytes32ToString for bytes32;

    // Using immutable storage to keep the constants in the bytecode
    address public immutable gateway;
    address public immutable wrappedTokenAddress;
    bytes32 internal immutable wrappedSymbolBytes;

    constructor(address gateway_, string memory wrappedSymbol_) {
        if (gateway_ == address(0)) revert InvalidAddress();

        bool wrappedTokenEnabled = bytes(wrappedSymbol_).length > 0;

        gateway = gateway_;
        wrappedTokenAddress = wrappedTokenEnabled ? IAxelarGateway(gateway_).tokenAddresses(wrappedSymbol_) : address(0);
        wrappedSymbolBytes = wrappedTokenEnabled ? wrappedSymbol_.toBytes32() : bytes32(0);

        // Wrapped token symbol param is optional
        // When specified we are checking if token exists in the gateway
        if (wrappedTokenEnabled && wrappedTokenAddress == address(0)) revert InvalidSymbol();
    }

    function wrappedToken() public view returns (address) {
        return wrappedTokenAddress;
    }

    // @dev Converts bytes32 from immutable storage into a string
    function wrappedSymbol() public view returns (string memory) {
        return wrappedSymbolBytes.toTrimmedString();
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
