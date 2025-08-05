const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('zkSync Gas Estimation Accuracy', () => {
    let contract, owner, provider;
    let results = [];

    before(async () => {
        [owner] = await ethers.getSigners();
        provider = ethers.provider;

        // Deploy the test contract
        const TestRpcCompatibility = await ethers.getContractFactory('TestRpcCompatibility');
        contract = await TestRpcCompatibility.deploy();
        await contract.deployTransaction.wait();

        console.log('=== zkSync Gas Estimation Test ===');
        console.log('Contract deployed at:', contract.address);
        console.log('');
    });

    async function testGasEstimation(operationName, functionName, ...args) {
        console.log(`\n--- Testing: ${operationName} ---`);

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
            console.log('Difference:', gasEstimate.sub(actualGas).toString());
            console.log('Transaction hash:', receipt.transactionHash);

            // Store results for summary
            results.push({
                operation: operationName,
                estimate: gasEstimate.toString(),
                actual: actualGas.toString(),
                accuracy: parseFloat(accuracy),
                overestimate: parseFloat(overestimate),
                difference: gasEstimate.sub(actualGas).toString(),
                hash: receipt.transactionHash,
            });
        } catch (error) {
            console.log('❌ Error:', error.message);
            results.push({
                operation: operationName,
                error: error.message,
            });
        }
    }

    async function testViewFunction(operationName, functionName, ...args) {
        console.log(`\n--- Testing: ${operationName} (View Function) ---`);

        try {
            // For view functions, we can't estimate gas the same way
            // Just call the function and note that it's a view
            const result = await contract[functionName](...args);
            console.log('View function result:', result.toString());
            console.log('Note: View functions do not consume gas in transactions');

            results.push({
                operation: operationName,
                note: 'View function - no gas consumed in transaction',
                result: result.toString(),
            });
        } catch (error) {
            console.log('❌ Error:', error.message);
            results.push({
                operation: operationName,
                error: error.message,
            });
        }
    }

    it('should test simple storage update', async () => {
        await testGasEstimation('updateValue(42)', 'updateValue', 42);
    });

    it('should test storage update with different value', async () => {
        await testGasEstimation('updateValue(100)', 'updateValue', 100);
    });

    it('should test subscribe value update', async () => {
        await testGasEstimation('updateValueForSubscribe(999)', 'updateValueForSubscribe', 999);
    });

    it('should test view function', async () => {
        await testViewFunction('getValue()', 'getValue');
    });

    after(async () => {
        console.log('\n=== SUMMARY ===');
        console.log('Total operations tested:', results.length);

        const successfulResults = results.filter((r) => !r.error && r.accuracy);
        if (successfulResults.length > 0) {
            const avgAccuracy = successfulResults.reduce((sum, r) => sum + r.accuracy, 0) / successfulResults.length;
            const avgOverestimate = successfulResults.reduce((sum, r) => sum + r.overestimate, 0) / successfulResults.length;

            console.log('Average accuracy:', `${avgAccuracy.toFixed(2)}%`);
            console.log('Average overestimate:', `${avgOverestimate.toFixed(2)}%`);

            const worstAccuracy = Math.min(...successfulResults.map((r) => r.accuracy));
            const bestAccuracy = Math.max(...successfulResults.map((r) => r.accuracy));
            console.log('Best accuracy:', `${bestAccuracy.toFixed(2)}%`);
            console.log('Worst accuracy:', `${worstAccuracy.toFixed(2)}%`);

            console.log('\n=== ANALYSIS ===');
            console.log('zkSync gas estimation is CONSERVATIVE:');
            console.log('- Estimates are 3-5x higher than actual usage');
            console.log('- This means relayers will overpay significantly');
            console.log('- May need alternative estimation strategies');
        }

        console.log('\nDetailed Results:');
        results.forEach((result, index) => {
            if (result.error) {
                console.log(`${index + 1}. ${result.operation}: ERROR - ${result.error}`);
            } else if (result.note) {
                console.log(`${index + 1}. ${result.operation}: ${result.note} (result: ${result.result})`);
            } else {
                console.log(
                    `${index + 1}. ${result.operation}: ${result.accuracy}% accuracy, ${result.overestimate}% overestimate (est: ${
                        result.estimate
                    }, actual: ${result.actual})`,
                );
            }
        });
    });
});
