// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

interface IAxelarGateway {

    /**********\
    |* Events *|
    \**********/

    event TokenDeployed(bytes32 indexed commandId, string indexed symbol, address tokenAddresses);

    event TokenMinted(bytes32 indexed commandId);

    event TokenBurned(bytes32 indexed commandId);

    event ContractCallApproved(bytes32 indexed commandId, address indexed contractAddress, bytes32 indexed payloadHash);

    event ContractCallApprovedWithMint(bytes32 indexed commandId, address indexed contractAddress, bytes32 indexed payloadHash, address token, uint256 amount);

    event TokenFrozen(string indexed symbol);

    event TokenUnfrozen(string indexed symbol);

    event AllTokensFrozen();

    event AllTokensUnfrozen();

    event AccountBlacklisted(address indexed account);

    event AccountWhitelisted(address indexed account);

    event Upgraded(address indexed implementation);

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

    function upgrade(address newImplementation, bytes calldata setupParams) external;

    /**********************\
    |* External Functions *|
    \**********************/

    function setup(bytes calldata params) external;

    function execute(bytes calldata input) external;
}
