// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarExecutable } from '../interfaces/IAxelarExecutable.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { ChainBTokenSwapper } from './ChainBTokenSwapper.sol';

contract ChainBSwapExecutable is IAxelarExecutable {
    address swapper;

    constructor(address gatewayAddress, address swapperAddress) IAxelarExecutable(gatewayAddress) {
        swapper = swapperAddress;
    }

    function _executeWithToken(
        string memory sourceChain,
        string memory,
        bytes calldata payload,
        string memory tokenSymbolX,
        uint256 amount
    ) internal override {
        (string memory tokenSymbolY, string memory recipient) = abi.decode(payload, (string, string));

        address tokenX = gateway.tokenAddresses(tokenSymbolX);
        address tokenY = gateway.tokenAddresses(tokenSymbolY);

        IERC20(tokenX).approve(swapper, amount);
        uint256 convertedAmount = ChainBTokenSwapper(swapper).swap(tokenX, tokenY, amount, address(this));

        IERC20(tokenY).approve(address(gateway), convertedAmount);
        gateway.sendToken(sourceChain, recipient, tokenSymbolY, convertedAmount);
    }
}
