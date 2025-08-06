const { ethers, network } = require('hardhat');

describe('Gas Estimation Accuracy', () => {
    let contract, owner, provider;
    let results = [];

    before(async () => {
        [owner] = await ethers.getSigners();
        provider = ethers.provider;

        // Deploy the test contract
        const TestRpcCompatibility = await ethers.getContractFactory('TestRpcCompatibility');
        contract = await TestRpcCompatibility.deploy();
        await contract.deployTransaction.wait();

        console.log(`=== Gas Estimation Test on ${network.name} ===`);
        console.log(`Network: ${network.name} (chainId: ${network.config.chainId})`);
        console.log('Contract deployed at:', contract.address);
        console.log('Test will examine estimation consistency and state dependencies\n');
    });

    async function testGasEstimation(testName, operationName, functionName, ...args) {
        console.log(`\n--- ${testName} ---`);
        console.log(`Operation: ${operationName}`);

        try {
            // Populate the transaction using the contract
            const populatedTx = await owner.populateTransaction(await contract.populateTransaction[functionName](...args));

            // Get gas estimate using provider
            const gasEstimate = await provider.estimateGas(populatedTx);
            console.log('Gas estimate:', gasEstimate.toString());

            // Execute with higher gas limit (2x estimate for safety)
            const gasLimit = gasEstimate.mul(2);
            const tx = await contract[functionName](...args, { gasLimit });
            const receipt = await tx.wait();

            const actualGas = receipt.gasUsed;
            const accuracy = ((gasEstimate.toNumber() / actualGas.toNumber()) * 100).toFixed(2);
            const overestimate = (((gasEstimate.toNumber() - actualGas.toNumber()) / actualGas.toNumber()) * 100).toFixed(2);

            console.log('Actual gas used:', actualGas.toString());
            console.log('Accuracy:', `${accuracy}%`);
            console.log('Overestimate by:', `${overestimate}%`);
            console.log('Block number:', receipt.blockNumber);

            // Store results for summary
            results.push({
                testName,
                operation: operationName,
                estimate: gasEstimate.toString(),
                actual: actualGas.toString(),
                accuracy: parseFloat(accuracy),
                overestimate: parseFloat(overestimate),
                blockNumber: receipt.blockNumber,
            });
        } catch (error) {
            console.log('❌ Error:', error.message);
            results.push({
                testName,
                operation: operationName,
                error: error.message,
            });
        }
    }

    // Test 1: Cold storage write
    it('should test first write to value slot (cold storage)', async () => {
        await testGasEstimation('Test 1: Cold Storage Write', 'updateValue(42)', 'updateValue', 42);
    });

    // Test 2: Warm storage write (same slot)
    it('should test second write to value slot (warm storage)', async () => {
        await testGasEstimation('Test 2: Warm Storage Write (same slot)', 'updateValue(100)', 'updateValue', 100);
    });

    // Test 3: Write same value again to check consistency
    it('should test writing same value again', async () => {
        await testGasEstimation('Test 3: Repeated Value Write', 'updateValue(100)', 'updateValue', 100);
    });

    // Test 4: Write to different storage slot
    it('should test write to different storage slot', async () => {
        await testGasEstimation(
            'Test 4: Different Storage Slot (subscribeValue)',
            'updateValueForSubscribe(999)',
            'updateValueForSubscribe',
            999,
        );
    });

    // Test 5: Write to same slot after delay
    it('should test write after 5 second delay', async () => {
        console.log('\nWaiting 5 seconds before next test...');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        await testGasEstimation('Test 5: Write After Delay', 'updateValue(42)', 'updateValue', 42);
    });

    // Test 6: Estimate without executing
    it('should test estimation consistency without execution', async () => {
        console.log('\n--- Test 6: Multiple Estimations Without Execution ---');

        const estimates = [];
        for (let i = 0; i < 3; i++) {
            const populatedTx = await owner.populateTransaction(await contract.populateTransaction.updateValue(200 + i));
            const estimate = await provider.estimateGas(populatedTx);
            estimates.push(estimate.toString());
            console.log(`Estimation ${i + 1} for updateValue(${200 + i}):`, estimate.toString());

            // Small delay between estimates
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const allSame = estimates.every((e) => e === estimates[0]);
        console.log('All estimates identical?', allSame);
        if (!allSame) {
            console.log('Estimates varied:', estimates.join(', '));
        }
    });

    after(async () => {
        const successfulResults = results.filter((r) => !r.error && r.accuracy);

        if (successfulResults.length > 0) {
            console.log('\n=== STATISTICS ===');
            console.log(`Network: ${network.name}`);
            console.log('Total operations tested:', successfulResults.length);

            const avgAccuracy = successfulResults.reduce((sum, r) => sum + r.accuracy, 0) / successfulResults.length;
            const avgOverestimate = successfulResults.reduce((sum, r) => sum + r.overestimate, 0) / successfulResults.length;

            console.log('Average accuracy:', `${avgAccuracy.toFixed(2)}%`);
            console.log('Average overestimate:', `${avgOverestimate.toFixed(2)}%`);

            // Find most and least accurate (closest and furthest from 100%)
            const accuracies = successfulResults.map((r) => ({
                accuracy: r.accuracy,
                distance: Math.abs(r.accuracy - 100),
                testName: r.testName,
            }));

            const mostAccurate = accuracies.reduce((min, curr) => (curr.distance < min.distance ? curr : min));
            const leastAccurate = accuracies.reduce((max, curr) => (curr.distance > max.distance ? curr : max));

            console.log('Most accurate:', `${mostAccurate.accuracy.toFixed(2)}% (${mostAccurate.testName})`);
            console.log('Least accurate:', `${leastAccurate.accuracy.toFixed(2)}% (${leastAccurate.testName})`);
        }
    });
});
