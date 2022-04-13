// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;



// This should be owned by the microservice that is paying for gas.
interface IAxelarGasReceiver {
    
    error NothingReceived();
    error InvalidCodeHash();
    error SetupFailed();

    event Upgraded(address newImplementation);

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

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGas (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        address gasToken,
        uint256 gasAmount
    ) external;

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGasWithToken (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough,
        address gasToken,
        uint256 gasAmount
    ) external;

    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGasNative (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload
    ) external payable;
    //This is called by contracts that do stuff on the source chain before calling a remote contract.
    function receiveGasNativeWithToken (
        string memory destinationChain,
        string memory destinationAddress,
        bytes calldata payload,
        string memory symbol,
        uint256 amountThrough
    ) external payable;

    function retreiveFees(address payable receiver, address[] memory tokens) external;
}