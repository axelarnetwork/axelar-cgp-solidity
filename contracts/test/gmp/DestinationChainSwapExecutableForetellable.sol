// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarExecutableForetellable } from '../../interfaces/IAxelarExecutableForetellable.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { DestinationChainTokenSwapper } from './DestinationChainTokenSwapper.sol';

contract DestinationChainSwapExecutableForetellable is IAxelarExecutableForetellable {
    DestinationChainTokenSwapper public swapper;

    constructor(address gatewayAddress, address swapperAddress) IAxelarExecutableForetellable(gatewayAddress) {
        swapper = DestinationChainTokenSwapper(swapperAddress);
    }

    function _executeWithToken(
        string memory sourceChain,
        string memory,
        bytes calldata payload,
        string memory tokenSymbolA,
        uint256 amount
    ) internal override {
        (string memory tokenSymbolB, string memory recipient) = abi.decode(payload, (string, string));

        address tokenA = gateway.tokenAddresses(tokenSymbolA);
        address tokenB = gateway.tokenAddresses(tokenSymbolB);

        IERC20(tokenA).approve(address(swapper), amount);
        uint256 convertedAmount = swapper.swap(tokenA, tokenB, amount, address(this));

        IERC20(tokenB).approve(address(gateway), convertedAmount);
        gateway.sendToken(sourceChain, recipient, tokenSymbolB, convertedAmount);
    }
}
