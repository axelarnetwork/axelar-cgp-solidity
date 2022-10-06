// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IAxelarGatewayBatched {
    /**********\
    |* Errors *|
    \**********/

    error NotSelf();
    error NotProxy();
    error InvalidCodeHash();
    error SetupFailed();
    error InvalidAuthModule();
    error InvalidTokenDeployer();
    error InvalidAmount();
    error InvalidChainId();
    error InvalidCommands();
    error TokenDoesNotExist(string symbol);
    error TokenAlreadyExists(string symbol);
    error TokenDeployFailed(string symbol);
    error TokenContractDoesNotExist(address token);
    error BurnFailed(string symbol);
    error MintFailed(string symbol);
    error InvalidSetMintLimitsParams();
    error ExceedMintLimit(string symbol);

    /**********\
    |* Events *|
    \**********/

    event ContractCall(
        address indexed sender,
        string destinationChain,
        bytes destinationContractAddress,
        bytes32 indexed payloadHash,
        bytes payload,
        uint256 nonce
    );

    event Executed(bytes32 indexed commandId);

    event OperatorshipTransferred(bytes newOperatorsData);

    event Upgraded(address indexed implementation);

    /***********\
    |* Structs *|
    \***********/

    struct ProofLevel {
        uint256 index;
        uint256[] array;
    }

    struct Proof {
        uint256 batchStart;
        uint256 batchEnd;
        uint256 leafSize;
        uint256 nonce;
        ProofLevel[] levels;
    }

    /********************\
    |* Public Functions *|
    \********************/

    function callContract(
        string calldata destinationChain,
        bytes calldata contractAddress,
        bytes calldata payload
    ) external;

    function isContractCallValid(
        string calldata sourceChain,
        bytes calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        Proof calldata proof
    ) external view returns (bool);

    function validateContractCall(
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes32 payloadHash,
        Proof calldata proof
    ) external returns (bool);

    /***********\
    |* Getters *|
    \***********/

    function authModule() external view returns (address);

    function implementation() external view returns (address);

    function isCommandExecuted(bytes32 commandId) external view returns (bool);

    function adminEpoch() external view returns (uint256);

    function adminThreshold(uint256 epoch) external view returns (uint256);

    function admins(uint256 epoch) external view returns (address[] memory);

    function getNonce() external view returns (uint256);

    function getOutgoingCall(uint256 nonce) external view returns (uint256);

    function getCalls(uint256 from, uint256 to) external view returns (uint256[] memory);

    function getCallsHash(
        uint256 from,
        uint256 to,
        uint256 leafSize
    ) external view returns (bytes32);

    function isContractCallExecuted(string calldata sourceChain, uint256 nonce) external view returns (bool);

    function isIncomingCallsHashValid(string calldata sourceChain, bytes32 callsHash) external view returns (bool);

    function getProof(
        uint256 from,
        uint256 to,
        uint256 leafSize,
        uint256 nonce_
    ) external view returns (Proof memory);

    /*******************\
    |* Admin Functions *|
    \*******************/

    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash,
        bytes calldata setupParams
    ) external;

    /**********************\
    |* External Functions *|
    \**********************/

    function setup(bytes calldata params) external;

    function execute(bytes calldata input) external;
}
