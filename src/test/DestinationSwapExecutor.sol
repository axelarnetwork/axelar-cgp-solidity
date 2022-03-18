// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IDestinationExecutor } from '../interfaces/IDestinationExecutor.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { TokenSwapper } from './TokenSwapper.sol';

contract DestinationSwapExecutor is IDestinationExecutor{
    address gateway;
    address swapper;

    constructor(address gatewayAddress, address swapperAddress) {
        gateway = gatewayAddress;
        swapper = swapperAddress;
    }

    function execute(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload
    ) external {}

    function executeWithToken(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload,
        string memory tokenSymbol,
        uint256 amount
    ) external {
        bytes32 payloadHash = keccak256(payload);
        (address toTokenAddress, address recipient) = abi.decode(payload, (address, address));

        require(IAxelarGateway(gateway).validateContractCallAndMint(commandId, sourceChain, sourceAddress, payloadHash, tokenSymbol, amount), 'NOT APPROVED');

        address tokenAddress = IAxelarGateway(gateway).tokenAddresses(tokenSymbol);
        IERC20(tokenAddress).approve(swapper, amount);
        TokenSwapper(swapper).swap(tokenAddress, amount, toTokenAddress, recipient);
    }
}
