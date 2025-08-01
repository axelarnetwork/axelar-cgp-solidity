// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITokenDeployer {
    function deployToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 cap,
        bytes32 salt
    ) external returns (address);
}

contract TestTokenDeployer is ITokenDeployer {
    event TokenDeployed(address tokenAddress, string symbol);

    function deployToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 cap,
        bytes32 salt
    ) external returns (address) {
        address tokenAddress = address(uint160(uint256(salt)));
        emit TokenDeployed(tokenAddress, symbol);
        return tokenAddress;
    }
}

contract TestComplexMemoryPatterns {
    event TestEvent(string message, bool success);
    event TokenMintLimitUpdated(string symbol, uint256 limit);
    event TokenDeployed(string symbol, address tokenAddress);
    event DebugError(bytes32 indexed commandId, bytes errorData);

    // Mimic EternalStorage pattern
    mapping(bytes32 => uint256) private _uintStorage;
    mapping(bytes32 => address) private _addressStorage;
    mapping(bytes32 => bool) private _boolStorage;

    address public tokenDeployer;
    bytes32 public constant PREFIX_TOKEN_MINT_LIMIT = keccak256('token-mint-limit');
    bytes32 public constant PREFIX_TOKEN_TYPE = keccak256('token-type');
    bytes32 public constant PREFIX_TOKEN_ADDRESS = keccak256('token-address');

    enum TokenType {
        InternalBurnable,
        InternalBurnableFrom,
        External
    }

    constructor(address _tokenDeployer) {
        tokenDeployer = _tokenDeployer;
    }

    // Mimic the exact deployToken function from AxelarGateway
    function deployToken(bytes calldata params, bytes32 commandId) external {
        emit DebugError(commandId, abi.encode('deployToken called', 'TEST'));

        // Complex parameter decoding - mimics AxelarGateway exactly
        (string memory name, string memory symbol, uint8 decimals, uint256 cap, address tokenAddress, uint256 mintLimit) = abi.decode(
            params,
            (string, string, uint8, uint256, address, uint256)
        );

        // Multiple state changes - mimics _setTokenMintLimit
        emit TokenMintLimitUpdated(symbol, mintLimit);
        _setUint(_getTokenMintLimitKey(symbol), mintLimit);

        if (tokenAddress == address(0)) {
            // Complex salt calculation - mimics AxelarGateway exactly
            bytes32 salt = keccak256(abi.encodePacked(symbol));

            // State change - mimics _setTokenType
            _setUint(_getTokenTypeKey(symbol), uint256(TokenType.InternalBurnableFrom));

            // Delegatecall with complex parameters - mimics AxelarGateway exactly
            (bool success, bytes memory data) = tokenDeployer.delegatecall(
                abi.encodeWithSelector(ITokenDeployer.deployToken.selector, name, symbol, decimals, cap, salt)
            );

            if (!success) {
                emit DebugError(commandId, abi.encode('delegatecall failed'));
                return;
            }

            // Complex return data decoding
            tokenAddress = abi.decode(data, (address));
            emit DebugError(commandId, abi.encode('delegatecall succeeded'));
        } else {
            // State change for external token
            _setUint(_getTokenTypeKey(symbol), uint256(TokenType.External));
        }

        // Event emission - mimics AxelarGateway exactly
        emit TokenDeployed(symbol, tokenAddress);

        // Final state change - mimics _setTokenAddress
        _setAddress(_getTokenAddressKey(symbol), tokenAddress);
    }

    // Mimic the internal call pattern from AxelarGateway's execute function
    function callDeployToken(bytes calldata params, bytes32 commandId) external {
        emit DebugError(bytes32(0), abi.encode('About to call deployToken'));

        // This is the exact pattern from AxelarGateway's execute function
        (bool success, bytes memory returnData) = address(this).call(abi.encodeWithSelector(this.deployToken.selector, params, commandId));

        emit DebugError(commandId, abi.encode('Internal call result', success));
        emit TestEvent('Internal call completed', success);
    }

    // Mimic EternalStorage getter/setter patterns
    function _getTokenMintLimitKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_TOKEN_MINT_LIMIT, symbol));
    }

    function _getTokenTypeKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_TOKEN_TYPE, symbol));
    }

    function _getTokenAddressKey(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_TOKEN_ADDRESS, symbol));
    }

    function _setUint(bytes32 key, uint256 value) internal {
        _uintStorage[key] = value;
    }

    function _setAddress(bytes32 key, address value) internal {
        _addressStorage[key] = value;
    }

    function _setBool(bytes32 key, bool value) internal {
        _boolStorage[key] = value;
    }

    // View functions to check state
    function getTokenMintLimit(string memory symbol) external view returns (uint256) {
        return _uintStorage[_getTokenMintLimitKey(symbol)];
    }

    function getTokenType(string memory symbol) external view returns (uint256) {
        return _uintStorage[_getTokenTypeKey(symbol)];
    }

    function getTokenAddress(string memory symbol) external view returns (address) {
        return _addressStorage[_getTokenAddressKey(symbol)];
    }
}
