const { ethers } = require('hardhat');

describe('Gas Estimation Test', () => {
    let testContract;

    before(async () => {
        const TestGasEstimation = await ethers.getContractFactory('TestGasEstimation');
        testContract = await TestGasEstimation.deploy();
        await testContract.deployed();
        console.log('Gas estimation test contract deployed at:', testContract.address);
    });

    const runGasTest = async (operationName, operationFunction, networkName) => {
        console.log(`\n=== Testing ${operationName} on ${networkName} ===`);

        try {
            const tx = await operationFunction();
            console.log('Transaction hash:', tx.hash);
            const receipt = await tx.wait();

            // Extract gas usage from events
            const gasEvents = receipt.events.filter((e) => e.event === 'GasUsed');
            const testEvents = receipt.events.filter((e) => e.event === 'TestEvent');

            if (gasEvents.length > 0) {
                const gasUsed = gasEvents[0].args.gasUsed.toString();
                const operation = gasEvents[0].args.operation;
                console.log(`Gas used: ${gasUsed}`);
                console.log(`Operation: ${operation}`);
            }

            if (testEvents.length > 0) {
                const success = testEvents[0].args.success;
                const message = testEvents[0].args.message;
                console.log(`Success: ${success}`);
                console.log(`Message: ${message}`);
            }

            console.log(`Transaction gas used: ${receipt.gasUsed.toString()}`);
            return {
                success: true,
                gasUsed: receipt.gasUsed.toString(),
                operationGas: gasEvents.length > 0 ? gasEvents[0].args.gasUsed.toString() : 'N/A',
            };
        } catch (error) {
            console.log('Error:', error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    };

    it('should test simple operation gas usage', async () => {
        const result = await runGasTest('Simple Operation', () => testContract.simpleOperation(), 'current network');
        console.log('Result:', result);
    });

    it('should test complex operation gas usage', async () => {
        const result = await runGasTest('Complex Operation', () => testContract.complexOperation(), 'current network');
        console.log('Result:', result);
    });

    it('should test memory intensive operation gas usage', async () => {
        const result = await runGasTest('Memory Intensive Operation', () => testContract.memoryIntensiveOperation(), 'current network');
        console.log('Result:', result);
    });

    it('should test storage intensive operation gas usage', async () => {
        const result = await runGasTest('Storage Intensive Operation', () => testContract.storageIntensiveOperation(), 'current network');
        console.log('Result:', result);
    });

    it('should test AxelarGateway-like operation gas usage', async () => {
        // Prepare parameters similar to the real AxelarGateway setup
        const params = ethers.utils.defaultAbiCoder.encode(
            ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
            [
                'Test Token', // name
                'TEST', // symbol
                18, // decimals
                10000, // cap
                ethers.constants.AddressZero, // tokenAddress
                1000, // mintLimit
            ],
        );

        console.log('Parameters:', params);

        const result = await runGasTest(
            'AxelarGateway-like Operation',
            () => testContract.axelarGatewayLikeOperation(params),
            'current network',
        );
        console.log('Result:', result);
    });

    it('should test gas estimation differences', async () => {
        const result = await runGasTest('Gas Estimation Test', () => testContract.testGasEstimation(), 'current network');
        console.log('Result:', result);
    });

    it('should test with explicit gas limits', async () => {
        const gasLimits = [100000, 200000, 500000, 1000000];

        for (const gasLimit of gasLimits) {
            console.log(`\n--- Testing with gas limit: ${gasLimit} ---`);

            try {
                const tx = await testContract.testWithExplicitGas(gasLimit, {
                    gasLimit: gasLimit,
                });
                const receipt = await tx.wait();

                const gasEvents = receipt.events.filter((e) => e.event === 'GasUsed');
                if (gasEvents.length > 0) {
                    console.log(`Gas used: ${gasEvents[0].args.gasUsed.toString()}`);
                    console.log(`Gas limit: ${gasLimit}`);
                    console.log(`Gas efficiency: ${((gasEvents[0].args.gasUsed.toNumber() / gasLimit) * 100).toFixed(2)}%`);
                }
            } catch (error) {
                console.log(`Failed with gas limit ${gasLimit}:`, error.message);
            }
        }
    });

    it('should compare estimated vs actual gas usage', async () => {
        const operations = [
            { name: 'Simple', func: () => testContract.simpleOperation() },
            { name: 'Complex', func: () => testContract.complexOperation() },
            { name: 'Memory Intensive', func: () => testContract.memoryIntensiveOperation() },
            { name: 'Storage Intensive', func: () => testContract.storageIntensiveOperation() },
        ];

        // Add AxelarGateway-like operation with parameters
        const params = ethers.utils.defaultAbiCoder.encode(
            ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
            [
                'Test Token', // name
                'TEST', // symbol
                18, // decimals
                10000, // cap
                ethers.constants.AddressZero, // tokenAddress
                1000, // mintLimit
            ],
        );
        operations.push({
            name: 'AxelarGateway-like',
            func: () => testContract.axelarGatewayLikeOperation(params),
        });

        for (const operation of operations) {
            console.log(`\n--- ${operation.name} Operation ---`);

            try {
                // Estimate gas
                const estimatedGas = await operation.func().estimateGas();
                console.log(`Estimated gas: ${estimatedGas.toString()}`);

                // Execute with estimated gas
                const tx = await operation.func({ gasLimit: estimatedGas });
                const receipt = await tx.wait();
                console.log(`Actual gas used: ${receipt.gasUsed.toString()}`);
                console.log(`Difference: ${receipt.gasUsed.sub(estimatedGas).toString()}`);
                console.log(`Accuracy: ${((estimatedGas.toNumber() / receipt.gasUsed.toNumber()) * 100).toFixed(2)}%`);
            } catch (error) {
                console.log(`Error: ${error.message}`);
            }
        }
    });
});
