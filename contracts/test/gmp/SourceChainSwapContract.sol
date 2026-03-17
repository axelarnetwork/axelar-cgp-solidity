// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AxelarExecutableWithToken } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutableWithToken.sol';
import { IAxelarGasService } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { StringToAddress } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/libs/AddressString.sol';

contract SourceChainSwapContract is AxelarExecutableWithToken {
    IAxelarGasService public immutable gasService;
    string public destinationChain;
    string public executableAddress;

    constructor(
        address gateway_,
        address gasService_,
        string memory destinationChain_,
        string memory executableAddress_
    ) AxelarExecutableWithToken(gateway_) {
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
        address tokenX = gatewayWithToken().tokenAddresses(symbolA);
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

        IERC20(tokenX).approve(address(gateway()), amount);
        gatewayWithToken().callContractWithToken(destinationChain, executableAddress, payload, symbolA, amount);
    }

    function _executeWithToken(
        bytes32, /*commandId*/
        string calldata, /*sourceChain*/
        string calldata, /*sourceAddress*/
        bytes calldata payload,
        string calldata tokenSymbolB,
        uint256 amount
    ) internal override {
        string memory recipientStr = abi.decode(payload, (string));
        address tokenB = gatewayWithToken().tokenAddresses(tokenSymbolB);
        IERC20(tokenB).transfer(StringToAddress.toAddress(recipientStr), amount);
    }

    function _execute(
        bytes32,
        string calldata,
        string calldata,
        bytes calldata
    ) internal pure override {
        revert('Not implemented');
    }
}
