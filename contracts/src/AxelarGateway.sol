// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import './ECDSA.sol';
import './BurnableMintableCappedERC20.sol';
import './Burner.sol';

contract AxelarGateway {
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event OperatorshipTransferred(
        address indexed previousOperator,
        address indexed newOperator
    );

    event TokenDeployed(string symbol, address tokenAddress);

    address public prevOwner;
    address public owner;
    address public operator;
    address public prevOperator;

    mapping(string => bytes4) private _commandSelectors;
    mapping(string => address) private _commandAddresses;
    mapping(bytes32 => bool) private _commandExecuted;

    mapping(string => address) public tokenAddresses;

    modifier onlySelf() {
        require(
            msg.sender == address(this),
            'AxelarGateway: caller is not self'
        );

        _;
    }

    constructor(address operatorAddr) {
        owner = msg.sender;
        operator = operatorAddr;

        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorshipTransferred(address(0), operatorAddr);

        _commandSelectors['deployToken'] = AxelarGateway._deployToken.selector;
        _commandSelectors['mintToken'] = AxelarGateway._mintToken.selector;
        _commandSelectors['burnToken'] = AxelarGateway._burnToken.selector;
        _commandSelectors['transferOwnership'] = AxelarGateway._transferOwnership.selector;
        _commandSelectors['transferOperatorship'] = AxelarGateway._transferOperatorship.selector;

        _commandAddresses['deployToken'] = address(this);
        _commandAddresses['mintToken'] = address(this);
        _commandAddresses['burnToken'] = address(this);
        _commandAddresses['transferOwnership'] = address(this);
        _commandAddresses['transferOperatorship'] = address(this);
    }

    function execute(bytes memory input) public {
        (bytes memory data, bytes memory sig) =
            abi.decode(input, (bytes, bytes));

        _execute(data, sig);
    }

    function _execute(bytes memory data, bytes memory sig) internal {
        address signer =
            ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), sig);

        require(
            signer == operator ||
            signer == owner ||
            signer == prevOperator ||
            signer == prevOwner,
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

            if (_commandExecuted[commandId]) {
                continue; /* Ignore if duplicate commandId received */
            }

            address commandAddress = _commandAddresses[command];
            bytes4 commandSelector = _commandSelectors[command];

            if (commandAddress == address(0) || commandSelector == bytes4(0)) {
                continue; /* Ignore if unknown command received */
            }

            (bool success, bytes memory result) =
                commandAddress.call(
                    abi.encodeWithSelector(commandSelector, signer, params[i])
                );

            require(
                success,
                string(
                    abi.encodePacked(
                        'AxelarGateway: command failed with error: ',
                        result
                    )
                )
            );

            _commandExecuted[commandId] = true;
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
            tokenAddresses[symbol] == address(0),
            'AxelarGateway: token already deployed'
        );

        require(
            signer == owner || signer == prevOwner,
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

        emit TokenDeployed(symbol, tokenAddresses[symbol] = address(token));
    }

    function _mintToken(address, bytes memory params) external onlySelf {
        (string memory symbol, address account, uint256 amount) =
            abi.decode(params, (string, address, uint256));

        address tokenAddress = tokenAddresses[symbol];
        require(
            tokenAddress != address(0),
            'AxelarGateway: token not deployed'
        );

        BurnableMintableCappedERC20(tokenAddress).mint(account, amount);
    }

    function _burnToken(address, bytes memory params) external onlySelf {
        (string memory symbol, bytes32 salt) =
            abi.decode(params, (string, bytes32));

        address tokenAddress = tokenAddresses[symbol];
        require(
            tokenAddress != address(0),
            'AxelarGateway: token not deployed'
        );

        new Burner{salt: salt}(tokenAddress, salt);
    }

    function _transferOwnership(address signer, bytes memory params)
        external
        onlySelf
    {
        address newOwner = abi.decode(params, (address));

        require(
            newOwner != address(0),
            'AxelarGateway: new owner is the zero address'
        );
        
        require(
            signer == owner,
            'AxelarGateway: only current owner can transfer ownership'
        );

        emit OwnershipTransferred(owner, newOwner);

        prevOwner = owner;
        owner = newOwner;
    }

    function _transferOperatorship(address signer, bytes memory params)
        external
        onlySelf
    {
        address newOperator = abi.decode(params, (address));

        require(
            newOperator != address(0),
            'AxelarGateway: new operator is the zero address'
        );
        require(
            signer == owner,
            'AxelarGateway: only current owner can transfer operatorship'
        );

        emit OperatorshipTransferred(operator, newOperator);

        prevOperator = operator;
        operator = newOperator;
    }

    function _getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }
}
