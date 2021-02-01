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
            bytes32 commandId,
            string memory command,
            bytes memory params
        ) = abi.decode(data, (uint256, bytes32, string, bytes));

        require(
            chainId == _getChainID(),
            'AxelarGateway: signed chain ID mismatch'
        );

        if (_commandExecuted[commandId]) {
            return; /* Ignore if duplicate commandId received */
        }

        address commandAddress = _commandAddresses[command];
        bytes4 commandSelector = _commandSelectors[command];

        require(
            commandAddress != address(0) && commandSelector != bytes4(0),
            'AxelarGateway: unknown command'
        );

        (bool success, ) =
            commandAddress.call(
                abi.encodeWithSelector(commandSelector, params)
            );

        require(success, 'AxelarGateway: command failed');

        _commandExecuted[commandId] = true;
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
        (
            bytes32[] memory symbols,
            address[] memory addresses,
            uint256[] memory amounts
        ) = abi.decode(params, (bytes32[], address[], uint256[]));

        require(
            addresses.length == amounts.length,
            'AxelarGateway: mint addresses and amounts length mismatch'
        );

        for (uint256 i = 0; i < addresses.length; i++) {
            address tokenAddress =
                _tokenAddresses[_bytes32ToString(symbols[i])];
            require(
                tokenAddress != address(0),
                'AxelarGateway: token not deployed'
            );

            BurnableMintableCappedERC20(tokenAddress).mint(
                addresses[i],
                amounts[i]
            );
        }
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

    function _bytes32ToString(bytes32 _bytes32)
        internal
        pure
        returns (string memory)
    {
        uint8 i = 0;

        while (i < 32 && _bytes32[i] != 0) {
            i++;
        }

        bytes memory bytesArray = new bytes(i);

        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }

        return string(bytesArray);
    }
}
