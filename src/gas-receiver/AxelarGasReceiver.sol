// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '../interfaces/IERC20.sol';
import { Ownable } from '../Ownable.sol';
import { IAxelarGasReceiver } from '../interfaces/IAxelarGasReceiver.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarGasReceiver is IAxelarGasReceiver, Ownable {
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    // solhint-disable-next-line no-empty-blocks
    constructor() Ownable() {}

    function setup(bytes calldata data) public {
        (owner) = abi.decode(data, (address));
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function payGasForContractCall(
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasPaidForContractCall(msg.sender, destinationChain, destinationAddress, payload, gasToken, gasAmount);
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function payGasForContractCallWithToken(
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasPaidForContractCallWithToken(
            msg.sender,
            destinationChain,
            destinationAddress,
            payload,
            symbol,
            amountThrough,
            gasToken,
            gasAmount
        );
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function payNativeGasForContractCall(
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload
    ) external payable {
        if (msg.value == 0) revert NothingReceived();
        emit NativeGasPaidForContractCall(msg.sender, destinationChain, destinationAddress, payload, msg.value);
    }

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function payNativeGasForContractCallWithToken(
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough
    ) external payable {
        if (msg.value == 0) revert NothingReceived();
        emit NativeGasPaidForContractCallWithToken(
            msg.sender,
            destinationChain,
            destinationAddress,
            payload,
            symbol,
            amountThrough,
            msg.value
        );
    }

    function retrieveFees(address payable receiver, address[] memory tokens) external onlyOwner {
        receiver.transfer(address(this).balance);
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
            IERC20(tokens[i]).transfer(receiver, amount);
        }
    }

    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash,
        bytes calldata params
    ) external onlyOwner {
        if (newImplementationCodeHash != newImplementation.codehash) revert InvalidCodeHash();
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = newImplementation.delegatecall(abi.encodeWithSelector(this.setup.selector, params));

        if (!success) revert SetupFailed();

        emit Upgraded(newImplementation);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(_IMPLEMENTATION_SLOT, newImplementation)
        }
    }
}
