// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

interface IAxelarGateway {

    /**********\
    |* Events *|
    \**********/

    event TokenDeployed(string symbol, address tokenAddresses);

    event TokenDailyMintLimitUpdated(string indexed symbol, uint256 limit);

    event TokenFrozen(string indexed symbol);

    event TokenUnfrozen(string indexed symbol);

    event AllTokensFrozen();

    event AllTokensUnfrozen();

    event AccountBlacklisted(address indexed account);

    event AccountWhitelisted(address indexed account);

    event UpgradeProposed(address indexed oldVersion, address indexed newVersion);

    event Upgraded(address indexed implementation);

    /***********\
    |* Getters *|
    \***********/

    function allTokensFrozen() external view returns (bool);

    function implementation() external view returns (address);

    function proposedUpdate() external view returns (bytes memory);

    function proposedUpdateTime() external view returns (uint256);

    function tokenAddresses(string memory symbol) external view returns (address);

    function tokenDailyMintLimits(string memory symbol) external view returns (uint256);

    function tokenDailyMintAmounts(string memory symbol) external view returns (uint256);

    function tokenFrozen(string memory symbol) external view returns (bool);

    function isCommandExecuted(bytes32 commandId) external view returns (bool);

    /*******************\
    |* Admin Functions *|
    \*******************/

    function setTokenDailyMintLimit(string memory symbol, uint256 limit) external;

    function freezeToken(string memory symbol) external;

    function unfreezeToken(string memory symbol) external;

    function freezeAllTokens() external;

    function unfreezeAllTokens() external;

    function proposeUpdate(address newVersion, bytes memory setupParams) external;

    function forceUpdate(address newVersion, bytes memory setupParams) external;

    /**********************\
    |* External Functions *|
    \**********************/

    function setup(bytes memory params) external;

    function execute(bytes memory input) external;

}
