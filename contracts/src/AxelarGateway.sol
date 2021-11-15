// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './interfaces/IAxelarGateway.sol';

import { BurnableMintableCappedERC20 } from './BurnableMintableCappedERC20.sol';
import { Burner } from './Burner.sol';
import { AdminMultisigBase } from './AdminMultisigBase.sol';

abstract contract AxelarGateway is IAxelarGateway, AdminMultisigBase {
    /// @dev Storage slot with the address of the current factory. `keccak256('eip1967.proxy.implementation') - 1`.
    bytes32 internal constant KEY_IMPLEMENTATION =
        bytes32(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc);

    // AUDIT: slot names should be prefixed with some standard string
    // AUDIT: constants should be literal and their derivation should be in comments
    bytes32 internal constant KEY_ALL_TOKENS_FROZEN = keccak256('all-tokens-frozen');
    bytes32 internal constant KEY_PROPOSED_UPDATE = keccak256('proposed-update');
    bytes32 internal constant KEY_PROPOSED_UPDATE_TIME = keccak256('proposed-update-block-number');

    bytes32 internal constant PREFIX_COMMAND_EXECUTED = keccak256('command-executed');
    bytes32 internal constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');
    bytes32 internal constant PREFIX_TOKEN_DAILY_MINT_LIMIT = keccak256('token-daily-mint-limit');
    bytes32 internal constant PREFIX_TOKEN_DAILY_MINT_AMOUNT = keccak256('token-daily-mint-amount');
    bytes32 internal constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');

    bytes32 internal constant SELECTOR_BURN_TOKEN = keccak256('burnToken');
    bytes32 internal constant SELECTOR_DEPLOY_TOKEN = keccak256('deployToken');
    bytes32 internal constant SELECTOR_MINT_TOKEN = keccak256('mintToken');
    bytes32 internal constant SELECTOR_TRANSFER_OPERATORSHIP = keccak256('transferOperatorship');
    bytes32 internal constant SELECTOR_TRANSFER_OWNERSHIP = keccak256('transferOwnership');
    bytes32 internal constant SELECTOR_UPDATE = keccak256('update');

    uint8 internal constant OLD_KEY_RETENTION = 16;

    modifier onlySelf() {
        require(msg.sender == address(this), 'NOT_SELF');

        _;
    }

    /***********\
    |* Getters *|
    \***********/

    function allTokensFrozen() public view override returns (bool) {
        return getBool(KEY_ALL_TOKENS_FROZEN);
    }

    function implementation() public view override returns (address) {
        return getAddress(KEY_IMPLEMENTATION);
    }

    function proposedUpdate() public view override returns (bytes memory) {
        return getBytes(KEY_PROPOSED_UPDATE);
    }

    function proposedUpdateTime() public view override returns (uint256) {
        return getUint(KEY_PROPOSED_UPDATE_TIME);
    }

    function tokenAddresses(string memory symbol) public view override returns (address) {
        return getAddress(_getTokenAddressKey(symbol));
    }

    function tokenDailyMintLimits(string memory symbol) public view override returns (uint256) {
        return getUint(_getTokenDailyMintLimitKey(symbol));
    }

    function tokenDailyMintAmounts(string memory symbol) public view override returns (uint256) {
        return getUint(_getTokenDailyMintAmountsKey(symbol, block.timestamp / 1 days));
    }

    function tokenFrozen(string memory symbol) public view override returns (bool) {
        return getBool(_getFreezeTokenKey(symbol));
    }

    function isCommandExecuted(bytes32 commandId) public view override returns (bool) {
        return getBool(_getIsCommandExecutedKey(commandId));
    }

    /*******************\
    |* Admin Functions *|
    \*******************/

    function setTokenDailyMintLimit(string memory symbol, uint256 limit) external override onlyAdmin {
        _setUint(_getTokenDailyMintLimitKey(symbol), limit);

        emit TokenDailyMintLimitUpdated(symbol, limit);
    }

    function freezeToken(string memory symbol) external override onlyAdmin {
        _setBool(_getFreezeTokenKey(symbol), true);

        emit TokenFrozen(symbol);
    }

    function unfreezeToken(string memory symbol) external override onlyAdmin {
        _setBool(_getFreezeTokenKey(symbol), false);

        emit TokenUnfrozen(symbol);
    }

    function freezeAllTokens() external override onlyAdmin {
        _setBool(KEY_ALL_TOKENS_FROZEN, true);

        emit AllTokensFrozen();
    }

    function unfreezeAllTokens() external override onlyAdmin {
        _setBool(KEY_ALL_TOKENS_FROZEN, false);

        emit AllTokensUnfrozen();
    }

    function proposeUpdate(address newVersion, bytes memory setupParams) external override onlyAdmin {
        require(proposedUpdate().length == uint256(0), 'PPS_EXIST');

        _setProposedUpdate(newVersion, setupParams);
        _setProposedUpdateTime(block.timestamp);

        emit UpgradeProposed(newVersion);
    }

    function forceUpdate(address newVersion, bytes memory setupParams) external override {
        require(_isAdmin(_adminEpoch(), msg.sender), 'NOT_ADMIN');

        uint256 _proposedUpdateTime = proposedUpdateTime();

        // Require that the `proposedUpdateTime` exists, and that one day has elapsed without an action to update or cancel the update.
        require((_proposedUpdateTime > 0) && (block.timestamp - _proposedUpdateTime >= 1 days), 'NO_TIMEOUT');

        _update(newVersion, setupParams);
    }

    /**********************\
    |* Internal Functions *|
    \**********************/

    function _deployToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 cap
    ) internal {
        require(tokenAddresses(symbol) == address(0), 'TOKEN_EXIST');

        bytes32 salt = keccak256(abi.encodePacked(symbol));
        address token = address(new BurnableMintableCappedERC20{ salt: salt }(name, symbol, decimals, cap));

        _setTokenAddress(symbol, token);

        emit TokenDeployed(symbol, token);
    }

    function _mintToken(
        string memory symbol,
        address account,
        uint256 amount
    ) internal {
        uint256 mintLimit = tokenDailyMintLimits(symbol);
        uint256 mintAmount = tokenDailyMintAmounts(symbol);
        require((mintLimit == uint256(0)) || (mintLimit >= mintAmount + amount), 'EXCEED_LIMIT');

        address tokenAddress = tokenAddresses(symbol);
        require(tokenAddress != address(0), 'TOKEN_NOT_EXIST');

        BurnableMintableCappedERC20(tokenAddress).mint(account, amount);
        _setTokenDailyMintAmount(symbol, mintAmount + amount);
    }

    function _burnToken(string memory symbol, bytes32 salt) internal {
        address tokenAddress = tokenAddresses(symbol);
        require(tokenAddress != address(0), 'TOKEN_NOT_EXIST');

        new Burner{ salt: salt }(tokenAddress, salt);
    }

    function _update(address newImplementation, bytes memory setupParams) internal {
        bytes memory _proposedUpdate = proposedUpdate();
        require(_proposedUpdate.length != 0, 'NO_PPS');

        _clearProposedUpdate();
        _setProposedUpdateTime(uint256(0));

        // NOTE: Any attempt to “incorrectly” update is the way to clear the pending update, since we return rather than revert.
        if (keccak256(_proposedUpdate) != keccak256(abi.encodePacked(newImplementation, setupParams))) return;

        // AUDIT: If `newImplementation.setup` performs `selfdestruct`, it will result in the loss of _this_ implementation (thereby losing the gateway)
        //        if `_update` is entered within the context of _this_ implementation itself. Consider directly calling `forceUpdate`.
        (bool success, ) =
            newImplementation.delegatecall(abi.encodeWithSelector(IAxelarGateway.setup.selector, setupParams));
        require(success, 'SETUP_FAILED');

        _setImplementation(newImplementation);

        emit Upgraded(newImplementation);
    }

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getTokenDailyMintLimitKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_DAILY_MINT_LIMIT, symbol));
    }

    function _getFreezeTokenKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_FROZEN, symbol));
    }

    function _getTokenAddressKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol));
    }

    function _getTokenDailyMintAmountsKey(string memory symbol, uint256 day) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_DAILY_MINT_AMOUNT, symbol, day));
    }

    function _getIsCommandExecutedKey(bytes32 commandId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId));
    }

    /********************\
    |* Internal Getters *|
    \********************/

    function _getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    /********************\
    |* Internal Setters *|
    \********************/

    function _setTokenDailyMintAmount(string memory symbol, uint256 amount) internal {
        _setUint(_getTokenDailyMintAmountsKey(symbol, block.timestamp / 1 days), amount);
    }

    function _setTokenAddress(string memory symbol, address tokenAddr) internal {
        _setAddress(_getTokenAddressKey(symbol), tokenAddr);
    }

    function _setCommandExecuted(bytes32 commandId, bool executed) internal {
        _setBool(_getIsCommandExecutedKey(commandId), executed);
    }

    function _setProposedUpdate(address newVersion, bytes memory setupParams) internal {
        _setBytes(KEY_PROPOSED_UPDATE, abi.encodePacked(newVersion, setupParams));
    }

    function _setProposedUpdateTime(uint256 time) internal {
        _setUint(KEY_PROPOSED_UPDATE_TIME, time);
    }

    function _setImplementation(address newImplementation) internal {
        _setAddress(KEY_IMPLEMENTATION, newImplementation);
    }

    function _clearProposedUpdate() internal {
        _deleteBytes(KEY_PROPOSED_UPDATE);
    }
}
