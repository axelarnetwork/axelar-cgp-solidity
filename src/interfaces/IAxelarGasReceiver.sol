// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

// This should be owned by the microservice that is paying for gas.
interface IAxelarGasReceiver {
    error NotOwner();
    error TransferFailed();
    error NothingReceived();
    error InvalidCodeHash();
    error SetupFailed();
    error NotProxy();

    event Upgraded(address indexed newImplementation);
    event OwnershipTransferred(address indexed newOwner);

    event GasPaidForContractCall(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes32 payloadHash,
        address gasToken,
        uint256 gasFeeAmount
    );

    event GasPaidForContractCallWithToken(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes32 payloadHash,
        string symbol,
        uint256 amount,
        address gasToken,
        uint256 gasFeeAmount
    );

    event NativeGasPaidForContractCall(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes32 payloadHash,
        uint256 gasFeeAmount
    );

    event NativeGasPaidForContractCallWithToken(
        address sourceAddress,
        string destinationChain,
        string destinationAddress,
        bytes32 payloadHash,
        string symbol,
        uint256 amount,
        uint256 gasFeeAmount
    );

    // Get current owner
    function owner() external view returns (address);

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasFeeAmount
    ) external;

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payGasForContractCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address gasToken,
        uint256 gasFeeAmount
    ) external;

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payNativeGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload
    ) external payable;

    // This is called on the source chain before calling the gateway to execute a remote contract.
    function payNativeGasForContractCallWithToken(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount
    ) external payable;

    function collectFees(address payable receiver, address[] calldata tokens) external;

    function setup(bytes calldata data) external;

    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash,
        bytes calldata params
    ) external;
}
