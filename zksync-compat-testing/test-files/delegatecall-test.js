const { ethers } = require('hardhat');

describe('Delegatecall Test', () => {
    it('should test delegatecall pattern', async () => {
        console.log('=== DELEGATECALL TEST START ===');

        // Deploy the token deployer
        const TokenDeployer = await ethers.getContractFactory('contracts/test/TestTokenDeployer.sol:TestTokenDeployer');
        const tokenDeployer = await TokenDeployer.deploy();
        await tokenDeployer.deployed();
        console.log('Token deployer deployed at:', tokenDeployer.address);

        // Deploy the test contract
        const TestContract = await ethers.getContractFactory(
            'contracts/test/TestDeployTokenWithDelegatecall.sol:TestDeployTokenWithDelegatecall',
        );
        const testContract = await TestContract.deploy(tokenDeployer.address);
        await testContract.deployed();
        console.log('Test contract deployed at:', testContract.address);

        // Test the delegatecall pattern
        console.log('Testing delegatecall pattern...');
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

        // Check if delegatecall succeeded
        const delegatecallEvents = events.filter((e) => e.args.message.includes('delegatecall'));
        if (delegatecallEvents.length > 0) {
            const delegatecallSuccess = delegatecallEvents[0].args.success;
            console.log('Delegatecall success:', delegatecallSuccess);
        }

        console.log('=== DELEGATECALL TEST END ===');
    });
});
