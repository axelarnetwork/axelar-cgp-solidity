// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '../interfaces/IERC20.sol';
import { IAxelarGasReceiver } from '../interfaces/IAxelarGasReceiver.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarGasReceiver is IAxelarGasReceiver {
    // bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    // keccak256('owner');
    bytes32 internal constant _OWNER_SLOT = 0x02016836a56b71f0d02689e69e326f4f4c1b9057164ef592671cf0d37c8040c0;

    modifier onlyOwner() {
        if (owner() != msg.sender) revert NotOwner();
        _;
    }

    function owner() public view returns (address owner_) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            owner_ := sload(_OWNER_SLOT)
        }
    }

    function implementation() public view returns (address implementation_) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            implementation_ := sload(_IMPLEMENTATION_SLOT)
        }
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        _safeTransferFrom(gasToken, msg.sender, gasFeeAmount);

        emit GasPaidForContractCall(
            sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            gasToken,
            gasFeeAmount,
            refundAddress
        );
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payGasForContractCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amount,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        {
            _safeTransferFrom(gasToken, msg.sender, gasFeeAmount);
        }

        emit GasPaidForContractCallWithToken(
            sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            symbol,
            amount,
            gasToken,
            gasFeeAmount,
            refundAddress
        );
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payNativeGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address refundAddress
    ) external payable override {
        if (msg.value == 0) revert NothingReceived();

        emit NativeGasPaidForContractCall(
            sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            msg.value,
            refundAddress
        );
    }

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payNativeGasForContractCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address refundAddress
    ) external payable override {
        if (msg.value == 0) revert NothingReceived();

        emit NativeGasPaidForContractCallWithToken(
            sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            symbol,
            amount,
            msg.value,
            refundAddress
        );
    }

    function collectFees(address payable receiver, address[] calldata tokens) external onlyOwner {
        for (uint256 i; i < tokens.length; i++) {
            address token = tokens[i];

            if (token == address(0)) {
                receiver.transfer(address(this).balance);
            } else {
                uint256 amount = IERC20(token).balanceOf(address(this));
                _safeTransfer(token, receiver, amount);
            }
        }
    }

    function refund(
        address payable receiver,
        address token,
        uint256 amount
    ) external onlyOwner {
        if (token == address(0)) {
            receiver.transfer(amount);
        } else {
            _safeTransfer(token, receiver, amount);
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

    function setup(bytes calldata data) external override {
        // Prevent setup from being called on the implementation
        if (implementation() == address(0)) revert NotProxy();

        address newOwner = abi.decode(data, (address));

        if (newOwner != address(0)) {
            emit OwnershipTransferred(newOwner);
            // solhint-disable-next-line no-inline-assembly
            assembly {
                sstore(_OWNER_SLOT, newOwner)
            }
        }
    }

    function _safeTransfer(
        address tokenAddress,
        address receiver,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = tokenAddress.call(
            abi.encodeWithSelector(IERC20.transfer.selector, receiver, amount)
        );
        bool transferred = success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));

        if (!transferred) revert TransferFailed();
    }

    function _safeTransferFrom(
        address tokenAddress,
        address from,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = tokenAddress.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        bool transferred = success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));

        if (!transferred) revert TransferFailed();
    }
}
