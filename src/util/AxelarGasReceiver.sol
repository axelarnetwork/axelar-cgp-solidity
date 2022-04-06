// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '../interfaces/IERC20.sol';
import { Ownable } from '../Ownable.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { ERC20Permit } from '../ERC20Permit.sol';


// This should be owned by the microservice that is paying for gas.
contract AxelarGasReceiver is Ownable{
    IAxelarGateway public gateway;

    error NothingReceived();


    event GasReceived(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes payload,
        address gasToken,
        uint256 gasAmount
    );
    event GasReceivedWithToken(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes payload,
        string symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount
    );
    
    event GasReceivedNative(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes payload,
        uint256 gasAmount
    );
    event GasReceivedNativeWithToken(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes payload,
        string symbol,
        uint256 amountThrough,
        uint256 gasAmount
    );

    constructor() Ownable() {
    }

    function setup(bytes calldata data) public {
        address gateway_;
        ( 
            owner, 
            gateway_ 
        ) = abi.decode(data, (address, address));
        gateway = IAxelarGateway(gateway_);
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGas (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceived(msg.sender, destinationChain, destinationAddress, payload, gasToken, gasAmount);
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGasWithToken (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceivedWithToken(msg.sender, destinationChain, destinationAddress, payload, symbol, amountThrough, gasToken, gasAmount);
    }

    //This is called by users to pay gas and send a remote contract call in one tx.
    function receiveGasAndCallRemote (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceived(msg.sender, destinationChain, destinationAddress, payload, gasToken, gasAmount);
        gateway.callContract(destinationChain, destinationAddress, payload);
    }

    //This is called by users to pay gas and send a remote contract call in one tx.
    function receiveGasAndCallRemoteWithToken (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceivedWithToken(msg.sender, destinationChain, destinationAddress, payload, symbol, amountThrough, gasToken, gasAmount);
        IERC20 tokenThrough = IERC20(gateway.tokenAddresses(symbol));
        tokenThrough.transferFrom(msg.sender, address(this), amountThrough);
        tokenThrough.approve(address(gateway), amountThrough);
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, symbol, amountThrough);
    }

    //This is called by users to pay gas and send a remote contract call in one tx. It is cheaper in gas than the above.
    function receiveGasAndCallRemoteWithTokenPermit (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount,
        uint256 deadline,
        bytes memory signature
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasReceivedWithToken(msg.sender, destinationChain, destinationAddress, payload, symbol, amountThrough, gasToken, gasAmount);
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

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGasNative (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload
    ) external payable {
        if(msg.value == 0)
            revert NothingReceived();
        emit GasReceivedNative(msg.sender, destinationChain, destinationAddress, payload, msg.value);
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGasNativeWithToken (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough
    ) external payable {
        if(msg.value == 0)
            revert NothingReceived();
        emit GasReceivedNativeWithToken(msg.sender, destinationChain, destinationAddress, payload, symbol, amountThrough, msg.value);
    }

    //This is called by users to pay gas and send a remote contract call in one tx.
    function receiveGasNativeAndCallRemote (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload
    ) external payable {
        if(msg.value == 0)
            revert NothingReceived();
        emit GasReceivedNative(msg.sender, destinationChain, destinationAddress, payload, msg.value);
        gateway.callContract(destinationChain, destinationAddress, payload);
    }

    //This is called by users to pay gas and send a remote contract call in one tx.
    function receiveGasNativeAndCallRemoteWithToken (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough
    ) external payable {
        if(msg.value == 0)
            revert NothingReceived();
        emit GasReceivedNativeWithToken(msg.sender, destinationChain, destinationAddress, payload, symbol, amountThrough, msg.value);
        IERC20 tokenThrough = IERC20(gateway.tokenAddresses(symbol));
        tokenThrough.transferFrom(msg.sender, address(this), amountThrough);
        tokenThrough.approve(address(gateway), amountThrough);
        gateway.callContractWithToken(destinationChain, destinationAddress, payload, symbol, amountThrough);
    }

    //This is called by users to pay gas and send a remote contract call in one tx. It is cheaper in gas than the above.
    function receiveGasNativeAndCallRemoteWithTokenPermit (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        uint256 deadline,
        bytes memory signature
    ) external payable {
        if(msg.value == 0)
            revert NothingReceived();
        emit GasReceivedNativeWithToken(msg.sender, destinationChain, destinationAddress, payload, symbol, amountThrough, msg.value);
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

    function retreiveFees(address payable receiver, address[] memory tokens) external onlyOwner {
        receiver.transfer(address(this).balance);
        for(uint256 i=0;i<tokens.length; i++) {
            uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
            IERC20(tokens[i]).transfer(receiver, amount);
        }
    }


}