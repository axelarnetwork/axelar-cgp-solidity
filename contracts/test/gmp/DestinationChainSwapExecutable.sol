// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AxelarExecutableWithToken } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutableWithToken.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { DestinationChainTokenSwapper } from './DestinationChainTokenSwapper.sol';

contract DestinationChainSwapExecutable is AxelarExecutableWithToken {
    DestinationChainTokenSwapper public immutable swapper;

    constructor(address gatewayAddress, address swapperAddress) AxelarExecutableWithToken(gatewayAddress) {
        swapper = DestinationChainTokenSwapper(swapperAddress);
    }

    function _executeWithToken(
        bytes32, /*commandId*/
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbolA,
        uint256 amount
    ) internal override {
        (string memory tokenSymbolB, string memory recipient) = abi.decode(payload, (string, string));

        // swap
        uint256 convertedAmount;
        address tokenB;
        {
            address tokenA = gatewayWithToken().tokenAddresses(tokenSymbolA);
            tokenB = gatewayWithToken().tokenAddresses(tokenSymbolB);
            IERC20(tokenA).approve(address(swapper), amount);
            convertedAmount = swapper.swap(tokenA, tokenB, amount, address(this));
        }

        // send back
        {
            bytes memory returnPayload = abi.encode(recipient);
            IERC20(tokenB).approve(address(gateway()), convertedAmount);
            gatewayWithToken().callContractWithToken(sourceChain, sourceAddress, returnPayload, tokenSymbolB, convertedAmount);
        }
    }

    function _execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {}
}
