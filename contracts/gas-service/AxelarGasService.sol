// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { SafeTokenTransfer, SafeTokenTransferFrom, SafeNativeTransfer } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/SafeTransfer.sol';
import { IAxelarGasService } from '../interfaces/IAxelarGasService.sol';
import { Upgradable } from '../util/Upgradable.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarGasService is Upgradable, IAxelarGasService {
    using SafeTokenTransfer for IERC20;
    using SafeTokenTransferFrom for IERC20;
    using SafeNativeTransfer for address payable;

    address public immutable gasCollector;

    constructor(address gasCollector_) {
        gasCollector = gasCollector_;
    }

    modifier onlyCollector() {
        if (msg.sender != gasCollector) revert NotCollector();

        _;
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
        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);

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
        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);

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

        emit NativeGasPaidForContractCall(sender, destinationChain, destinationAddress, keccak256(payload), msg.value, refundAddress);
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

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payGasForExpressCallWithToken(
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
        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);

        emit GasPaidForExpressCallWithToken(
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
    function payNativeGasForExpressCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address refundAddress
    ) external payable override {
        if (msg.value == 0) revert NothingReceived();

        emit NativeGasPaidForExpressCallWithToken(
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

    // This can be called on the source chain after calling the gateway to execute a remote contract.
    function addGas(
        bytes32 txHash,
        uint256 logIndex,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);

        emit GasAdded(txHash, logIndex, gasToken, gasFeeAmount, refundAddress);
    }

    function addNativeGas(
        bytes32 txHash,
        uint256 logIndex,
        address refundAddress
    ) external payable override {
        if (msg.value == 0) revert NothingReceived();

        emit NativeGasAdded(txHash, logIndex, msg.value, refundAddress);
    }

    // This can be called on the source chain after calling the gateway to express execute a remote contract.
    function addExpressGas(
        bytes32 txHash,
        uint256 logIndex,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);

        emit ExpressGasAdded(txHash, logIndex, gasToken, gasFeeAmount, refundAddress);
    }

    // This can be called on the source chain after calling the gateway to express execute a remote contract.
    function addNativeExpressGas(
        bytes32 txHash,
        uint256 logIndex,
        address refundAddress
    ) external payable override {
        if (msg.value == 0) revert NothingReceived();

        emit NativeExpressGasAdded(txHash, logIndex, msg.value, refundAddress);
    }

    function collectFees(
        address payable receiver,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyCollector {
        if (receiver == address(0)) revert InvalidAddress();

        uint256 tokensLength = tokens.length;
        if (tokensLength != amounts.length) revert InvalidAmounts();

        for (uint256 i; i < tokensLength; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            if (amount == 0) revert InvalidAmounts();

            if (token == address(0)) {
                if (amount <= address(this).balance) receiver.safeNativeTransfer(amount);
            } else {
                if (amount <= IERC20(token).balanceOf(address(this))) IERC20(token).safeTransfer(receiver, amount);
            }
        }
    }

    // deprecated
    function refund(
        address payable receiver,
        address token,
        uint256 amount
    ) external onlyCollector {
        _refund(bytes32(0), 0, receiver, token, amount);
    }

    function refund(
        bytes32 txHash,
        uint256 logIndex,
        address payable receiver,
        address token,
        uint256 amount
    ) external onlyCollector {
        _refund(txHash, logIndex, receiver, token, amount);
    }

    function _refund(
        bytes32 txHash,
        uint256 logIndex,
        address payable receiver,
        address token,
        uint256 amount
    ) private {
        if (receiver == address(0)) revert InvalidAddress();

        if (token == address(0)) {
            receiver.safeNativeTransfer(amount);
        } else {
            IERC20(token).safeTransfer(receiver, amount);
        }

        emit Refunded(txHash, logIndex, receiver, token, amount);
    }

    function contractId() external pure returns (bytes32) {
        return keccak256('axelar-gas-service');
    }
}
