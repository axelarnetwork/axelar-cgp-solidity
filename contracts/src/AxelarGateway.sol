// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import './ECDSA.sol';
import './BurnableMintableCappedERC20.sol';

contract AxelarGateway {
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event TokenDeployed(string symbol, address tokenAddress);

    address private _owner;

    mapping(string => bytes4) private _commandSelectors;
    mapping(string => address) private _commandAddresses;
    mapping(bytes32 => bool) private _commandExecuted;

    mapping(string => address) private _tokenAddresses;

    modifier onlySignedByOwner(bytes memory data, bytes memory sig) {
        address signer =
            ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), sig);
        require(signer == _owner, 'AxelarGateway: signer is not owner');

        _;
    }

    modifier onlySelf() {
        require(
            msg.sender == address(this),
            'AxelarGateway: caller is not self'
        );

        _;
    }

    constructor() {
        address msgSender = msg.sender;
        _owner = msgSender;

        emit OwnershipTransferred(address(0), msgSender);

        _commandSelectors['deployToken'] = bytes4(
            keccak256(bytes('_deployToken(bytes)'))
        );
        _commandSelectors['mintToken'] = bytes4(
            keccak256(bytes('_mintToken(bytes)'))
        );
        _commandSelectors['transferOwnership'] = bytes4(
            keccak256(bytes('_transferOwnership(bytes)'))
        );

        _commandAddresses['deployToken'] = address(this);
        _commandAddresses['mintToken'] = address(this);
        _commandAddresses['transferOwnership'] = address(this);
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function tokenAddresses(string memory symbol)
        public
        view
        returns (address)
    {
        return _tokenAddresses[symbol];
    }

    function execute(bytes memory input) public {
        (bytes memory data, bytes memory sig) =
            abi.decode(input, (bytes, bytes));

        _execute(data, sig);
    }

    function _execute(bytes memory data, bytes memory sig)
        internal
        onlySignedByOwner(data, sig)
    {
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
            bytes memory param = params[i];

            if (_commandExecuted[commandId]) {
                continue; /* Ignore if duplicate commandId received */
            }

            address commandAddress = _commandAddresses[command];
            bytes4 commandSelector = _commandSelectors[command];

            if (commandAddress == address(0) || commandSelector == bytes4(0)) {
                continue; /* Ignore if unknown command received */
            }

            (bool success, ) =
                commandAddress.call(
                    abi.encodeWithSelector(commandSelector, param)
                );
            require(success, 'AxelarGateway: command failed');

            _commandExecuted[commandId] = true;
        }
    }

    function _deployToken(bytes memory params) external onlySelf {
        (
            string memory name,
            string memory symbol,
            uint8 decimals,
            uint256 cap
        ) = abi.decode(params, (string, string, uint8, uint256));

        require(
            _tokenAddresses[symbol] == address(0),
            'AxelarGateway: token already deployed'
        );

        BurnableMintableCappedERC20 token =
            new BurnableMintableCappedERC20(name, symbol, decimals, cap);
        address tokenAddress = address(token);
        _tokenAddresses[symbol] = tokenAddress;

        emit TokenDeployed(symbol, tokenAddress);
    }

    function _mintToken(bytes memory params) external onlySelf {
        (string memory symbol, address account, uint256 amount) =
            abi.decode(params, (string, address, uint256));

        address tokenAddress = _tokenAddresses[symbol];
        require(
            tokenAddress != address(0),
            'AxelarGateway: token not deployed'
        );

        BurnableMintableCappedERC20(tokenAddress).mint(account, amount);
    }

    function _transferOwnership(bytes memory params) external onlySelf {
        address newOwner = abi.decode(params, (address));

        require(
            newOwner != address(0),
            'AxelarGateway: new owner is the zero address'
        );

        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    function _getChainID() internal view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }

        return id;
    }
}
