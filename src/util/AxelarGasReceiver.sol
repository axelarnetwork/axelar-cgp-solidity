// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '../interfaces/IERC20.sol';
import { Ownable } from '../Ownable.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { ERC20Permit } from '../ERC20Permit.sol';


// This should be owned by the microservice that is paying for gas.
contract AxelarGasReceiver is Ownable{
    IAxelarGateway public gateway;

    event GasReceived(
        string destinationChain,
        string destinationAddress,
        bytes payload,
        string symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount,
        uint256 gasLimit
    );

    constructor(address gateway_) Ownable() {
        gateway = IAxelarGateway(gateway_);
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGas (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount,
        uint256 gasLimit
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceived(destinationChain, destinationAddress, payload, symbol, amountThrough, gasToken, gasAmount, gasLimit);
    }

    //This is called by users to pay gas and send a remote contract call in one tx.
    function receiveGasAndCallRemote (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount,
        uint256 gasLimit
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceived(destinationChain, destinationAddress, payload, symbol, amountThrough, gasToken, gasAmount, gasLimit);
        IERC20 tokenThrough = IERC20(gateway.tokenAddresses(symbol));
        tokenThrough.transferFrom(msg.sender, address(this), amountThrough);
        tokenThrough.approve(address(gateway), amountThrough);
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, symbol, amountThrough);
    }

    //This is called by users to pay gas and send a remote contract call in one tx. It is cheaper in gas than the above.
    function receiveGasAndCallRemotePermit (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount,
        uint256 gasLimit,
        uint256 deadline,
        bytes memory signature
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceived(destinationChain, destinationAddress, payload, symbol, amountThrough, gasToken, gasAmount, gasLimit);
        {
            (
                uint8 v,
                bytes32 r,
                bytes32 s 
            ) = abi.decode(signature, (uint8, bytes32, bytes32));
            ERC20Permit tokenThrough = ERC20Permit(gateway.tokenAddresses(symbol));
            tokenThrough.permit(msg.sender, address(gateway), amountThrough, deadline, v, r, s);
        }
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, symbol, amountThrough);
    }

}