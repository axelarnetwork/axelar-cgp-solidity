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
        // Simplified token deployment - just return a deterministic address
        address tokenAddress = address(uint160(uint256(salt)));
        emit TokenDeployed(tokenAddress, symbol);
        return tokenAddress;
    }
}

contract TestDeployTokenWithDelegatecall {
    event TestEvent(string message, bool success);

    address public tokenDeployer;

    constructor(address _tokenDeployer) {
        tokenDeployer = _tokenDeployer;
    }

    // Mimic the deployToken function from AxelarGateway
    function deployToken(bytes calldata params, bytes32) external {
        // Decode parameters
        (string memory name, string memory symbol, uint8 decimals, uint256 cap, address tokenAddress, uint256 mintLimit) = abi.decode(
            params,
            (string, string, uint8, uint256, address, uint256)
        );

        if (tokenAddress == address(0)) {
            // This is the key part - the delegatecall to tokenDeployer
            bytes32 salt = keccak256(abi.encodePacked(symbol));

            (bool success, bytes memory data) = tokenDeployer.delegatecall(
                abi.encodeWithSelector(ITokenDeployer.deployToken.selector, name, symbol, decimals, cap, salt)
            );

            if (!success) {
                emit TestEvent('delegatecall failed', false);
                return;
            }

            tokenAddress = abi.decode(data, (address));
            emit TestEvent('delegatecall succeeded', true);
        }
    }

    function callDeployToken() external {
        bytes memory params = abi.encode(
            'Test Token', // name
            'TEST', // symbol
            18, // decimals
            10000, // cap
            address(0), // tokenAddress
            1000 // mintLimit
        );
        bytes32 commandId = bytes32('test-command-id');

        (bool success, bytes memory data) = address(this).call(abi.encodeWithSelector(this.deployToken.selector, params, commandId));

        emit TestEvent('Internal call result', success);
    }
}
