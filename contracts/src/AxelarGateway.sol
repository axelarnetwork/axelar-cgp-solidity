// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './interfaces/IAxelarGateway.sol';

import { ECDSA } from './ECDSA.sol';
import { BurnableMintableCappedERC20 } from './BurnableMintableCappedERC20.sol';
import { Burner } from './Burner.sol';

contract AxelarGateway is IAxelarGateway {

    address public override nextVersion;

    uint8 public immutable override adminThreshold;

    address[] public override admins;

    mapping(address => bool) private _isAdmin;
    mapping(bytes32 => mapping(address => bool)) private _adminVoted;
    mapping(bytes32 => uint8) private _adminVoteCounts;
    mapping(string => bytes4) private _commandSelectors;

    uint256 private ownerCount;
    uint256 private operatorCount;

    bytes32 private constant PREFIX_OPERATOR = keccak256('operator');
    bytes32 private constant PREFIX_OWNER_INDEX = keccak256('owner-index');
    bytes32 private constant PREFIX_OPERATOR_INDEX =
        keccak256('operator-index');
    bytes32 private constant PREFIX_COMMAND_EXECUTED =
        keccak256('command-executed');
    bytes32 private constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');
    bytes32 private constant PREFIX_TOKEN_DAILY_MINT_AMOUNT =
        keccak256('token-daily-mint-amount');
    bytes32 private constant PREFIX_ACCOUNT_BLACKLISTED =
        keccak256('account-blacklisted');
    bytes32 private constant KEY_ALL_TOKENS_FROZEN =
        keccak256('all-tokens-frozen');
    bytes32 private constant KEY_PROPOSED_NEW_GATEWAY =
        keccak256('proposed-new-gateway');
    uint256 private constant SECONDS_IN_A_DAY = 86400;
    uint8 private constant OLD_KEY_RETENTION = 16;

    address public proposedNewGateway;

    bool public allTokensFrozen;

    mapping(string => uint256) public tokenDailyMintLimits;
    mapping(string => bool) public tokenFrozen;
    mapping(address => bool) public blacklisted;
    mapping(uint256 => address) public owners;

    modifier onlyAdmins() {
        bytes32 topic = keccak256(msg.data);

        require(_isAdmin[msg.sender], 'AxelarGateway: sender is not admin');
        require(
            !_adminVoted[topic][msg.sender],
            'AxelarGateway: sender already voted'
        );

        _adminVoted[topic][msg.sender] = true;

        if (++_adminVoteCounts[topic] >= adminThreshold) {
            _;

            _adminVoteCounts[topic] = 0;
            for (uint8 i = 0; i < admins.length; i++) {
                _adminVoted[topic][admins[i]] = false;
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

    constructor(
        address[] memory adminAddresses,
        uint8 threshold,
        address ownerAddr,
        address operatorAddr
    ) {
        require(
            adminAddresses.length >= threshold,
            'AxelarGateway: number of admins must be >=threshold'
        );
        require(threshold > 0, 'AxelarGateway: threshold must be >0');

        adminThreshold = threshold;
        admins = adminAddresses;

        for (uint8 i = 0; i < adminAddresses.length; i++) {
            _isAdmin[adminAddresses[i]] = true;
        }

        _setOwner(ownerAddr);
        _setOperator(operatorAddr);

        emit OwnershipTransferred(address(0), ownerAddr);
        emit OperatorshipTransferred(address(0), operatorAddr);

        _commandSelectors['deployToken'] = AxelarGateway._deployToken.selector;
        _commandSelectors['mintToken'] = AxelarGateway._mintToken.selector;
        _commandSelectors['burnToken'] = AxelarGateway._burnToken.selector;
        _commandSelectors['transferOwnership'] = AxelarGateway
            ._transferOwnership
            .selector;
        _commandSelectors['transferOperatorship'] = AxelarGateway
            ._transferOperatorship
            .selector;
        _commandSelectors['update'] = AxelarGateway._update.selector;
    }

    function setTokenDailyMintLimit(string memory symbol, uint256 limit)
        external
        onlyAdmins
    {
        emit TokenDailyMintLimitUpdated(symbol, tokenDailyMintLimits[symbol] = limit);
    }

    function freezeToken(string memory symbol) external onlyAdmins {
        tokenFrozen[symbol] = true;
        emit TokenFrozen(symbol);
    }

    function unfreezeToken(string memory symbol) external onlyAdmins {
        tokenFrozen[symbol] = false;
        emit TokenUnfrozen(symbol);
    }

    function freezeAllTokens() external onlyAdmins {
        allTokensFrozen = true;
        emit AllTokensFrozen();
    }

    function unfreezeAllTokens() external onlyAdmins {
        allTokensFrozen = false;
        emit AllTokensUnfrozen();
    }

    function blacklistAccount(address account) external onlyAdmins {
        blacklisted[account] = true;
        emit AccountBlacklisted(account);
    }

    function whitelistAccount(address account) external onlyAdmins {
        blacklisted[account] = false;
        emit AccountWhitelisted(account);
    }

    function proposeUpdate(address newVersion) external onlyAdmins {
        require(
            proposedNewGateway == address(0),
            'AxelarAdmin: new gateway already proposed'
        );

        emit UpdateProposed(address(this), proposedNewGateway = newVersion);
    }

    function execute(bytes memory input) external {
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
        require(
            nextVersion == address(0),
            'AxelarGateway: next version is set'
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

            bytes4 commandSelector = _commandSelectors[command];

            if (commandSelector == bytes4(0)) {
                continue; /* Ignore if unknown command received */
            }

            (bool success, ) =
                address(this).call(
                    abi.encodeWithSelector(commandSelector, signer, params[i])
                );
            _setCommandExecuted(commandId, success);

            // TODO: fix
            // if (nextVersion != address(0)) {
            //     return _eternalStorage.transferOwnership(nextVersion);
            // }
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
            new BurnableMintableCappedERC20{ salt: salt }(
                name,
                symbol,
                decimals,
                cap
            );
        token.setEternalStorage(address(_eternalStorage));

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

        new Burner{ salt: salt }(tokenAddr, salt);
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

        address proposedNewVersion =
            _eternalStorage.getAddress(KEY_PROPOSED_NEW_GATEWAY);
        require(
            proposedNewVersion != address(0),
            'AxelarGateway: no new version is proposed yet'
        );
        _eternalStorage.deleteAddress(KEY_PROPOSED_NEW_GATEWAY);

        if (proposedNewVersion != newVersion) {
            return;
        }

        nextVersion = newVersion;
        emit Updated(address(this), newVersion);
    }

    function _getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    function owner() public view returns (address) {
        return owners[ownerCount];
    }

    function operator() public view returns (address) {
        return
            _eternalStorage.getAddress(
                keccak256(abi.encodePacked(PREFIX_OPERATOR, operatorCount))
            );
    }

    function tokenAddresses(string memory symbol)
        public
        view
        returns (address)
    {
        return
            _eternalStorage.getAddress(
                keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol))
            );
    }

    function tokenDailyMintAmounts(string memory symbol)
        public
        view
        returns (uint256)
    {
        uint256 day = block.timestamp % SECONDS_IN_A_DAY;

        return
            _eternalStorage.getUint(
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
            _eternalStorage.getBool(
                keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId))
            );
    }

    function _isValidOwner(address addr) internal view returns (bool) {
        uint256 ownerIndex =
            _eternalStorage.getUint(
                keccak256(abi.encodePacked(PREFIX_OWNER_INDEX, addr))
            );

        return ownerIndex > 0 && (ownerCount - ownerIndex) <= OLD_KEY_RETENTION;
    }

    function _isValidOperator(address addr) internal view returns (bool) {
        uint256 operatorIndex =
            _eternalStorage.getUint(
                keccak256(abi.encodePacked(PREFIX_OPERATOR_INDEX, addr))
            );

        return
            operatorIndex > 0 &&
            (operatorCount - operatorIndex) <= OLD_KEY_RETENTION;
    }

    function _setTokenDailyMintAmount(string memory symbol, uint256 amount)
        internal
    {
        uint256 day = block.timestamp % SECONDS_IN_A_DAY;

        _eternalStorage.setUint(
            keccak256(
                abi.encodePacked(PREFIX_TOKEN_DAILY_MINT_AMOUNT, symbol, day)
            ),
            amount
        );
    }

    function _setOwner(address ownerAddr) internal {
        owners[++ownerCount];
        _eternalStorage.setUint(
            keccak256(abi.encodePacked(PREFIX_OWNER_INDEX, ownerAddr)),
            ownerCount
        );
    }

    function _setOperator(address operatorAddr) internal {
        _eternalStorage.setAddress(
            keccak256(abi.encodePacked(PREFIX_OPERATOR, ++operatorCount)),
            operatorAddr
        );
        _eternalStorage.setUint(
            keccak256(abi.encodePacked(PREFIX_OPERATOR_INDEX, operatorAddr)),
            operatorCount
        );
    }

    function _setTokenAddress(string memory symbol, address tokenAddr)
        internal
    {
        _eternalStorage.setAddress(
            keccak256(abi.encodePacked(PREFIX_TOKEN_ADDRESS, symbol)),
            tokenAddr
        );
    }

    function _setCommandExecuted(bytes32 commandId, bool executed) internal {
        _eternalStorage.setBool(
            keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId)),
            executed
        );
    }
}
