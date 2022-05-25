// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from './IAxelarGateway.sol';
import { IERC20 } from './IERC20.sol';

abstract contract IAxelarExecutableFortellable {
    error NotApprovedByGateway();
    error AlreadyFortold();
    error NotAuthorizedToFortell();

    IAxelarGateway public gateway;
    mapping(string => mapping(string => mapping(bytes => mapping(string => mapping(uint256 => address)))))
        public fortellers;

    constructor(address gateway_) {
        gateway = IAxelarGateway(gateway_);
    }

    function execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) external {
        bytes32 payloadHash = keccak256(payload);
        if (!gateway.validateContractCall(commandId, sourceChain, sourceAddress, payloadHash))
            revert NotApprovedByGateway();
        _execute(sourceChain, sourceAddress, payload);
    }

    function fortell(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount,
        address forteller
    ) external {
        address token = gateway.tokenAddresses(tokenSymbol);
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        _checkFortell(sourceChain, sourceAddress, payload, tokenSymbol, amount, forteller);
        if (fortellers[sourceChain][sourceAddress][payload][tokenSymbol][amount] != address(0)) revert AlreadyFortold();
        fortellers[sourceChain][sourceAddress][payload][tokenSymbol][amount] = forteller;
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
        if (
            !gateway.validateContractCallAndMint(
                commandId,
                sourceChain,
                sourceAddress,
                payloadHash,
                tokenSymbol,
                amount
            )
        ) revert NotApprovedByGateway();
        address forteller = fortellers[sourceChain][sourceAddress][payload][tokenSymbol][amount];
        if (forteller != address(0)) {
            fortellers[sourceChain][sourceAddress][payload][tokenSymbol][amount] = address(0);
            address token = gateway.tokenAddresses(tokenSymbol);
            IERC20(token).transfer(forteller, amount);
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

    // Override this and revert if you want to only allow certain people/calls to be able to fortell.
    function _checkFortell(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount,
        address forteller
    ) internal virtual {}
}
