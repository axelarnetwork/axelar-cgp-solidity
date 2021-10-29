// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './IAxelarGateway.sol';
import { EternalStorage } from './EternalStorage.sol';
import { BurnableMintableCappedERC20 } from './BurnableMintableCappedERC20.sol';
import { Burner } from './Burner.sol';

abstract contract AxelarGateway is IAxelarGateway, EternalStorage {
    bytes32 internal constant PREFIX_ADMIN = keccak256('admin');
    bytes32 internal constant PREFIX_ADMIN_VOTE_COUNTS =
        keccak256('admin-vote-counts');
    bytes32 internal constant PREFIX_ADMIN_VOTED = keccak256('admin-voted');
    bytes32 internal constant PREFIX_IS_ADMIN = keccak256('is-admin');
    bytes32 internal constant PREFIX_COMMAND_EXECUTED =
        keccak256('command-executed');
    bytes32 internal constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');
    bytes32 internal constant PREFIX_TOKEN_DAILY_MINT_LIMIT =
        keccak256('token-daily-mint-limit');
    bytes32 internal constant PREFIX_TOKEN_DAILY_MINT_AMOUNT =
        keccak256('token-daily-mint-amount');
    bytes32 internal constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');
    bytes32 internal constant KEY_ADMIN_INDEX = keccak256('admin-index');
    bytes32 internal constant PREFIX_ADMIN_COUNT = keccak256('admin-count');
    bytes32 internal constant PREFIX_ADMIN_THRESHOLD =
        keccak256('admin-threshold');
    bytes32 internal constant KEY_ALL_TOKENS_FROZEN =
        keccak256('all-tokens-frozen');
    bytes32 internal constant KEY_PROPOSED_UPDATE =
        keccak256('proposed-update');
    bytes32 internal constant KEY_PROPOSED_UPDATE_TIME =
        keccak256('proposed-update-block-number');
    bytes32 internal constant KEY_IMPLEMENTATION = keccak256('implementation');

    bytes32 internal constant SELECTOR_DEPLOY_TOKEN = keccak256('deployToken');
    bytes32 internal constant SELECTOR_MINT_TOKEN = keccak256('mintToken');
    bytes32 internal constant SELECTOR_BURN_TOKEN = keccak256('burnToken');
    bytes32 internal constant SELECTOR_TRANSFER_OWNERSHIP =
        keccak256('transferOwnership');
    bytes32 internal constant SELECTOR_TRANSFER_OPERATORSHIP =
        keccak256('transferOperatorship');
    bytes32 internal constant SELECTOR_UPDATE = keccak256('update');

    uint256 internal constant SECONDS_IN_A_DAY = 86400;
    uint8 internal constant OLD_KEY_RETENTION = 16;

    modifier onlyAdmins() {
        uint256 adminsIndex = getUint(KEY_ADMIN_INDEX);
        bytes32 topic = keccak256(msg.data);
        bytes32 adminVotedKey =
            keccak256(
                abi.encodePacked(
                    PREFIX_ADMIN_VOTED,
                    adminsIndex,
                    topic,
                    msg.sender
                )
            );
        bytes32 adminVoteCountsKey =
            keccak256(
                abi.encodePacked(PREFIX_ADMIN_VOTE_COUNTS, adminsIndex, topic)
            );

        require(_isAdmin(msg.sender), 'NOT_ADMIN');
        require(!getBool(adminVotedKey), 'VOTED');

        setBool(adminVotedKey, true);
        uint256 adminVoteCounts = getUint(adminVoteCountsKey);
        setUint(adminVoteCountsKey, ++adminVoteCounts);

        if (
            adminVoteCounts >=
            getUint(
                keccak256(abi.encodePacked(PREFIX_ADMIN_THRESHOLD, adminsIndex))
            )
        ) {
            _;

            setUint(adminVoteCountsKey, 0);
            for (
                uint8 i = 0;
                i <
                getUint(
                    keccak256(abi.encodePacked(PREFIX_ADMIN_COUNT, adminsIndex))
                );
                i++
            ) {
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
        require(msg.sender == address(this), 'NOT_SELF');

        _;
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

    function proposeUpdate(address newVersion, bytes memory setupParams)
        external
        override
        onlyAdmins
    {
        require(getBytes(KEY_PROPOSED_UPDATE).length == 0, 'PPS_EXIST');

        setBytes(
            KEY_PROPOSED_UPDATE,
            abi.encodePacked(newVersion, setupParams)
        );
        setUint(KEY_PROPOSED_UPDATE_TIME, block.timestamp);

        emit UpdateProposed(address(this), newVersion);
    }

    function forceUpdate(address newVersion, bytes memory setupParams)
        external
        override
    {
        require(_isAdmin(msg.sender), 'NOT_ADMIN');

        uint256 proposedUpdateTime = getUint(KEY_PROPOSED_UPDATE_TIME);
        require(
            proposedUpdateTime > 0 &&
                block.timestamp - proposedUpdateTime >= SECONDS_IN_A_DAY,
            'NO_TIMEOUT'
        );

        _update(newVersion, setupParams);
    }

    function _getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    function _isAdmin(address addr) internal view returns (bool) {
        return
            getBool(
                keccak256(
                    abi.encodePacked(
                        PREFIX_IS_ADMIN,
                        getUint(KEY_ADMIN_INDEX),
                        addr
                    )
                )
            );
    }

    function _setAdmins(address[] memory addrs, uint8 threshold) internal {
        require(addrs.length >= threshold, 'INV_ADMINS');
        require(threshold > 0, 'INV_ADMIN_THLD');

        uint256 adminsIndex = getUint(KEY_ADMIN_INDEX) + 1;

        setUint(
            keccak256(abi.encodePacked(PREFIX_ADMIN_THRESHOLD, adminsIndex)),
            threshold
        );
        setUint(
            keccak256(abi.encodePacked(PREFIX_ADMIN_COUNT, adminsIndex)),
            addrs.length
        );

        for (uint8 i = 0; i < addrs.length; i++) {
            bytes32 isAdminKey =
                keccak256(
                    abi.encodePacked(PREFIX_IS_ADMIN, adminsIndex, addrs[i])
                );
            require(!getBool(isAdminKey), 'DUP_ADMIN');

            setAddress(
                keccak256(abi.encodePacked(PREFIX_ADMIN, adminsIndex, i)),
                addrs[i]
            );
            setBool(isAdminKey, true);
        }

        setUint(KEY_ADMIN_INDEX, adminsIndex);
    }

    function _deployToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 cap
    ) internal {
        require(tokenAddresses(symbol) == address(0), 'TOKEN_EXIST');

        bytes32 salt = keccak256(abi.encodePacked(symbol));
        BurnableMintableCappedERC20 token =
            new BurnableMintableCappedERC20{ salt: salt }(
                name,
                symbol,
                decimals,
                cap
            );

        _setTokenAddress(symbol, address(token));
        emit TokenDeployed(symbol, address(token));
    }

    function _mintToken(
        string memory symbol,
        address account,
        uint256 amount
    ) internal {
        uint256 mintLimit = tokenDailyMintLimits(symbol);
        uint256 mintAmount = tokenDailyMintAmounts(symbol);
        require(
            mintLimit == 0 || mintLimit >= mintAmount + amount,
            'EXCEED_LIMIT'
        );

        address tokenAddr = tokenAddresses(symbol);
        require(tokenAddr != address(0), 'TOKEN_NOT_EXIST');
        BurnableMintableCappedERC20(tokenAddr).mint(account, amount);
        _setTokenDailyMintAmount(symbol, mintAmount + amount);
    }

    function _burnToken(string memory symbol, bytes32 salt) internal {
        address tokenAddr = tokenAddresses(symbol);
        require(tokenAddr != address(0), 'TOKEN_NOT_EXIST');

        new Burner{ salt: salt }(tokenAddr, salt);
    }

    function _update(address newVersion, bytes memory setupParams) internal {
        bytes memory proposedUpdate = getBytes(KEY_PROPOSED_UPDATE);
        require(proposedUpdate.length != 0, 'NO_PPS');
        deleteBytes(KEY_PROPOSED_UPDATE);
        deleteUint(KEY_PROPOSED_UPDATE_TIME);

        if (
            keccak256(proposedUpdate) !=
            keccak256(abi.encodePacked(newVersion, setupParams))
        ) {
            return;
        }

        (bool success, ) =
            newVersion.delegatecall(
                abi.encodeWithSelector(
                    IAxelarGateway.setup.selector,
                    setupParams
                )
            );
        require(success, 'SETUP_FAILED');

        setAddress(KEY_IMPLEMENTATION, newVersion);
        emit Updated(address(this), newVersion);
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
}
