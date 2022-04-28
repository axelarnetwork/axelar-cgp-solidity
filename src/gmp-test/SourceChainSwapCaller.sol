// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IAxelarGasReceiver } from '../interfaces/IAxelarGasReceiver.sol';
import { IERC20 } from '../interfaces/IERC20.sol';

contract SourceChainSwapCaller {
    IAxelarGateway public gateway;
    IAxelarGasReceiver public gasReceiver;
    string public destinationChain;
    string public executableAddress;

    constructor(
        address gateway_,
        address gasReceiver_,
        string memory destinationChain_,
        string memory executableAddress_
    ) {
        gateway = IAxelarGateway(gateway_);
        gasReceiver = IAxelarGasReceiver(gasReceiver_);
        destinationChain = destinationChain_;
        executableAddress = executableAddress_;
    }

    function swapToken(
        string memory symbolX,
        string memory symbolY,
        uint256 amount,
        string memory recipient,
        uint256 gasFee
    ) external {
        address tokenX = gateway.tokenAddresses(symbolX);
        bytes memory payload = abi.encode(symbolY, recipient);

        IERC20(tokenX).transferFrom(msg.sender, address(this), amount + gasFee);

        IERC20(tokenX).approve(address(gasReceiver), gasFee);
        gasReceiver.payGasForContractCallWithToken(
            address(this),
            destinationChain,
            executableAddress,
            payload,
            symbolX,
            amount,
            tokenX,
            gasFee,
            msg.sender
        );

        IERC20(tokenX).approve(address(gateway), amount);
        gateway.callContractWithToken(destinationChain, executableAddress, payload, symbolX, amount);
    }
}
