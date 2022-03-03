// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IAxelarGateway {

    /**********\
    |* Events *|
    \**********/

    event Executed(bytes32 indexed commandId);

    event TokenDeployed(string symbol, address tokenAddresses);

    event TokenFrozen(string indexed symbol);

    event TokenUnfrozen(string indexed symbol);

    event AllTokensFrozen();

    event AllTokensUnfrozen();

    event AccountBlacklisted(address indexed account);

    event AccountWhitelisted(address indexed account);

    event Upgraded(address indexed implementation);

    event ContractCallApproved(address indexed contractAddress, bytes32 indexed payloadHash);

    event ContractCallApprovedWithMint(address indexed contractAddress, bytes32 indexed payloadHash, address indexed token, uint256 amount);

    /***********\
    |* Getters *|
    \***********/

    function allTokensFrozen() external view returns (bool);

    function implementation() external view returns (address);

    function tokenAddresses(string memory symbol) external view returns (address);

    function tokenFrozen(string memory symbol) external view returns (bool);

    function isCommandExecuted(bytes32 commandId) external view returns (bool);

    function isContractCallApproved(address contractAddress, bytes32 payloadHash) external view returns (bool);

    function isContractCallApprovedWithMint(address contractAddress, bytes32 payloadHash, address token, uint256 amount) external view returns (bool);

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
