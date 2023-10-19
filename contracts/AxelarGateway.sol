// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol';
import { IImplementation } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IImplementation.sol';
import { IContractIdentifier } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IContractIdentifier.sol';
import { IAxelarGateway } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol';
import { SafeTokenCall, SafeTokenTransfer, SafeTokenTransferFrom } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/libs/SafeTransfer.sol';
import { ContractAddress } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/libs/ContractAddress.sol';
import { Implementation } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradable/Implementation.sol';

import { IAxelarAuth } from './interfaces/IAxelarAuth.sol';
import { IBurnableMintableCappedERC20 } from './interfaces/IBurnableMintableCappedERC20.sol';
import { ITokenDeployer } from './interfaces/ITokenDeployer.sol';

import { ECDSA } from './ECDSA.sol';
import { DepositHandler } from './DepositHandler.sol';
import { EternalStorage } from './EternalStorage.sol';

/**
 * @title AxelarGateway Contract
 * @notice This contract serves as the gateway for cross-chain contract calls,
 * and token transfers within the Axelar network.
 * It includes functions for sending tokens, calling contracts, and validating contract calls.
 * The contract is managed via the decentralized governance mechanism on the Axelar network.
 * @dev EternalStorage is used to simplify storage for upgradability, and InterchainGovernance module is used for governance.
 */
contract AxelarGateway is IAxelarGateway, Implementation, EternalStorage {
    using SafeTokenCall for IERC20;
    using SafeTokenTransfer for IERC20;
    using SafeTokenTransferFrom for IERC20;
    using ContractAddress for address;

    error InvalidImplementation();

    enum TokenType {
        InternalBurnable,
        InternalBurnableFrom,
        External
    }

    /**
     * @dev Deprecated slots. Should not be reused.
     */
    // bytes32 internal constant KEY_ALL_TOKENS_FROZEN = keccak256('all-tokens-frozen');
    // bytes32 internal constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');

    /**
     * @dev Storage slot with the address of the current implementation. `keccak256('eip1967.proxy.implementation') - 1`.
     */
    bytes32 internal constant KEY_IMPLEMENTATION = bytes32(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc);

    /**
     * @dev Storage slot with the address of the current governance. keccak256('governance')) - 1
     */
    bytes32 internal constant KEY_GOVERNANCE = bytes32(0xabea6fd3db56a6e6d0242111b43ebb13d1c42709651c032c7894962023a1f909);

    /**
     * @dev Storage slot with the address of the current mint limiter. keccak256('mint-limiter')) - 1
     */
    bytes32 internal constant KEY_MINT_LIMITER = bytes32(0x627f0c11732837b3240a2de89c0b6343512886dd50978b99c76a68c6416a4d92);

    bytes32 internal constant PREFIX_COMMAND_EXECUTED = keccak256('command-executed');
    bytes32 internal constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');
    bytes32 internal constant PREFIX_TOKEN_TYPE = keccak256('token-type');
    bytes32 internal constant PREFIX_CONTRACT_CALL_APPROVED = keccak256('contract-call-approved');
    bytes32 internal constant PREFIX_CONTRACT_CALL_APPROVED_WITH_MINT = keccak256('contract-call-approved-with-mint');
    bytes32 internal constant PREFIX_TOKEN_MINT_LIMIT = keccak256('token-mint-limit');
    bytes32 internal constant PREFIX_TOKEN_MINT_AMOUNT = keccak256('token-mint-amount');

    bytes32 internal constant SELECTOR_BURN_TOKEN = keccak256('burnToken');
    bytes32 internal constant SELECTOR_DEPLOY_TOKEN = keccak256('deployToken');
    bytes32 internal constant SELECTOR_MINT_TOKEN = keccak256('mintToken');
    bytes32 internal constant SELECTOR_APPROVE_CONTRACT_CALL = keccak256('approveContractCall');
    bytes32 internal constant SELECTOR_APPROVE_CONTRACT_CALL_WITH_MINT = keccak256('approveContractCallWithMint');
    bytes32 internal constant SELECTOR_TRANSFER_OPERATORSHIP = keccak256('transferOperatorship');

    address public immutable authModule;
    address public immutable tokenDeployer;

    /**
     * @notice Constructs the AxelarGateway contract.
     * @param authModule_ The address of the authentication module
     * @param tokenDeployer_ The address of the token deployer
     */
    constructor(address authModule_, address tokenDeployer_) {
        if (authModule_.code.length == 0) revert InvalidAuthModule();
        if (tokenDeployer_.code.length == 0) revert InvalidTokenDeployer();

        authModule = authModule_;
        tokenDeployer = tokenDeployer_;
    }

    /**
     * @notice Ensures that the caller of the function is the gateway contract itself.
     */
    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();

        _;
    }

    /**
     * @notice Ensures that the caller of the function is the governance address.
     */
    modifier onlyGovernance() {
        if (msg.sender != getAddress(KEY_GOVERNANCE)) revert NotGovernance();

        _;
    }

    /**
     * @notice Ensures that the caller of the function is either the mint limiter or governance.
     */
    modifier onlyMintLimiter() {
        if (msg.sender != getAddress(KEY_MINT_LIMITER) && msg.sender != getAddress(KEY_GOVERNANCE)) revert NotMintLimiter();

        _;
    }

    /******************\
    |* Public Methods *|
    \******************/

    /**
     * @notice Send the specified token to the destination chain and address.
     * @param destinationChain The chain to send tokens to. A registered chain name on Axelar must be used here
     * @param destinationAddress The address on the destination chain to send tokens to
     * @param symbol The symbol of the token to send
     * @param amount The amount of tokens to send
     */
    function sendToken(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata symbol,
        uint256 amount
    ) external {
        _burnTokenFrom(msg.sender, symbol, amount);
        emit TokenSent(msg.sender, destinationChain, destinationAddress, symbol, amount);
    }

    /**
     * @notice Calls a contract on the specified destination chain with a given payload.
     * This function is the entry point for general message passing between chains.
     * @param destinationChain The chain where the destination contract exists. A registered chain name on Axelar must be used here
     * @param destinationContractAddress The address of the contract to call on the destination chain
     * @param payload The payload to be sent to the destination contract, usually representing an encoded function call with arguments
     */
    function callContract(
        string calldata destinationChain,
        string calldata destinationContractAddress,
        bytes calldata payload
    ) external {
        emit ContractCall(msg.sender, destinationChain, destinationContractAddress, keccak256(payload), payload);
    }

    /**
     * @notice Calls a contract on the specified destination chain with a given payload and token amount.
     * This function is the entry point for general message passing with token transfer between chains.
     * @param destinationChain The chain where the destination contract exists. A registered chain name on Axelar must be used here
     * @param destinationContractAddress The address of the contract to call with tokens on the destination chain
     * @param payload The payload to be sent to the destination contract, usually representing an encoded function call with arguments
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     */
    function callContractWithToken(
        string calldata destinationChain,
        string calldata destinationContractAddress,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount
    ) external {
        _burnTokenFrom(msg.sender, symbol, amount);
        emit ContractCallWithToken(msg.sender, destinationChain, destinationContractAddress, keccak256(payload), payload, symbol, amount);
    }

    /**
     * @notice Checks whether a contract call has been approved by the gateway.
     * @param commandId The gateway command ID
     * @param sourceChain The source chain of the contract call
     * @param sourceAddress The source address of the contract call
     * @param contractAddress The contract address that will be called
     * @param payloadHash The hash of the payload for that will be sent with the call
     * @return bool A boolean value indicating whether the contract call has been approved by the gateway.
     */
    function isContractCallApproved(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) external view override returns (bool) {
        return getBool(_getIsContractCallApprovedKey(commandId, sourceChain, sourceAddress, contractAddress, payloadHash));
    }

    /**
     * @notice Checks whether a contract call with token has been approved by the gateway.
     * @param commandId The gateway command ID
     * @param sourceChain The source chain of the contract call
     * @param sourceAddress The source address of the contract call
     * @param contractAddress The contract address that will be called, and where tokens will be sent
     * @param payloadHash The hash of the payload for that will be sent with the call
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     * @return bool A boolean value indicating whether the contract call with token has been approved by the gateway.
     */
    function isContractCallAndMintApproved(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        string calldata symbol,
        uint256 amount
    ) external view override returns (bool) {
        return
            getBool(
                _getIsContractCallApprovedWithMintKey(commandId, sourceChain, sourceAddress, contractAddress, payloadHash, symbol, amount)
            );
    }

    /**
     * @notice Called on the destination chain gateway by the recipient of the cross-chain contract call to validate it and only allow execution
     * if this function returns true.
     * @dev Once validated, the gateway marks the message as executed so the contract call is not executed twice.
     * @param commandId The gateway command ID
     * @param sourceChain The source chain of the contract call
     * @param sourceAddress The source address of the contract call
     * @param payloadHash The hash of the payload for that will be sent with the call
     * @return valid True if the contract call is approved, false otherwise
     */
    function validateContractCall(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes32 payloadHash
    ) external override returns (bool valid) {
        bytes32 key = _getIsContractCallApprovedKey(commandId, sourceChain, sourceAddress, msg.sender, payloadHash);
        valid = getBool(key);
        if (valid) {
            _setBool(key, false);

            emit ContractCallExecuted(commandId);
        }
    }

    /**
     * @notice Called on the destination chain gateway to validate the approval of a contract call with token transfer and only
     * allow execution if this function returns true.
     * @dev Once validated, the gateway marks the message as executed so the contract call with token is not executed twice.
     * @param commandId The gateway command ID
     * @param sourceChain The source chain of the contract call
     * @param sourceAddress The source address of the contract call
     * @param payloadHash The hash of the payload for that will be sent with the call
     * @param symbol The symbol of the token to be sent with the call
     * @param amount The amount of tokens to be sent with the call
     * @return valid True if the contract call with token is approved, false otherwise
     */
    function validateContractCallAndMint(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes32 payloadHash,
        string calldata symbol,
        uint256 amount
    ) external override returns (bool valid) {
        bytes32 key = _getIsContractCallApprovedWithMintKey(commandId, sourceChain, sourceAddress, msg.sender, payloadHash, symbol, amount);
        valid = getBool(key);
        if (valid) {
            // Prevent re-entrancy
            _setBool(key, false);

            emit ContractCallExecuted(commandId);

            _mintToken(symbol, msg.sender, amount);
        }
    }

    /***********\
    |* Getters *|
    \***********/

    /**
     * @notice Gets the address of governance, should be the address of InterchainGovernance.
     * @return address The address of governance.
     */
    function governance() public view override returns (address) {
        return getAddress(KEY_GOVERNANCE);
    }

    /**
     * @notice Gets the address of the mint limiter, should be the address of Multisig.
     * @return address The address of the mint limiter.
     */
    function mintLimiter() public view override returns (address) {
        return getAddress(KEY_MINT_LIMITER);
    }

    /**
     * @notice Gets the transfer limit for a specific token symbol within the configured epoch.
     * @param symbol The symbol of the token
     * @return uint The transfer limit for the given token.
     */
    function tokenMintLimit(string memory symbol) public view override returns (uint256) {
        return getUint(_getTokenMintLimitKey(symbol));
    }

    /**
     * @notice Gets the transfer amount for a specific token symbol within the configured epoch.
     * @param symbol The symbol of the token
     * @return uint The transfer amount for the given token.
     */
    function tokenMintAmount(string memory symbol) public view override returns (uint256) {
        return getUint(_getTokenMintAmountKey(symbol, block.timestamp / 6 hours));
    }

    /**
     * @dev This function is kept around to keep things working for internal
     * tokens that were deployed before the token freeze functionality was removed
     */
    function allTokensFrozen() external pure override returns (bool) {
        return false;
    }

    /**
     * @notice Gets the address of the gateway implementation contract.
     * @return address The address of the gateway implementation.
     */
    function implementation() public view override returns (address) {
        return getAddress(KEY_IMPLEMENTATION);
    }

    /**
     * @notice Gets the address of a specific token using its symbol.
     * @param symbol The symbol of the token
     * @return address The address of the token associated with the given symbol.
     */
    function tokenAddresses(string memory symbol) public view override returns (address) {
        return getAddress(_getTokenAddressKey(symbol));
    }

    /**
     * @dev Deprecated. This function is kept around to keep things working for internal tokens that were deployed before the token freeze functionality was removed
     */
    function tokenFrozen(string memory) external pure override returns (bool) {
        return false;
    }

    /**
     * @notice Checks whether a command with a given command ID has been executed.
     * @param commandId The command ID to check
     * @return bool True if the command has been executed, false otherwise
     */
    function isCommandExecuted(bytes32 commandId) public view override returns (bool) {
        return getBool(_getIsCommandExecutedKey(commandId));
    }

    /**
     * @notice Gets the contract ID of the Axelar Gateway.
     * @return bytes32 The keccak256 hash of the string 'axelar-gateway'
     */
    function contractId() public pure returns (bytes32) {
        return keccak256('axelar-gateway');
    }

    /************************\
    |* Governance Functions *|
    \************************/

    /**
     * @notice Transfers the governance role to a new address.
     * @param newGovernance The address to transfer the governance role to.
     * @dev Only the current governance entity can call this function.
     */
    function transferGovernance(address newGovernance) external override onlyGovernance {
        if (newGovernance == address(0)) revert InvalidGovernance();

        _transferGovernance(newGovernance);
    }

    /**
     * @notice Transfers the mint limiter role to a new address.
     * @param newMintLimiter The address to transfer the mint limiter role to.
     * @dev Only the current mint limiter or the governance address can call this function.
     */
    function transferMintLimiter(address newMintLimiter) external override onlyMintLimiter {
        if (newMintLimiter == address(0)) revert InvalidMintLimiter();

        _transferMintLimiter(newMintLimiter);
    }

    /**
     * @notice Sets the transfer limits for an array of tokens.
     * @param symbols The array of token symbols to set the transfer limits for
     * @param limits The array of transfer limits corresponding to the symbols
     * @dev Only the mint limiter or the governance address can call this function.
     */
    function setTokenMintLimits(string[] calldata symbols, uint256[] calldata limits) external override onlyMintLimiter {
        uint256 length = symbols.length;
        if (length != limits.length) revert InvalidSetMintLimitsParams();

        for (uint256 i; i < length; ++i) {
            string memory symbol = symbols[i];
            uint256 limit = limits[i];

            if (tokenAddresses(symbol) == address(0)) revert TokenDoesNotExist(symbol);

            _setTokenMintLimit(symbol, limit);
        }
    }

    /**
     * @notice Upgrades the contract to a new implementation.
     * @param newImplementation The address of the new implementation
     * @param newImplementationCodeHash The code hash of the new implementation
     * @param setupParams Optional setup params for the new implementation
     * @dev Only the governance address can call this function.
     */
    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash,
        bytes calldata setupParams
    ) external override onlyGovernance {
        if (newImplementationCodeHash != newImplementation.codehash) revert InvalidCodeHash();

        if (contractId() != IContractIdentifier(newImplementation).contractId()) revert InvalidImplementation();

        emit Upgraded(newImplementation);

        _setImplementation(newImplementation);

        if (setupParams.length != 0) {
            // slither-disable-next-line controlled-delegatecall
            (bool success, ) = newImplementation.delegatecall(abi.encodeWithSelector(IImplementation.setup.selector, setupParams));

            if (!success) revert SetupFailed();
        }
    }

    /**********************\
    |* External Functions *|
    \**********************/

    /**
     * @notice Sets up the governance and mint limiter roles, and transfers operatorship if necessary.
     * This function is called by the proxy during initial deployment, and optionally called during gateway upgrades.
     * @param params The encoded parameters containing the governance and mint limiter addresses, as well as the new operator data.
     * @dev Not publicly accessible as it's overshadowed in the proxy.
     */
    function setup(bytes calldata params) external override(IImplementation, Implementation) onlyProxy {
        (address governance_, address mintLimiter_, bytes memory newOperatorsData) = abi.decode(params, (address, address, bytes));

        if (governance_ != address(0)) _transferGovernance(governance_);
        if (mintLimiter_ != address(0)) _transferMintLimiter(mintLimiter_);

        if (newOperatorsData.length != 0) {
            emit OperatorshipTransferred(newOperatorsData);

            IAxelarAuth(authModule).transferOperatorship(newOperatorsData);
        }
    }

    /**
     * @notice Executes a batch of commands signed by the Axelar network. There are a finite set of command types that can be executed.
     * @param input The encoded input containing the data for the batch of commands, as well as the proof that verifies the integrity of the data.
     * @dev Each command has a corresponding commandID that is guaranteed to be unique from the Axelar network.
     * @dev This function allows retrying a commandID if the command initially failed to be processed.
     * @dev Ignores unknown commands or duplicate commandIDs.
     * @dev Emits an Executed event for successfully executed commands.
     */
    // slither-disable-next-line cyclomatic-complexity
    function execute(bytes calldata input) external override {
        (bytes memory data, bytes memory proof) = abi.decode(input, (bytes, bytes));

        bytes32 messageHash = ECDSA.toEthSignedMessageHash(keccak256(data));

        // returns true for current operators
        // slither-disable-next-line reentrancy-no-eth
        bool allowOperatorshipTransfer = IAxelarAuth(authModule).validateProof(messageHash, proof);

        uint256 chainId;
        bytes32[] memory commandIds;
        string[] memory commands;
        bytes[] memory params;

        (chainId, commandIds, commands, params) = abi.decode(data, (uint256, bytes32[], string[], bytes[]));

        if (chainId != block.chainid) revert InvalidChainId();

        uint256 commandsLength = commandIds.length;

        if (commandsLength != commands.length || commandsLength != params.length) revert InvalidCommands();

        for (uint256 i; i < commandsLength; ++i) {
            bytes32 commandId = commandIds[i];

            // Ignore if duplicate commandId received
            if (isCommandExecuted(commandId)) continue;

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(commands[i]));

            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                commandSelector = AxelarGateway.deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                commandSelector = AxelarGateway.mintToken.selector;
            } else if (commandHash == SELECTOR_APPROVE_CONTRACT_CALL) {
                commandSelector = AxelarGateway.approveContractCall.selector;
            } else if (commandHash == SELECTOR_APPROVE_CONTRACT_CALL_WITH_MINT) {
                commandSelector = AxelarGateway.approveContractCallWithMint.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                commandSelector = AxelarGateway.burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                if (!allowOperatorshipTransfer) continue;

                allowOperatorshipTransfer = false;
                commandSelector = AxelarGateway.transferOperatorship.selector;
            } else {
                // Ignore unknown commands
                continue;
            }

            // Prevent a re-entrancy from executing this command before it can be marked as successful.
            _setCommandExecuted(commandId, true);

            // slither-disable-next-line calls-loop,reentrancy-no-eth
            (bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, params[i], commandId));

            // slither-disable-next-line reentrancy-events
            if (success) emit Executed(commandId);
            else _setCommandExecuted(commandId, false);
        }
    }

    /******************\
    |* Self Functions *|
    \******************/

    /**
     * @notice Deploys a new token or registers an existing token in the gateway contract itself.
     * @param params Encoded parameters including the token name, symbol, decimals, cap, token address, and mint limit
     * @dev If the token address is not specified, a new token is deployed and registed as InternalBurnableFrom
     * @dev If the token address is specified, the token is marked as External.
     * @dev Emits a TokenDeployed event with the symbol and token address.
     */
    function deployToken(bytes calldata params, bytes32) external onlySelf {
        (string memory name, string memory symbol, uint8 decimals, uint256 cap, address tokenAddress, uint256 mintLimit) = abi.decode(
            params,
            (string, string, uint8, uint256, address, uint256)
        );

        // Ensure that this symbol has not been taken.
        if (tokenAddresses(symbol) != address(0)) revert TokenAlreadyExists(symbol);

        _setTokenMintLimit(symbol, mintLimit);

        if (tokenAddress == address(0)) {
            // If token address is not specified, it indicates a request to deploy one.
            bytes32 salt = keccak256(abi.encodePacked(symbol));

            _setTokenType(symbol, TokenType.InternalBurnableFrom);

            // slither-disable-next-line reentrancy-no-eth,controlled-delegatecall
            (bool success, bytes memory data) = tokenDeployer.delegatecall(
                abi.encodeWithSelector(ITokenDeployer.deployToken.selector, name, symbol, decimals, cap, salt)
            );

            if (!success) revert TokenDeployFailed(symbol);

            tokenAddress = abi.decode(data, (address));
        } else {
            // If token address is specified, ensure that there is a contact at the specified address.
            if (tokenAddress.code.length == uint256(0)) revert TokenContractDoesNotExist(tokenAddress);

            // Mark that this symbol is an external token, which is needed to differentiate between operations on mint and burn.
            _setTokenType(symbol, TokenType.External);
        }

        // slither-disable-next-line reentrancy-events
        emit TokenDeployed(symbol, tokenAddress);

        _setTokenAddress(symbol, tokenAddress);
    }

    /**
     * @notice Transfers a specific amount of tokens to an account, based on the provided symbol.
     * @param params Encoded parameters including the token symbol, recipient address, and amount to mint.
     * @dev This function will revert if the token is not registered with the gatewaty.
     * @dev If the token type is External, a safe transfer is performed to the recipient account.
     * @dev If the token type is Internal (InternalBurnable or InternalBurnableFrom), the mint function is called on the token address.
     */
    function mintToken(bytes calldata params, bytes32) external onlySelf {
        (string memory symbol, address account, uint256 amount) = abi.decode(params, (string, address, uint256));

        _mintToken(symbol, account, amount);
    }

    /**
     * @notice Burns tokens of a given symbol, either through an external deposit handler or a token defined burn method.
     * @param params Encoded parameters including the token symbol and a salt value for the deposit handler
     */
    function burnToken(bytes calldata params, bytes32) external onlySelf {
        (string memory symbol, bytes32 salt) = abi.decode(params, (string, bytes32));

        address tokenAddress = tokenAddresses(symbol);

        if (tokenAddress == address(0)) revert TokenDoesNotExist(symbol);

        if (_getTokenType(symbol) == TokenType.External) {
            address depositHandlerAddress = _getCreate2Address(salt, keccak256(abi.encodePacked(type(DepositHandler).creationCode)));

            if (depositHandlerAddress.isContract()) return;

            DepositHandler depositHandler = new DepositHandler{ salt: salt }();

            (bool success, bytes memory returnData) = depositHandler.execute(
                tokenAddress,
                abi.encodeWithSelector(IERC20.transfer.selector, address(this), IERC20(tokenAddress).balanceOf(address(depositHandler)))
            );

            if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert BurnFailed(symbol);

            // NOTE: `depositHandler` must always be destroyed in the same runtime context that it is deployed.
            depositHandler.destroy(address(this));
        } else {
            IBurnableMintableCappedERC20(tokenAddress).burn(salt);
        }
    }

    /**
     * @notice Approves a contract call.
     * @param params Encoded parameters including the source chain, source address, contract address, payload hash, transaction hash, and event index
     * @param commandId to associate with the approval
     */
    function approveContractCall(bytes calldata params, bytes32 commandId) external onlySelf {
        (
            string memory sourceChain,
            string memory sourceAddress,
            address contractAddress,
            bytes32 payloadHash,
            bytes32 sourceTxHash,
            uint256 sourceEventIndex
        ) = abi.decode(params, (string, string, address, bytes32, bytes32, uint256));

        _setContractCallApproved(commandId, sourceChain, sourceAddress, contractAddress, payloadHash);
        emit ContractCallApproved(commandId, sourceChain, sourceAddress, contractAddress, payloadHash, sourceTxHash, sourceEventIndex);
    }

    /**
     * @notice Approves a contract call with token transfer.
     * @param params Encoded parameters including the source chain, source address, contract address, payload hash, token symbol,
     * token amount, transaction hash, and event index.
     * @param commandId to associate with the approval
     */
    function approveContractCallWithMint(bytes calldata params, bytes32 commandId) external onlySelf {
        (
            string memory sourceChain,
            string memory sourceAddress,
            address contractAddress,
            bytes32 payloadHash,
            string memory symbol,
            uint256 amount,
            bytes32 sourceTxHash,
            uint256 sourceEventIndex
        ) = abi.decode(params, (string, string, address, bytes32, string, uint256, bytes32, uint256));

        _setContractCallApprovedWithMint(commandId, sourceChain, sourceAddress, contractAddress, payloadHash, symbol, amount);
        emit ContractCallApprovedWithMint(
            commandId,
            sourceChain,
            sourceAddress,
            contractAddress,
            payloadHash,
            symbol,
            amount,
            sourceTxHash,
            sourceEventIndex
        );
    }

    /**
     * @notice Transfers operatorship with the provided data by calling the transferOperatorship function on the auth module.
     * @param newOperatorsData Encoded data for the new operators
     */
    function transferOperatorship(bytes calldata newOperatorsData, bytes32) external onlySelf {
        emit OperatorshipTransferred(newOperatorsData);

        IAxelarAuth(authModule).transferOperatorship(newOperatorsData);
    }

    /********************\
    |* Internal Methods *|
    \********************/

    function _mintToken(
        string memory symbol,
        address account,
        uint256 amount
    ) internal {
        address tokenAddress = tokenAddresses(symbol);

        if (tokenAddress == address(0)) revert TokenDoesNotExist(symbol);

        _setTokenMintAmount(symbol, tokenMintAmount(symbol) + amount);

        if (_getTokenType(symbol) == TokenType.External) {
            IERC20(tokenAddress).safeTransfer(account, amount);
        } else {
            IBurnableMintableCappedERC20(tokenAddress).mint(account, amount);
        }
    }

    /**
     * @notice Burns or locks a specific amount of tokens from a sender's account based on the provided symbol.
     * @param sender Address of the account from which to burn the tokens
     * @param symbol Symbol of the token to burn
     * @param amount Amount of tokens to burn
     * @dev Depending on the token type (External, InternalBurnableFrom, or InternalBurnable), the function either
     * transfers the tokens to gateway contract itself or calls a burn function on the token contract.
     */
    function _burnTokenFrom(
        address sender,
        string memory symbol,
        uint256 amount
    ) internal {
        address tokenAddress = tokenAddresses(symbol);

        if (tokenAddress == address(0)) revert TokenDoesNotExist(symbol);
        if (amount == 0) revert InvalidAmount();

        TokenType tokenType = _getTokenType(symbol);

        if (tokenType == TokenType.External) {
            IERC20(tokenAddress).safeTransferFrom(sender, address(this), amount);
        } else if (tokenType == TokenType.InternalBurnableFrom) {
            IERC20(tokenAddress).safeCall(abi.encodeWithSelector(IBurnableMintableCappedERC20.burnFrom.selector, sender, amount));
        } else {
            IERC20(tokenAddress).safeTransferFrom(sender, IBurnableMintableCappedERC20(tokenAddress).depositAddress(bytes32(0)), amount);
            IBurnableMintableCappedERC20(tokenAddress).burn(bytes32(0));
        }
    }

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getTokenMintLimitKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_MINT_LIMIT, symbol));
    }

    function _getTokenMintAmountKey(string memory symbol, uint256 day) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_TOKEN_MINT_AMOUNT, symbol, day));
    }

    function _getTokenTypeKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_TYPE, symbol));
    }

    function _getTokenAddressKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol));
    }

    function _getIsCommandExecutedKey(bytes32 commandId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId));
    }

    function _getIsContractCallApprovedKey(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_CONTRACT_CALL_APPROVED, commandId, sourceChain, sourceAddress, contractAddress, payloadHash));
    }

    function _getIsContractCallApprovedWithMintKey(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        string memory symbol,
        uint256 amount
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    PREFIX_CONTRACT_CALL_APPROVED_WITH_MINT,
                    commandId,
                    sourceChain,
                    sourceAddress,
                    contractAddress,
                    payloadHash,
                    symbol,
                    amount
                )
            );
    }

    /********************\
    |* Internal Getters *|
    \********************/

    function _getCreate2Address(bytes32 salt, bytes32 codeHash) internal view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }

    function _getTokenType(string memory symbol) internal view returns (TokenType) {
        return TokenType(getUint(_getTokenTypeKey(symbol)));
    }

    /********************\
    |* Internal Setters *|
    \********************/

    function _setTokenMintLimit(string memory symbol, uint256 limit) internal {
        emit TokenMintLimitUpdated(symbol, limit);

        _setUint(_getTokenMintLimitKey(symbol), limit);
    }

    function _setTokenMintAmount(string memory symbol, uint256 amount) internal {
        uint256 limit = tokenMintLimit(symbol);
        if (limit > 0 && amount > limit) revert ExceedMintLimit(symbol);

        _setUint(_getTokenMintAmountKey(symbol, block.timestamp / 6 hours), amount);
    }

    function _setTokenType(string memory symbol, TokenType tokenType) internal {
        _setUint(_getTokenTypeKey(symbol), uint256(tokenType));
    }

    function _setTokenAddress(string memory symbol, address tokenAddress) internal {
        _setAddress(_getTokenAddressKey(symbol), tokenAddress);
    }

    function _setCommandExecuted(bytes32 commandId, bool executed) internal {
        _setBool(_getIsCommandExecutedKey(commandId), executed);
    }

    function _setContractCallApproved(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) internal {
        _setBool(_getIsContractCallApprovedKey(commandId, sourceChain, sourceAddress, contractAddress, payloadHash), true);
    }

    function _setContractCallApprovedWithMint(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        string memory symbol,
        uint256 amount
    ) internal {
        _setBool(
            _getIsContractCallApprovedWithMintKey(commandId, sourceChain, sourceAddress, contractAddress, payloadHash, symbol, amount),
            true
        );
    }

    function _setImplementation(address newImplementation) internal {
        _setAddress(KEY_IMPLEMENTATION, newImplementation);
    }

    function _transferGovernance(address newGovernance) internal {
        emit GovernanceTransferred(getAddress(KEY_GOVERNANCE), newGovernance);

        _setAddress(KEY_GOVERNANCE, newGovernance);
    }

    function _transferMintLimiter(address newMintLimiter) internal {
        emit MintLimiterTransferred(getAddress(KEY_MINT_LIMITER), newMintLimiter);

        _setAddress(KEY_MINT_LIMITER, newMintLimiter);
    }
}
