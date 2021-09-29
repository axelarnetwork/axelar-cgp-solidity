// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

interface IAxelarGateway {
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event OperatorshipTransferred(
        address indexed previousOperator,
        address indexed newOperator
    );
    event TokenDeployed(string symbol, address tokenAddresses);
    event TokenDailyMintLimitUpdated(string indexed symbol, uint256 limit);
    event TokenFrozen(string indexed symbol);
    event TokenUnfrozen(string indexed symbol);
    event AllTokensFrozen();
    event AllTokensUnfrozen();
    event AccountBlacklisted(address indexed account);
    event AccountWhitelisted(address indexed account);
    event UpdateProposed(
        address indexed oldVersion,
        address indexed newVersion
    );
    event Updated(address indexed oldVersion, address indexed newVersion);

    function setTokenDailyMintLimit(string memory symbol, uint256 limit)
        external;

    function freezeToken(string memory symbol) external;

    function unfreezeToken(string memory symbol) external;

    function freezeAllTokens() external;

    function unfreezeAllTokens() external;

    function blacklistAccount(address account) external;

    function whitelistAccount(address account) external;

    function proposeUpdate(address newVersion) external;

    function execute(bytes memory input) external;

    function owner() external view returns (address);

    function operator() external view returns (address);

    function tokenAddresses(string memory symbol)
        external
        view
        returns (address);

    function tokenDailyMintLimits(string memory symbol)
        external
        view
        returns (uint256);

    function tokenDailyMintAmounts(string memory symbol)
        external
        view
        returns (uint256);
}
