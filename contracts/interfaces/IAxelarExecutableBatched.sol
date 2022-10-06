// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAxelarGatewayBatched } from './IAxelarGatewayBatched.sol';

abstract contract IAxelarExecutableBatched {
    error NotApprovedByGateway();

    IAxelarGatewayBatched public gateway;

    constructor(address gateway_) {
        gateway = IAxelarGatewayBatched(gateway_);
    }

    function execute(
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes calldata payload,
        IAxelarGatewayBatched.Proof calldata proof
    ) external {
        bytes32 payloadHash = keccak256(payload);
        if (!gateway.validateContractCall(sourceChain, sourceAddress, payloadHash, proof)) revert NotApprovedByGateway();
        _execute(sourceChain, sourceAddress, payload);
    }

    function _execute(
        string memory sourceChain,
        bytes memory sourceAddress,
        bytes calldata payload
    ) internal virtual {}
}
