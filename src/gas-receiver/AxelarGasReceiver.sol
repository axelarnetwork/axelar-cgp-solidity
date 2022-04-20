// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '../interfaces/IERC20.sol';
import { IAxelarGasReceiver } from '../interfaces/IAxelarGasReceiver.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarGasReceiver is IAxelarGasReceiver {
    error NotOwner();

    // bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    // keccak256('owner');
    bytes32 internal constant _OWNER_SLOT = 0x02016836a56b71f0d02689e69e326f4f4c1b9057164ef592671cf0d37c8040c0;

    modifier onlyOwner() {
        if (owner() != msg.sender) revert NotOwner();
        _;
    }

    function owner() public view returns (address owner_) {
        assembly {
            owner_ := sload(_OWNER_SLOT)
        }
    }

    function setup(bytes calldata data) external override {
        address newOwner = abi.decode(data, (address));
        if (newOwner != address(0)) {
            emit OwnershipTransferred(newOwner);
            assembly {
                sstore(_OWNER_SLOT, newOwner)
            }
        }
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payGasForContractCall(
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasAmount
    ) external {
        IERC20(gasToken).transferFrom(msg.sender, address(this), gasAmount);
        emit GasPaidForContractCall(
            msg.sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            gasToken,
            gasAmount
        );
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
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
            keccak256(payload),
            symbol,
            amountThrough,
            gasToken,
            gasAmount
        );
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payNativeGasForContractCall(
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload
    ) external payable {
        if (msg.value == 0) revert NothingReceived();
        emit NativeGasPaidForContractCall(
            msg.sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            msg.value
        );
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
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
            keccak256(payload),
            symbol,
            amountThrough,
            msg.value
        );
    }

    function collectFees(address payable receiver, address[] memory tokens) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) {
                receiver.transfer(address(this).balance);
            } else {
                uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
                IERC20(tokens[i]).transfer(receiver, amount);
            }
        }
    }

    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash,
        bytes calldata params
    ) external override onlyOwner {
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
