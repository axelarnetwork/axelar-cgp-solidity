// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import {ECDSA} from './ECDSA.sol';
import {BurnableMintableCappedERC20} from './BurnableMintableCappedERC20.sol';
import {Burner} from './Burner.sol';
import {IAxelarGateway} from './IAxelarGateway.sol';
import {EternalStorage} from './EternalStorage.sol';

contract AxelarGateway is IAxelarGateway, EternalStorage {
    bytes32 private constant PREFIX_ADMIN = keccak256('admin');
    bytes32 private constant PREFIX_ADMIN_VOTE_COUNTS =
        keccak256('admin-vote-counts');
    bytes32 private constant PREFIX_ADMIN_VOTED = keccak256('admin-voted');
    bytes32 private constant PREFIX_IS_ADMIN = keccak256('is-admin');
    bytes32 private constant PREFIX_OWNER = keccak256('owner');
    bytes32 private constant PREFIX_OPERATOR = keccak256('operator');
    bytes32 private constant PREFIX_OWNER_INDEX = keccak256('owner-index');
    bytes32 private constant PREFIX_OPERATOR_INDEX =
        keccak256('operator-index');
    bytes32 private constant PREFIX_COMMAND_EXECUTED =
        keccak256('command-executed');
    bytes32 private constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');
    bytes32 private constant PREFIX_TOKEN_DAILY_MINT_LIMIT =
        keccak256('token-daily-mint-limit');
    bytes32 private constant PREFIX_TOKEN_DAILY_MINT_AMOUNT =
        keccak256('token-daily-mint-amount');
    bytes32 private constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');
    bytes32 private constant PREFIX_ACCOUNT_BLACKLISTED =
        keccak256('account-blacklisted');
    bytes32 KEY_INITIALIZED = keccak256('initialized');
    bytes32 KEY_ADMIN_COUNT = keccak256('admin-count');
    bytes32 KEY_ADMIN_THRESHOLD = keccak256('admin-threshold');
    bytes32 private constant KEY_ALL_TOKENS_FROZEN =
        keccak256('all-tokens-frozen');
    bytes32 private constant KEY_PROPOSED_NEW_GATEWAY =
        keccak256('proposed-new-gateway');
    bytes32 private constant KEY_OWNER_COUNT = keccak256('owner-count');
    bytes32 private constant KEY_OPERATOR_COUNT = keccak256('operator-count');
    bytes32 private constant KEY_IMPLEMENTATION = keccak256('implementation');

    bytes32 private constant SELECTOR_DEPLOY_TOKEN = keccak256('deployToken');
    bytes32 private constant SELECTOR_MINT_TOKEN = keccak256('mintToken');
    bytes32 private constant SELECTOR_BURN_TOKEN = keccak256('burnToken');
    bytes32 private constant SELECTOR_TRANSFER_OWNERSHIP =
        keccak256('transferOwnership');
    bytes32 private constant SELECTOR_TRANSFER_OPERATORSHIP =
        keccak256('transferOperatorship');
    bytes32 private constant SELECTOR_UPDATE = keccak256('update');

    uint256 private constant SECONDS_IN_A_DAY = 86400;
    uint8 private constant OLD_KEY_RETENTION = 16;

    modifier onlyAdmins() {
        bytes32 topic = keccak256(msg.data);
        bytes32 adminVotedKey =
            keccak256(abi.encodePacked(PREFIX_ADMIN_VOTED, topic, msg.sender));
        bytes32 adminVoteCountsKey =
            keccak256(abi.encodePacked(PREFIX_ADMIN_VOTE_COUNTS, topic));

        require(
            getBool(keccak256(abi.encodePacked(PREFIX_IS_ADMIN, msg.sender))),
            'AxelarGateway: sender is not admin'
        );
        require(!getBool(adminVotedKey), 'AxelarGateway: sender already voted');

        setBool(adminVotedKey, true);
        uint256 adminVoteCounts = getUint(adminVoteCountsKey);
        setUint(adminVoteCountsKey, ++adminVoteCounts);

        emit Debug(adminVoteCounts);

        if (adminVoteCounts >= getUint(KEY_ADMIN_THRESHOLD)) {
            _;

            setUint(adminVoteCountsKey, 0);
            for (uint8 i = 0; i < getUint(KEY_ADMIN_COUNT); i++) {
                address admin =
                    getAddress(keccak256(abi.encodePacked(PREFIX_ADMIN, i)));
                setBool(
                    keccak256(
                        abi.encodePacked(PREFIX_ADMIN_VOTED, topic, admin)
                    ),
                    false
                );
            }
        }
    }

    modifier onlySelf() {
        require(
            msg.sender == address(this),
            'AxelarGateway: caller is not self'
        );

        _;
    }

    function init(
        address[] memory adminAddrs,
        uint256 threshold,
        address ownerAddr,
        address operatorAddr
    ) external {
        require(
            !getBool(KEY_INITIALIZED),
            'AxelarGateway: already initialized'
        );
        require(
            adminAddrs.length >= threshold,
            'AxelarGateway: number of admins must be >=threshold'
        );
        require(threshold > 0, 'AxelarGateway: threshold must be >0');

        setUint(KEY_ADMIN_THRESHOLD, threshold);
        setUint(KEY_ADMIN_COUNT, adminAddrs.length);

        for (uint8 i = 0; i < adminAddrs.length; i++) {
            setAddress(
                keccak256(abi.encodePacked(PREFIX_ADMIN, i)),
                adminAddrs[i]
            );
            setBool(
                keccak256(abi.encodePacked(PREFIX_IS_ADMIN, adminAddrs[i])),
                true
            );
        }

        _setOwner(ownerAddr);
        _setOperator(operatorAddr);

        emit OwnershipTransferred(address(0), ownerAddr);
        emit OperatorshipTransferred(address(0), operatorAddr);

        setBool(KEY_INITIALIZED, true);
    }

    function setTokenDailyMintLimit(string memory symbol, uint256 limit)
        external
        override
        onlyAdmins
    {
        setUint(
            keccak256(abi.encodePacked(PREFIX_TOKEN_DAILY_MINT_LIMIT, symbol)),
            limit
        );

        emit TokenDailyMintLimitUpdated(symbol, limit);
    }

    function freezeToken(string memory symbol) external override onlyAdmins {
        setBool(keccak256(abi.encodePacked(PREFIX_TOKEN_FROZEN, symbol)), true);

        emit TokenFrozen(symbol);
    }

    function unfreezeToken(string memory symbol) external override onlyAdmins {
        setBool(
            keccak256(abi.encodePacked(PREFIX_TOKEN_FROZEN, symbol)),
            false
        );

        emit TokenUnfrozen(symbol);
    }

    function freezeAllTokens() external override onlyAdmins {
        setBool(KEY_ALL_TOKENS_FROZEN, true);

        emit AllTokensFrozen();
    }

    function unfreezeAllTokens() external override onlyAdmins {
        setBool(KEY_ALL_TOKENS_FROZEN, false);

        emit AllTokensUnfrozen();
    }

    function blacklistAccount(address account) external override onlyAdmins {
        setBool(
            keccak256(abi.encodePacked(PREFIX_ACCOUNT_BLACKLISTED, account)),
            true
        );

        emit AccountBlacklisted(account);
    }

    function whitelistAccount(address account) external override onlyAdmins {
        setBool(
            keccak256(abi.encodePacked(PREFIX_ACCOUNT_BLACKLISTED, account)),
            false
        );

        emit AccountWhitelisted(account);
    }

    function proposeUpdate(address newVersion) external override onlyAdmins {
        require(
            getAddress(KEY_PROPOSED_NEW_GATEWAY) == address(0),
            'AxelarAdmin: new gateway already proposed'
        );

        setAddress(KEY_PROPOSED_NEW_GATEWAY, newVersion);
        emit UpdateProposed(address(this), newVersion);
    }

    function execute(bytes memory input) external override {
        (bytes memory data, bytes memory sig) =
            abi.decode(input, (bytes, bytes));

        _execute(data, sig);
    }

    function _execute(bytes memory data, bytes memory sig) internal {
        address signer =
            ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), sig);

        require(
            _isValidOwner(signer) || _isValidOperator(signer),
            'AxelarGateway: signer is not owner or operator'
        );

        (
            uint256 chainId,
            bytes32[] memory commandIds,
            string[] memory commands,
            bytes[] memory params
        ) = abi.decode(data, (uint256, bytes32[], string[], bytes[]));

        require(
            chainId == _getChainID(),
            'AxelarGateway: signed chain ID mismatch'
        );

        uint256 commandsLength = commandIds.length;

        require(
            commandsLength == commands.length &&
                commandsLength == params.length,
            'AxelarGateway: commands params length mismatch'
        );

        for (uint256 i = 0; i < commandsLength; i++) {
            bytes32 commandId = commandIds[i];
            string memory command = commands[i];

            if (_isCommandExecuted(commandId)) {
                continue; /* Ignore if duplicate commandId received */
            }

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(command));
            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                commandSelector = AxelarGateway._deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                commandSelector = AxelarGateway._mintToken.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                commandSelector = AxelarGateway._burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OWNERSHIP) {
                commandSelector = AxelarGateway._transferOwnership.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                commandSelector = AxelarGateway._transferOperatorship.selector;
            } else if (commandHash == SELECTOR_UPDATE) {
                commandSelector = AxelarGateway._update.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            (bool success, ) =
                address(this).call(
                    abi.encodeWithSelector(commandSelector, signer, params[i])
                );
            _setCommandExecuted(commandId, success);
        }
    }

    function _deployToken(address signer, bytes memory params)
        external
        onlySelf
    {
        (
            string memory name,
            string memory symbol,
            uint8 decimals,
            uint256 cap
        ) = abi.decode(params, (string, string, uint8, uint256));

        require(
            tokenAddresses(symbol) == address(0),
            'AxelarGateway: token already deployed'
        );
        require(
            _isValidOwner(signer),
            'AxelarGateway: only owner can deploy token'
        );

        bytes32 salt = keccak256(abi.encodePacked(symbol));
        BurnableMintableCappedERC20 token =
            new BurnableMintableCappedERC20{salt: salt}(
                name,
                symbol,
                decimals,
                cap
            );

        _setTokenAddress(symbol, address(token));
        emit TokenDeployed(symbol, address(token));
    }

    function _mintToken(address, bytes memory params) external onlySelf {
        (string memory symbol, address account, uint256 amount) =
            abi.decode(params, (string, address, uint256));

        uint256 mintLimit = tokenDailyMintLimits(symbol);
        uint256 mintAmount = tokenDailyMintAmounts(symbol);
        require(
            mintLimit == 0 || mintLimit >= mintAmount + amount,
            'AxelarGateway: mint amount exceeds daily limit'
        );

        address tokenAddr = tokenAddresses(symbol);
        require(tokenAddr != address(0), 'AxelarGateway: token not deployed');

        BurnableMintableCappedERC20(tokenAddr).mint(account, amount);
        _setTokenDailyMintAmount(symbol, mintAmount + amount);
    }

    function _burnToken(address, bytes memory params) external onlySelf {
        (string memory symbol, bytes32 salt) =
            abi.decode(params, (string, bytes32));

        address tokenAddr = tokenAddresses(symbol);
        require(tokenAddr != address(0), 'AxelarGateway: token not deployed');

        new Burner{salt: salt}(tokenAddr, salt);
    }

    function _transferOwnership(address signer, bytes memory params)
        external
        onlySelf
    {
        address newOwner = abi.decode(params, (address));
        address currOwner = owner();

        require(
            newOwner != address(0),
            'AxelarGateway: new owner is the zero address'
        );
        require(
            signer == currOwner,
            'AxelarGateway: only current owner can transfer ownership'
        );

        emit OwnershipTransferred(currOwner, newOwner);

        _setOwner(newOwner);
    }

    function _transferOperatorship(address signer, bytes memory params)
        external
        onlySelf
    {
        address newOperator = abi.decode(params, (address));
        address currOperator = operator();

        require(
            newOperator != address(0),
            'AxelarGateway: new operator is the zero address'
        );
        require(
            signer == owner(),
            'AxelarGateway: only current owner can transfer operatorship'
        );

        emit OperatorshipTransferred(currOperator, newOperator);

        _setOperator(newOperator);
    }

    function _update(address signer, bytes memory params) external onlySelf {
        address newVersion = abi.decode(params, (address));

        require(
            signer == owner(),
            'AxelarGateway: only current owner can update'
        );

        address proposedNewVersion = getAddress(KEY_PROPOSED_NEW_GATEWAY);
        require(
            proposedNewVersion != address(0),
            'AxelarGateway: no new version is proposed yet'
        );
        deleteAddress(KEY_PROPOSED_NEW_GATEWAY);

        if (proposedNewVersion != newVersion) {
            return;
        }

        setAddress(KEY_IMPLEMENTATION, newVersion);
        emit Updated(address(this), newVersion);
    }

    function _getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    function owner() public view override returns (address) {
        return
            getAddress(
                keccak256(abi.encodePacked(PREFIX_OWNER, _getOwnerCount()))
            );
    }

    function operator() public view override returns (address) {
        return
            getAddress(
                keccak256(
                    abi.encodePacked(PREFIX_OPERATOR, _getOperatorCount())
                )
            );
    }

    function tokenAddresses(string memory symbol)
        public
        view
        override
        returns (address)
    {
        return
            getAddress(
                keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol))
            );
    }

    function tokenDailyMintLimits(string memory symbol)
        public
        view
        override
        returns (uint256)
    {
        return
            getUint(
                keccak256(
                    abi.encodePacked(PREFIX_TOKEN_DAILY_MINT_LIMIT, symbol)
                )
            );
    }

    function tokenDailyMintAmounts(string memory symbol)
        public
        view
        override
        returns (uint256)
    {
        uint256 day = block.timestamp % SECONDS_IN_A_DAY;

        return
            getUint(
                keccak256(
                    abi.encodePacked(
                        PREFIX_TOKEN_DAILY_MINT_AMOUNT,
                        symbol,
                        day
                    )
                )
            );
    }

    function _isCommandExecuted(bytes32 commandId)
        internal
        view
        returns (bool)
    {
        return
            getBool(
                keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId))
            );
    }

    function _isValidOwner(address addr) internal view returns (bool) {
        uint256 ownerIndex =
            getUint(keccak256(abi.encodePacked(PREFIX_OWNER_INDEX, addr)));

        return
            ownerIndex > 0 &&
            (_getOwnerCount() - ownerIndex) <= OLD_KEY_RETENTION;
    }

    function _isValidOperator(address addr) internal view returns (bool) {
        uint256 operatorIndex =
            getUint(keccak256(abi.encodePacked(PREFIX_OPERATOR_INDEX, addr)));

        return
            operatorIndex > 0 &&
            (_getOperatorCount() - operatorIndex) <= OLD_KEY_RETENTION;
    }

    function _setTokenDailyMintAmount(string memory symbol, uint256 amount)
        internal
    {
        uint256 day = block.timestamp % SECONDS_IN_A_DAY;

        setUint(
            keccak256(
                abi.encodePacked(PREFIX_TOKEN_DAILY_MINT_AMOUNT, symbol, day)
            ),
            amount
        );
    }

    function _setOwner(address ownerAddr) internal {
        uint256 ownerCount = _getOwnerCount();
        setAddress(
            keccak256(abi.encodePacked(PREFIX_OWNER, ++ownerCount)),
            ownerAddr
        );
        setUint(
            keccak256(abi.encodePacked(PREFIX_OWNER_INDEX, ownerAddr)),
            ownerCount
        );
        setUint(KEY_OWNER_COUNT, ownerCount);
    }

    function _setOperator(address operatorAddr) internal {
        uint256 operatorCount = _getOperatorCount();
        setAddress(
            keccak256(abi.encodePacked(PREFIX_OPERATOR, ++operatorCount)),
            operatorAddr
        );
        setUint(
            keccak256(abi.encodePacked(PREFIX_OPERATOR_INDEX, operatorAddr)),
            operatorCount
        );
        setUint(KEY_OPERATOR_COUNT, operatorCount);
    }

    function _setTokenAddress(string memory symbol, address tokenAddr)
        internal
    {
        setAddress(
            keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol)),
            tokenAddr
        );
    }

    function _setCommandExecuted(bytes32 commandId, bool executed) internal {
        setBool(
            keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId)),
            executed
        );
    }

    function _getOwnerCount() internal view returns (uint256) {
        return getUint(KEY_OWNER_COUNT);
    }

    function _getOperatorCount() internal view returns (uint256) {
        return getUint(KEY_OPERATOR_COUNT);
    }
}
