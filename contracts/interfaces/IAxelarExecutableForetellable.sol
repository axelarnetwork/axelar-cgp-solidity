// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from './IAxelarGateway.sol';
import { IERC20 } from './IERC20.sol';

abstract contract IAxelarExecutableForetellable {
    error NotApprovedByGateway();
    error AlreadyForetold();
    error NotAuthorizedToForetell();
    error TransferFailed();

    IAxelarGateway public gateway;
    mapping(bytes32 => address) foretellers;

    constructor(address gatewayAddress) {
        gateway = IAxelarGateway(gatewayAddress);
    }

    function foretell(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        address foreteller
    ) external {
        _checkForetell(sourceChain, sourceAddress, payload, foreteller);
        if (foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload))] != address(0)) revert AlreadyForetold();
        foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload))] = foreteller;
        _execute(sourceChain, sourceAddress, payload);
    }

    function execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) external {
        bytes32 payloadHash = keccak256(payload);
        if (!gateway.validateContractCall(commandId, sourceChain, sourceAddress, payloadHash)) revert NotApprovedByGateway();
        address foreteller = foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload))];
        if (foreteller != address(0)) {
            foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload))] = address(0);
        } else {
            _execute(sourceChain, sourceAddress, payload);
        }
    }

    function foretellWithToken(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount,
        address foreteller
    ) external {
        address token = gateway.tokenAddresses(tokenSymbol);
        _safeTransferFrom(token, msg.sender, amount);
        _checkForetellWithToken(sourceChain, sourceAddress, payload, tokenSymbol, amount, foreteller);
        if (foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload, tokenSymbol, amount))] != address(0))
            revert AlreadyForetold();
        foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload, tokenSymbol, amount))] = foreteller;
        _executeWithToken(sourceChain, sourceAddress, payload, tokenSymbol, amount);
    }

    function executeWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) external {
        bytes32 payloadHash = keccak256(payload);
        if (!gateway.validateContractCallAndMint(commandId, sourceChain, sourceAddress, payloadHash, tokenSymbol, amount))
            revert NotApprovedByGateway();
        address foreteller = foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload, tokenSymbol, amount))];
        if (foreteller != address(0)) {
            foretellers[keccak256(abi.encode(sourceChain, sourceAddress, payload, tokenSymbol, amount))] = address(0);
            address token = gateway.tokenAddresses(tokenSymbol);
            _safeTransfer(token, foreteller, amount);
        } else {
            _executeWithToken(sourceChain, sourceAddress, payload, tokenSymbol, amount);
        }
    }

    function _execute(
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload
    ) internal virtual {}

    function _executeWithToken(
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload,
        string memory tokenSymbol,
        uint256 amount
    ) internal virtual {}

    // Override this and revert if you want to only allow certain people/calls to be able to foretell.
    function _checkForetell(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        address foreteller
    ) internal virtual {}

    // Override this and revert if you want to only allow certain people/calls to be able to foretell.
    function _checkForetellWithToken(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount,
        address foreteller
    ) internal virtual {}

    function _safeTransfer(
        address tokenAddress,
        address receiver,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = tokenAddress.call(abi.encodeWithSelector(IERC20.transfer.selector, receiver, amount));
        bool transferred = success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));

        if (!transferred || tokenAddress.code.length == 0) revert TransferFailed();
    }

    function _safeTransferFrom(
        address tokenAddress,
        address from,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = tokenAddress.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        bool transferred = success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));

        if (!transferred || tokenAddress.code.length == 0) revert TransferFailed();
    }
}
