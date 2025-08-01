const { ethers } = require('hardhat');

describe('Complex Memory Patterns Test', () => {
    it('should test complex memory patterns similar to AxelarGateway', async () => {
        console.log('=== COMPLEX MEMORY PATTERNS TEST START ===');

        // Deploy the token deployer
        const TokenDeployer = await ethers.getContractFactory('contracts/test/TestComplexMemoryPatterns.sol:TestTokenDeployer');
        const tokenDeployer = await TokenDeployer.deploy();
        await tokenDeployer.deployed();
        console.log('Token deployer deployed at:', tokenDeployer.address);

        // Deploy the complex memory patterns test contract
        const TestContract = await ethers.getContractFactory('contracts/test/TestComplexMemoryPatterns.sol:TestComplexMemoryPatterns');
        const testContract = await TestContract.deploy(tokenDeployer.address);
        await testContract.deployed();
        console.log('Complex memory test contract deployed at:', testContract.address);

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
        const commandId = ethers.utils.id('test-command-id');

        // Test the complex memory patterns
        console.log('Testing complex memory patterns...');
        console.log('Parameters:', params);
        console.log('Command ID:', commandId);

        const tx = await testContract.callDeployToken(params, commandId);
        console.log('Transaction hash:', tx.hash);
        const receipt = await tx.wait();
        console.log(
            'Events:',
            receipt.events.map((e) => e.event),
        );

        // Check the success values from events
        const testEvents = receipt.events.filter((e) => e.event === 'TestEvent');
        const debugEvents = receipt.events.filter((e) => e.event === 'DebugError');
        const tokenEvents = receipt.events.filter((e) => e.event === 'TokenDeployed');
        const limitEvents = receipt.events.filter((e) => e.event === 'TokenMintLimitUpdated');

        console.log('TestEvent details:');
        testEvents.forEach((event, index) => {
            console.log(`  Event ${index}: message="${event.args.message}", success=${event.args.success}`);
        });

        console.log('DebugError details:');
        debugEvents.forEach((event, index) => {
            console.log(`  Event ${index}: commandId="${event.args.commandId}", errorData="${event.args.errorData}"`);
        });

        console.log('TokenDeployed details:');
        tokenEvents.forEach((event, index) => {
            console.log(`  Event ${index}: symbol="${event.args.symbol}", tokenAddress="${event.args.tokenAddress}"`);
        });

        console.log('TokenMintLimitUpdated details:');
        limitEvents.forEach((event, index) => {
            console.log(`  Event ${index}: symbol="${event.args.symbol}", limit=${event.args.limit}`);
        });

        // Check if the internal call succeeded
        const internalCallEvents = testEvents.filter((e) => e.args.message.includes('Internal call completed'));
        if (internalCallEvents.length > 0) {
            const internalCallSuccess = internalCallEvents[0].args.success;
            console.log('Internal call success:', internalCallSuccess);

            if (!internalCallSuccess) {
                console.log('⚠️  INTERNAL CALL FAILED - This might be the zkSync memory allocation issue!');
            } else {
                console.log('✅ Internal call succeeded');
            }
        }

        // Check state changes
        const tokenMintLimit = await testContract.getTokenMintLimit('TEST');
        const tokenType = await testContract.getTokenType('TEST');
        const tokenAddress = await testContract.getTokenAddress('TEST');

        console.log('State after execution:');
        console.log('  Token mint limit:', tokenMintLimit.toString());
        console.log('  Token type:', tokenType.toString());
        console.log('  Token address:', tokenAddress);

        console.log('=== COMPLEX MEMORY PATTERNS TEST END ===');
    });
});
