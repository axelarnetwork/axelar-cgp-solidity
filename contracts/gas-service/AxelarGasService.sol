// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { SafeTokenTransfer, SafeTokenTransferFrom } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/libs/SafeTransfer.sol';
import { SafeNativeTransfer } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/libs/SafeNativeTransfer.sol';
import { IAxelarGasService } from '../interfaces/IAxelarGasService.sol';
import { Upgradable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradable/Upgradable.sol';

/**
 * @title AxelarGasService
 * @notice This contract manages gas payments and refunds for cross-chain communication on the Axelar network.
 * @dev The owner address of this contract should be the microservice that pays for gas.
 * @dev Users pay gas for cross-chain calls, and the gasCollector can collect accumulated fees and/or refund users if needed.
 */
contract AxelarGasService is Upgradable, IAxelarGasService {
    using SafeTokenTransfer for IERC20;
    using SafeTokenTransferFrom for IERC20;
    using SafeNativeTransfer for address payable;

    // keccak256('AxelarGasService.Slot')
    bytes32 internal constant GAS_SERVICE_SLOT = 0xd459c0b7e6061d4aec439527195755f10037071779c06d41e3859330a05b6aef;

    address public immutable gasCollector;

    struct GasServiceStorage {
        mapping(string => GasInfo) gasPrices;
    }

    /**
     * @notice Constructs the AxelarGasService contract.
     * @param gasCollector_ The address of the gas collector
     */
    constructor(address gasCollector_) {
        gasCollector = gasCollector_;
    }

    /**
     * @notice Modifier that ensures the caller is the designated gas collector.
     */
    modifier onlyCollector() {
        if (msg.sender != gasCollector) revert NotCollector();

        _;
    }

    /**
     * @notice Pay for gas using ERC20 tokens for a contract call on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call
     * @param gasToken The address of the ERC20 token used to pay for gas
     * @param gasFeeAmount The amount of tokens to pay for gas
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function payGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        emit GasPaidForContractCall(
            sender,
            destinationChain,
            destinationAddress,
            keccak256(payload),
            gasToken,
            gasFeeAmount,
            refundAddress
        );

        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);
    }

    /**
     * @notice Pay for gas using ERC20 tokens for a contract call with tokens on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call with tokens will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call with tokens
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     * @param gasToken The address of the ERC20 token used to pay for gas
     * @param gasFeeAmount The amount of tokens to pay for gas
     * @param refundAddress The address where refunds, if any, should be sent
     */
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

        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);
    }

    /**
     * @notice Pay for gas using native currency for a contract call on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function payNativeGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address refundAddress
    ) external payable override {
        emit NativeGasPaidForContractCall(sender, destinationChain, destinationAddress, keccak256(payload), msg.value, refundAddress);
    }

    /**
     * @notice Pay for gas using native currency for a contract call with tokens on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call with tokens will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call with tokens
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function payNativeGasForContractCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address refundAddress
    ) external payable override {
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

    /**
     * @notice Pay for gas using ERC20 tokens for an express contract call on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to express execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call
     * @param gasToken The address of the ERC20 token used to pay for gas
     * @param gasFeeAmount The amount of tokens to pay for gas
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function payGasForExpressCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        emit GasPaidForExpressCall(sender, destinationChain, destinationAddress, keccak256(payload), gasToken, gasFeeAmount, refundAddress);

        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);
    }

    /**
     * @notice Pay for gas using ERC20 tokens for an express contract call with tokens on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to express execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call with tokens will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call with tokens
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     * @param gasToken The address of the ERC20 token used to pay for gas
     * @param gasFeeAmount The amount of tokens to pay for gas
     * @param refundAddress The address where refunds, if any, should be sent
     */
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

        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);
    }

    /**
     * @notice Pay for gas using native currency for an express contract call on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function payNativeGasForExpressCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address refundAddress
    ) external payable override {
        emit NativeGasPaidForExpressCall(sender, destinationChain, destinationAddress, keccak256(payload), msg.value, refundAddress);
    }

    /**
     * @notice Pay for gas using native currency for an express contract call with tokens on a destination chain.
     * @dev This function is called on the source chain before calling the gateway to execute a remote contract.
     * @param sender The address making the payment
     * @param destinationChain The target chain where the contract call with tokens will be made
     * @param destinationAddress The target address on the destination chain
     * @param payload Data payload for the contract call with tokens
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function payNativeGasForExpressCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address refundAddress
    ) external payable override {
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

    /**
     * @notice Add additional gas payment using ERC20 tokens after initiating a cross-chain call.
     * @dev This function can be called on the source chain after calling the gateway to execute a remote contract.
     * @param txHash The transaction hash of the cross-chain call
     * @param logIndex The log index for the cross-chain call
     * @param gasToken The ERC20 token address used to add gas
     * @param gasFeeAmount The amount of tokens to add as gas
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function addGas(
        bytes32 txHash,
        uint256 logIndex,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        emit GasAdded(txHash, logIndex, gasToken, gasFeeAmount, refundAddress);

        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);
    }

    /**
     * @notice Add additional gas payment using native currency after initiating a cross-chain call.
     * @dev This function can be called on the source chain after calling the gateway to execute a remote contract.
     * @param txHash The transaction hash of the cross-chain call
     * @param logIndex The log index for the cross-chain call
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function addNativeGas(
        bytes32 txHash,
        uint256 logIndex,
        address refundAddress
    ) external payable override {
        emit NativeGasAdded(txHash, logIndex, msg.value, refundAddress);
    }

    /**
     * @notice Add additional gas payment using ERC20 tokens after initiating an express cross-chain call.
     * @dev This function can be called on the source chain after calling the gateway to express execute a remote contract.
     * @param txHash The transaction hash of the cross-chain call
     * @param logIndex The log index for the cross-chain call
     * @param gasToken The ERC20 token address used to add gas
     * @param gasFeeAmount The amount of tokens to add as gas
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function addExpressGas(
        bytes32 txHash,
        uint256 logIndex,
        address gasToken,
        uint256 gasFeeAmount,
        address refundAddress
    ) external override {
        emit ExpressGasAdded(txHash, logIndex, gasToken, gasFeeAmount, refundAddress);

        IERC20(gasToken).safeTransferFrom(msg.sender, address(this), gasFeeAmount);
    }

    /**
     * @notice Add additional gas payment using native currency after initiating an express cross-chain call.
     * @dev This function can be called on the source chain after calling the gateway to express execute a remote contract.
     * @param txHash The transaction hash of the cross-chain call
     * @param logIndex The log index for the cross-chain call
     * @param refundAddress The address where refunds, if any, should be sent
     */
    function addNativeExpressGas(
        bytes32 txHash,
        uint256 logIndex,
        address refundAddress
    ) external payable override {
        emit NativeExpressGasAdded(txHash, logIndex, msg.value, refundAddress);
    }

    /**
     * @notice Updates the gas price for a specific chain.
     * @dev This function is called by the gas oracle to update the gas price for a specific chain.
     * @param chain The name of the chain
     * @param gasInfo The gas info for the chain
     */
    function updateGasInfo(string calldata chain, GasInfo calldata gasInfo) external onlyCollector {
        _gasServiceStorage().gasPrices[chain] = gasInfo;
    }

    /**
     * @notice Estimates the gas fee for a contract call on a destination chain.
     * @param destinationChain Axelar registered name of the destination chain
     * param destinationAddress Destination contract address being called
     * @param executionGasLimit The gas limit to be used for the destination contract execution,
     *        e.g. pass in 200k if your app consumes needs upto 200k for this contract call
     * @return gasEstimate The cross-chain gas estimate, in terms of source chain's native gas token that should be forwarded to the gas service.
     */
    function estimateGasFee(
        string calldata destinationChain,
        string calldata, /* destinationAddress */
        bytes calldata payload,
        uint256 executionGasLimit
    ) external view returns (uint256 gasEstimate) {
        GasServiceStorage storage slot = _gasServiceStorage();
        GasInfo storage gasInfo = slot.gasPrices[destinationChain];

        gasEstimate = gasInfo.baseFee + (executionGasLimit * gasInfo.relativeGasPrice);

        // if chain is L2, compute L1 data fee using ethereum gas price info
        if (gasInfo.hasL1ToL2Fee) {
            gasEstimate += computeL1ToL2Fee(payload, slot.gasPrices['ethereum'].relativeGasPrice);
        }
    }

    // use optimism-like approx L1 gas estimate
    function computeL1ToL2Fee(bytes calldata payload, uint256 l1GasPrice) internal view returns (uint256) {
        // upper bounds for gas estimate
        uint256 fixedOverhead = 200;
        uint256 dynamicOverheadMultiplier = 7; // 0.7
        uint256 dynamicOverheadDivisor = 10;

        uint256 zeroBytesCount;
        uint256 nonZeroBytesCount;
        for (uint256 i = 0; i < payload.length; i++) {
            if (payload[i] == 0) {
                zeroBytesCount += 1;
            } else {
                nonZeroBytesCount += 1;
            }
        }

        uint256 txDataGas = zeroBytesCount * 4 + nonZeroBytesCount * 16;
        uint256 txTotalGas = ((txDataGas + fixedOverhead) * dynamicOverheadMultiplier) / dynamicOverheadDivisor;
        uint256 l1DataFee = txTotalGas * block.basefee;
        return l1DataFee * l1GasPrice;
    }

    /**
     * @notice Allows the gasCollector to collect accumulated fees from the contract.
     * @dev Use address(0) as the token address for native currency.
     * @param receiver The address to receive the collected fees
     * @param tokens Array of token addresses to be collected
     * @param amounts Array of amounts to be collected for each respective token address
     */
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
                // slither-disable-next-line calls-loop
                if (amount <= IERC20(token).balanceOf(address(this))) IERC20(token).safeTransfer(receiver, amount);
            }
        }
    }

    /**
     * @dev Deprecated refund function, kept for backward compatibility.
     */
    function refund(
        address payable receiver,
        address token,
        uint256 amount
    ) external onlyCollector {
        _refund(bytes32(0), 0, receiver, token, amount);
    }

    /**
     * @notice Refunds gas payment to the receiver in relation to a specific cross-chain transaction.
     * @dev Only callable by the gasCollector.
     * @dev Use address(0) as the token address to refund native currency.
     * @param txHash The transaction hash of the cross-chain call
     * @param logIndex The log index for the cross-chain call
     * @param receiver The address to receive the refund
     * @param token The token address to be refunded
     * @param amount The amount to refund
     */
    function refund(
        bytes32 txHash,
        uint256 logIndex,
        address payable receiver,
        address token,
        uint256 amount
    ) external onlyCollector {
        _refund(txHash, logIndex, receiver, token, amount);
    }

    /**
     * @dev Internal function to implement gas refund logic.
     */
    function _refund(
        bytes32 txHash,
        uint256 logIndex,
        address payable receiver,
        address token,
        uint256 amount
    ) private {
        if (receiver == address(0)) revert InvalidAddress();

        emit Refunded(txHash, logIndex, receiver, token, amount);

        if (token == address(0)) {
            receiver.safeNativeTransfer(amount);
        } else {
            IERC20(token).safeTransfer(receiver, amount);
        }
    }

    /**
     * @notice Returns a unique identifier for the contract.
     * @return bytes32 Hash of the contract identifier
     */
    function contractId() external pure returns (bytes32) {
        return keccak256('axelar-gas-service');
    }

    /**
     * @notice Get the storage slot for the GasServiceStorage struct
     */
    function _gasServiceStorage() private pure returns (GasServiceStorage storage slot) {
        assembly {
            slot.slot := GAS_SERVICE_SLOT
        }
    }
}
