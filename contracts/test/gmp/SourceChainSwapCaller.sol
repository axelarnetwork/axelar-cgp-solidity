// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../../interfaces/IAxelarGateway.sol';
import { IAxelarGasService } from '../../interfaces/IAxelarGasService.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';

contract SourceChainSwapCaller {
    IAxelarGateway public gateway;
    IAxelarGasService public gasService;
    string public destinationChain;
    string public executableAddress;

    constructor(
        address gateway_,
        address gasService_,
        string memory destinationChain_,
        string memory executableAddress_
    ) {
        gateway = IAxelarGateway(gateway_);
        gasService = IAxelarGasService(gasService_);
        destinationChain = destinationChain_;
        executableAddress = executableAddress_;
    }

    function swapToken(
        string memory symbolA,
        string memory symbolB,
        uint256 amount,
        string memory recipient
    ) external payable {
        address tokenX = gateway.tokenAddresses(symbolA);
        bytes memory payload = abi.encode(symbolB, recipient);

        IERC20(tokenX).transferFrom(msg.sender, address(this), amount);

        if (msg.value > 0)
            gasService.payNativeGasForContractCallWithToken{ value: msg.value }(
                address(this),
                destinationChain,
                executableAddress,
                payload,
                symbolA,
                amount,
                msg.sender
            );

        IERC20(tokenX).approve(address(gateway), amount);
        gateway.callContractWithToken(destinationChain, executableAddress, payload, symbolA, amount);
    }
}
