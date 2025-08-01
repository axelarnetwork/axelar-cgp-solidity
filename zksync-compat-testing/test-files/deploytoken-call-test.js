const { ethers } = require('hardhat');

describe('DeployToken Call Test', () => {
    it('should test deployToken call pattern', async () => {
        console.log('=== DEPLOYTOKEN CALL TEST START ===');

        // Deploy a simple test contract
        const TestContract = await ethers.getContractFactory('TestDeployTokenCall');
        const testContract = await TestContract.deploy();
        await testContract.deployed();

        console.log('Test contract deployed at:', testContract.address);

        // Test the deployToken call pattern
        console.log('Testing deployToken call pattern...');
        const tx = await testContract.callDeployToken();
        console.log('Transaction hash:', tx.hash);
        const receipt = await tx.wait();
        console.log(
            'Events:',
            receipt.events.map((e) => e.event),
        );

        // Check the success values from events
        const events = receipt.events.filter((e) => e.event === 'TestEvent');
        console.log('TestEvent details:');
        events.forEach((event, index) => {
            console.log(`  Event ${index}: message="${event.args.message}", success=${event.args.success}`);
        });

        console.log('=== DEPLOYTOKEN CALL TEST END ===');
    });
});
