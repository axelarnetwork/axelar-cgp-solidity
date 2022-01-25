// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

interface IAxelarGateway {

    enum ContractCallHashKey { WithToken, WithoutToken }

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

    event MintedAndContractCallApproved(address contractAddress, ContractCallHashKey hashKey, string symbol, uint256 amount, bytes32 payloadHash);

    event ContractCallApproved(address contractAddress, ContractCallHashKey hashKey, bytes32 payloadHash);

    /***********\
    |* Getters *|
    \***********/

    function allTokensFrozen() external view returns (bool);

    function implementation() external view returns (address);

    function tokenAddresses(string memory symbol) external view returns (address);

    function tokenFrozen(string memory symbol) external view returns (bool);

    function isCommandExecuted(bytes32 commandId) external view returns (bool);

    function isContractCallApproved(address contractAddress, bytes32 payloadHash) external view returns (bool);

    /*******************\
    |* Admin Functions *|
    \*******************/

    function freezeToken(string memory symbol) external;

    function unfreezeToken(string memory symbol) external;

    function freezeAllTokens() external;

    function unfreezeAllTokens() external;

    function upgrade(address newImplementation, bytes calldata setupParams) external;

    /**********************\
    |* External Functions *|
    \**********************/

    function setup(bytes calldata params) external;

    function execute(bytes calldata input) external;
}
