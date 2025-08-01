// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TestGasEstimation {
    event GasUsed(uint256 gasUsed, string operation);
    event TestEvent(string message, bool success);

    // Storage variables for testing
    mapping(uint256 => uint256) public testMap;
    mapping(bytes32 => uint256) public testStorage;

    // Simple operation - minimal gas usage
    function simpleOperation() external {
        uint256 startGas = gasleft();

        // Simple storage operation
        uint256 testValue = 42;

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'simple_operation');
        emit TestEvent('Simple operation completed', true);
    }

    // Complex operation - moderate gas usage
    function complexOperation() external {
        uint256 startGas = gasleft();

        // Multiple storage operations
        for (uint256 i = 0; i < 10; i++) {
            uint256 value = i * 2;
        }

        // String operations
        string memory testString = 'This is a test string for gas estimation';

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'complex_operation');
        emit TestEvent('Complex operation completed', true);
    }

    // Memory-intensive operation - high gas usage
    function memoryIntensiveOperation() external {
        uint256 startGas = gasleft();

        // Large memory allocation
        bytes memory largeData = new bytes(1000);
        for (uint256 i = 0; i < largeData.length; i++) {
            largeData[i] = bytes1(uint8(i % 256));
        }

        // Complex string operations
        string
            memory longString = 'This is a very long string that will consume significant gas for memory allocation and string operations in the EVM';

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'memory_intensive_operation');
        emit TestEvent('Memory intensive operation completed', true);
    }

    // Storage-intensive operation - high gas usage
    function storageIntensiveOperation() external {
        uint256 startGas = gasleft();

        // Multiple storage operations (expensive on zkSync)
        for (uint256 i = 0; i < 20; i++) {
            testMap[i] = i * 3;
        }

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'storage_intensive_operation');
        emit TestEvent('Storage intensive operation completed', true);
    }

    // Mimic AxelarGateway-like operation with calldata parameters
    function axelarGatewayLikeOperation(bytes calldata params) external {
        uint256 startGas = gasleft();

        // Complex parameter decoding (like deployToken)
        (string memory name, string memory symbol, uint8 decimals, uint256 cap, address tokenAddress, uint256 mintLimit) = abi.decode(
            params,
            (string, string, uint8, uint256, address, uint256)
        );

        // Multiple state changes (like EternalStorage)
        testStorage[keccak256(abi.encode('test_key'))] = 123;
        testStorage[keccak256(abi.encode('another_key'))] = 456;

        // Event emissions (like AxelarGateway)
        emit TestEvent('AxelarGateway-like operation completed', true);

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'axelar_gateway_like_operation');
    }

    // Test with explicit gas limit
    function testWithExplicitGas(uint256 gasLimit) external {
        uint256 startGas = gasleft();

        // Operation that might fail with insufficient gas
        bytes memory largeData = new bytes(gasLimit / 100); // Scale with gas limit

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'explicit_gas_test');
        emit TestEvent('Explicit gas test completed', true);
    }

    // Test gas estimation differences
    function testGasEstimation() external {
        uint256 startGas = gasleft();

        // Operation that might behave differently on zkSync
        bytes memory data = new bytes(100);
        for (uint256 i = 0; i < data.length; i++) {
            data[i] = bytes1(uint8(i % 256));
        }

        // String operations (might have different gas costs)
        string memory testString = 'Gas estimation test string';

        uint256 gasUsed = startGas - gasleft();
        emit GasUsed(gasUsed, 'gas_estimation_test');
        emit TestEvent('Gas estimation test completed', true);
    }
}
