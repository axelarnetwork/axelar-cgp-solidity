const { ethers } = require('hardhat');

describe('Internal Call Test', () => {
    it('should test internal call behavior', async () => {
        console.log('=== INTERNAL CALL TEST START ===');

        // Deploy a simple test contract
        const TestContract = await ethers.getContractFactory('TestInternalCall');
        const testContract = await TestContract.deploy();
        await testContract.deployed();

        console.log('Test contract deployed at:', testContract.address);

        // Test direct call
        console.log('Testing direct call...');
        const directTx = await testContract.testDirectCall();
        console.log('Direct call transaction hash:', directTx.hash);
        const directReceipt = await directTx.wait();
        console.log(
            'Direct call events:',
            directReceipt.events.map((e) => e.event),
        );

        // Test internal call
        console.log('Testing internal call...');
        const internalTx = await testContract.testInternalCall();
        console.log('Internal call transaction hash:', internalTx.hash);
        const internalReceipt = await internalTx.wait();
        console.log(
            'Internal call events:',
            internalReceipt.events.map((e) => e.event),
        );

        // Check the stored results
        const directSuccess = await testContract.lastDirectCallSuccess();
        const internalSuccess = await testContract.lastInternalCallSuccess();
        console.log('Direct call success:', directSuccess);
        console.log('Internal call success:', internalSuccess);

        // Also check via the view function
        const [directResult, internalResult] = await testContract.checkResults();
        console.log('Direct call result (view):', directResult);
        console.log('Internal call result (view):', internalResult);

        // Check if there's a discrepancy
        if (directSuccess !== internalSuccess) {
            console.log('⚠️  DISCREPANCY DETECTED: Direct call and internal call report different success values!');
        } else {
            console.log('✅ Success values match between direct and internal calls');
        }

        console.log('=== INTERNAL CALL TEST END ===');
    });
});
