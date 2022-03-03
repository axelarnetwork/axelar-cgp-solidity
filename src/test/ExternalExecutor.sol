// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import {IAxelarGateway} from '../interfaces/IAxelarGateway.sol';
import {IERC20} from '../interfaces/IERC20.sol';
import './TokenSwapper.sol';

contract ExternalExecutor {
    address gateway;
    address swapper;

    constructor(address gatewayAddress, address swapperAddress) {
        gateway = gatewayAddress;
        swapper = swapperAddress;
    }

    function swapToken(
        bytes32 commandId,
        string memory tokenSymbol,
        uint256 amount,
        address toTokenAddress,
        address recipient
    ) external {
        bytes32 payloadHash = keccak256(abi.encode(toTokenAddress, recipient));

        require(IAxelarGateway(gateway).validateContractCallAndMint(commandId, payloadHash, tokenSymbol, amount), 'NOT APPROVED');

        address tokenAddress = IAxelarGateway(gateway).tokenAddresses(tokenSymbol);
        IERC20(tokenAddress).approve(swapper, amount);
        TokenSwapper(swapper).swap(tokenAddress, amount, toTokenAddress, recipient);
    }
}
