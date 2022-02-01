// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import {IAxelarGateway} from '../interfaces/IAxelarGateway.sol';
import {IERC20} from '../interfaces/IERC20.sol';
import './TokenSwapper.sol';

contract ExternalExecutor {
    address gateway;
    address swapper;

    mapping(bytes32 => bool) public wasExecuted;

    constructor(address gatewayAddress, address swapperAddress) {
        gateway = gatewayAddress;
        swapper = swapperAddress;
    }

    function swapToken(
        address tokenAddress,
        uint256 amount,
        address toTokenAddress,
        address recipient,
        uint256 nonce
    ) external {
        bytes32 payloadHash = keccak256(abi.encode(toTokenAddress, recipient, nonce));
        bytes32 approvalHash = keccak256(abi.encode(
                IAxelarGateway.ContractCallHashKey.WithToken,
                tokenAddress,
                amount,
                payloadHash
            ));

        require(IAxelarGateway(gateway).isContractCallApproved(address(this), approvalHash), 'NOT APPROVED');

        require(wasExecuted[approvalHash] == false, 'ALREADY EXECUTED');
        wasExecuted[approvalHash] = true;

        IERC20(tokenAddress).approve(swapper, amount);
        TokenSwapper(swapper).swap(tokenAddress, amount, toTokenAddress, recipient);
    }
}
