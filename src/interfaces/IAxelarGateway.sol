// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IAxelarGateway {

    /**********\
    |* Events *|
    \**********/

    event TokenSent(address indexed sender, uint256 indexed destinationChainId, string indexed destinationAddress, string symbol, uint256 amount);

    event Executed(bytes32 indexed commandId);

    event TokenDeployed(string symbol, address tokenAddresses);

    event ContractCallApproved(bytes32 indexed commandId, uint256 sourceChainId, string sourceAddress, address indexed contractAddress, bytes32 payloadHash);

    event ContractCallApprovedWithMint(bytes32 indexed commandId, uint256 sourceChainId, string sourceAddress, address indexed contractAddress, bytes32 payloadHash, string indexed symbol, uint256 amount);

    event TokenFrozen(string indexed symbol);

    event TokenUnfrozen(string indexed symbol);

    event AllTokensFrozen();

    event AllTokensUnfrozen();

    event AccountBlacklisted(address indexed account);

    event AccountWhitelisted(address indexed account);

    event Upgraded(address indexed implementation);

    /******************\
    |* Public Methods *|
    \******************/

    function sendToken(uint256 destinationChainId, string memory destinationAddress, string memory symbol, uint256 amount) external;

    /***********\
    |* Getters *|
    \***********/

    function allTokensFrozen() external view returns (bool);

    function implementation() external view returns (address);

    function tokenAddresses(string memory symbol) external view returns (address);

    function tokenFrozen(string memory symbol) external view returns (bool);

    function isCommandExecuted(bytes32 commandId) external view returns (bool);

    function validateContractCall(bytes32 commandId, uint256 sourceChainId, string memory sourceAddress, bytes32 payloadHash) external returns (bool);

    function validateContractCallAndMint(bytes32 commandId, uint256 sourceChainId, string memory sourceAddress, bytes32 payloadHash, string memory symbol, uint256 amount) external returns (bool);

    /*******************\
    |* Admin Functions *|
    \*******************/

    function freezeToken(string memory symbol) external;

    function unfreezeToken(string memory symbol) external;

    function freezeAllTokens() external;

    function unfreezeAllTokens() external;

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
