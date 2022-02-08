// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './interfaces/IAxelarGateway.sol';
import { IERC20 } from './interfaces/IERC20.sol';

import { BurnableMintableCappedERC20 } from './BurnableMintableCappedERC20.sol';
import { DepositHandler } from './DepositHandler.sol';
import { AdminMultisigBase } from './AdminMultisigBase.sol';

abstract contract AxelarGateway is IAxelarGateway, AdminMultisigBase {
    enum Role {
        Admin,
        Owner,
        Operator
    }

    enum TokenType {
        InternalBurnable,
        InternalBurnableFrom,
        External
    }

    /// @dev Storage slot with the address of the current factory. `keccak256('eip1967.proxy.implementation') - 1`.
    bytes32 internal constant KEY_IMPLEMENTATION =
        bytes32(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc);

    // AUDIT: slot names should be prefixed with some standard string
    // AUDIT: constants should be literal and their derivation should be in comments
    bytes32 internal constant KEY_ALL_TOKENS_FROZEN = keccak256('all-tokens-frozen');

    bytes32 internal constant PREFIX_COMMAND_EXECUTED = keccak256('command-executed');
    bytes32 internal constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');
    bytes32 internal constant PREFIX_TOKEN_TYPE = keccak256('is-token-external');
    bytes32 internal constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');
    bytes32 internal constant PREFIX_DESTINATION_CHAIN = keccak256('destination-chain');

    bytes32 internal constant SELECTOR_BURN_TOKEN = keccak256('burnToken');
    bytes32 internal constant SELECTOR_DEPLOY_TOKEN = keccak256('deployToken');
    bytes32 internal constant SELECTOR_MINT_TOKEN = keccak256('mintToken');
    bytes32 internal constant SELECTOR_TRANSFER_OPERATORSHIP = keccak256('transferOperatorship');
    bytes32 internal constant SELECTOR_TRANSFER_OWNERSHIP = keccak256('transferOwnership');
    bytes32 internal constant SELECTOR_SET_DESTINATION_CHAIN = keccak256('addDestinationChain');

    bytes32 internal constant EMPTY_HASH = keccak256('');

    uint8 internal constant OLD_KEY_RETENTION = 16;

    modifier onlySelf() {
        require(msg.sender == address(this), 'NOT_SELF');

        _;
    }

    /******************\
    |* Public Methods *|
    \******************/

    function sendToken(
        uint256 destinationChainId,
        string memory symbol,
        uint256 amount
    ) external {
        address tokenAddress = tokenAddresses(symbol);
        require(tokenAddress != address(0), 'TOKEN_NOT_EXIST');
        require(destinationChainEnabled(destinationChainId), 'UNKNOWN_CHAIN');

        TokenType tokenType = _getTokenType(symbol);
        bytes memory tokenCallData;

        if (tokenType == TokenType.External) {
            tokenCallData = abi.encodeWithSelector(IERC20.transferFrom.selector, msg.sender, address(this), amount);
        } else if (tokenType == TokenType.InternalBurnableFrom) {
            tokenCallData = abi.encodeWithSelector(BurnableMintableCappedERC20.burnFrom.selector, msg.sender, amount);
        } else if (tokenType == TokenType.InternalBurnable) {
            address depositAddress = BurnableMintableCappedERC20(tokenAddress).depositAddress(bytes32(0));
            tokenCallData = abi.encodeWithSelector(IERC20.transferFrom.selector, msg.sender, depositAddress, amount);
        }

        (bool success, bytes memory returnData) = tokenAddress.call(tokenCallData);
        require(success && (returnData.length == uint256(0) || abi.decode(returnData, (bool))), 'BURN_FAIL');

        if (tokenType == TokenType.InternalBurnable) {
            BurnableMintableCappedERC20(tokenAddress).burn(bytes32(0));
        }

        emit TokenSent(destinationChainId, symbol, amount);
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

    function tokenAddresses(string memory symbol) public view override returns (address) {
        return getAddress(_getTokenAddressKey(symbol));
    }

    function tokenFrozen(string memory symbol) public view override returns (bool) {
        return getBool(_getFreezeTokenKey(symbol));
    }

    function isCommandExecuted(bytes32 commandId) public view override returns (bool) {
        return getBool(_getIsCommandExecutedKey(commandId));
    }

    function destinationChainEnabled(uint256 destinationChainId) public view override returns (bool) {
        return getBool(_getDestinationChainKey(destinationChainId));
    }

    /*******************\
    |* Admin Functions *|
    \*******************/

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

    function upgrade(address newImplementation, bytes calldata setupParams) external override onlyAdmin {
        emit Upgraded(newImplementation);

        // AUDIT: If `newImplementation.setup` performs `selfdestruct`, it will result in the loss of _this_ implementation (thereby losing the gateway)
        //        if `upgrade` is entered within the context of _this_ implementation itself.
        if (setupParams.length > 0) {
            (bool success, ) = newImplementation.delegatecall(
                abi.encodeWithSelector(IAxelarGateway.setup.selector, setupParams)
            );
            require(success, 'SETUP_FAILED');
        }

        _setImplementation(newImplementation);
    }

    /**********************\
    |* Internal Functions *|
    \**********************/

    function _deployToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 cap,
        address tokenAddress
    ) internal {
        // Ensure that this symbol has not been taken.
        require(tokenAddresses(symbol) == address(0), 'TOKEN_EXIST');

        if (tokenAddress == address(0)) {
            // If token address is no specified, it indicates a request to deploy one.
            bytes32 salt = keccak256(abi.encodePacked(symbol));
            tokenAddress = address(new BurnableMintableCappedERC20{ salt: salt }(name, symbol, decimals, cap));
            _setTokenType(symbol, TokenType.InternalBurnableFrom);
        } else {
            // If token address is specified, ensure that there is a contact at the specified addressed.
            require(tokenAddress.codehash != EMPTY_HASH, 'NOT_TOKEN');
            // Mark that this symbol is an external token, which is needed to differentiate between operations on mint and burn.
            _setTokenType(symbol, TokenType.External);
        }

        _setTokenAddress(symbol, tokenAddress);

        emit TokenDeployed(symbol, tokenAddress);
    }

    function _mintToken(
        string memory symbol,
        address account,
        uint256 amount
    ) internal {
        address tokenAddress = tokenAddresses(symbol);
        require(tokenAddress != address(0), 'TOKEN_NOT_EXIST');

        if (_getTokenType(symbol) == TokenType.External) {
            IERC20(tokenAddress).transfer(account, amount);
        } else {
            BurnableMintableCappedERC20(tokenAddress).mint(account, amount);
        }
    }

    function _burnToken(string memory symbol, bytes32 salt) internal {
        address tokenAddress = tokenAddresses(symbol);
        require(tokenAddress != address(0), 'TOKEN_NOT_EXIST');

        if (_getTokenType(symbol) == TokenType.External) {
            DepositHandler depositHandler = new DepositHandler{ salt: salt }();

            (bool success, ) = depositHandler.execute(
                tokenAddress,
                abi.encodeWithSelector(
                    IERC20.transfer.selector,
                    address(this),
                    IERC20(tokenAddress).balanceOf(address(depositHandler))
                )
            );
            require(success, 'BURN_FAIL');

            depositHandler.destroy(address(0));
        } else {
            BurnableMintableCappedERC20(tokenAddress).burn(salt);
        }
    }

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getTokenTypeKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_TYPE, symbol));
    }

    function _getFreezeTokenKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_FROZEN, symbol));
    }

    function _getTokenAddressKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol));
    }

    function _getIsCommandExecutedKey(bytes32 commandId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId));
    }

    function _getDestinationChainKey(uint256 destinationChainId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_DESTINATION_CHAIN, destinationChainId));
    }

    /********************\
    |* Internal Getters *|
    \********************/

    function _getTokenType(string memory symbol) internal view returns (TokenType) {
        return TokenType(getUint(_getTokenTypeKey(symbol)));
    }

    function _getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    /********************\
    |* Internal Setters *|
    \********************/

    function _setTokenType(string memory symbol, TokenType tokenType) internal {
        _setUint(_getTokenTypeKey(symbol), uint256(tokenType));
    }

    function _setTokenAddress(string memory symbol, address tokenAddress) internal {
        _setAddress(_getTokenAddressKey(symbol), tokenAddress);
    }

    function _setCommandExecuted(bytes32 commandId, bool executed) internal {
        _setBool(_getIsCommandExecutedKey(commandId), executed);
    }

    function _setImplementation(address newImplementation) internal {
        _setAddress(KEY_IMPLEMENTATION, newImplementation);
    }

    function _setDestinationChain(uint256 destinationChainId, bool enabled) internal {
        _setBool(_getDestinationChainKey(destinationChainId), enabled);
    }
}
