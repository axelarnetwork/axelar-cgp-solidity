const { ethers } = require('hardhat');

describe('OnlySelf Test', () => {
    it('should test onlySelf modifier behavior', async () => {
        console.log('=== ONLYSELF TEST START ===');

        // Deploy a simple test contract
        const TestContract = await ethers.getContractFactory('TestOnlySelf');
        const testContract = await TestContract.deploy();
        await testContract.deployed();

        console.log('Test contract deployed at:', testContract.address);

        // Test the internal call pattern
        console.log('Testing internal call with onlySelf...');
        const tx = await testContract.callTestOnlySelf();
        console.log('Transaction hash:', tx.hash);
        const receipt = await tx.wait();
        console.log(
            'Events:',
            receipt.events.map((e) => e.event),
        );

        console.log('=== ONLYSELF TEST END ===');
    });
});
