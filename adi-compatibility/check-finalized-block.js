const { ethers, network } = require('hardhat');

async function checkFinalizedBlock() {
    console.log('🔍 Finalized Block Analysis\n');

    const provider = ethers.provider;
    console.log(`Network: ${network.name} (chainId: ${network.config.chainId})`);
    console.log(`RPC URL: ${network.config.url}\n`);

    try {
        // Get current time for reference
        const currentTime = Math.floor(Date.now() / 1000);
        console.log(`Current time: ${new Date(currentTime * 1000).toISOString()}\n`);

        // Get latest block
        const latestBlock = await provider.send('eth_getBlockByNumber', ['latest', false]);
        const latestNumber = parseInt(latestBlock.number, 16);
        const latestTimestamp = parseInt(latestBlock.timestamp, 16);

        console.log('=== Latest Block ===');
        console.log(`Block number: ${latestNumber}`);
        console.log(`Block hash: ${latestBlock.hash}`);
        console.log(`Timestamp: ${new Date(latestTimestamp * 1000).toISOString()}`);
        console.log(`Age: ${formatTimeDiff(currentTime - latestTimestamp)}\n`);

        // Get finalized block
        const finalizedBlock = await provider.send('eth_getBlockByNumber', ['finalized', false]);
        const finalizedNumber = parseInt(finalizedBlock.number, 16);
        const finalizedTimestamp = parseInt(finalizedBlock.timestamp, 16);

        console.log('=== Finalized Block ===');
        console.log(`Block number: ${finalizedNumber}`);
        console.log(`Block hash: ${finalizedBlock.hash}`);
        console.log(`Timestamp: ${new Date(finalizedTimestamp * 1000).toISOString()}`);
        console.log(`Age: ${formatTimeDiff(currentTime - finalizedTimestamp)}\n`);

        // Get safe block for comparison
        try {
            const safeBlock = await provider.send('eth_getBlockByNumber', ['safe', false]);
            const safeNumber = parseInt(safeBlock.number, 16);
            const safeTimestamp = parseInt(safeBlock.timestamp, 16);

            console.log('=== Safe Block ===');
            console.log(`Block number: ${safeNumber}`);
            console.log(`Block hash: ${safeBlock.hash}`);
            console.log(`Timestamp: ${new Date(safeTimestamp * 1000).toISOString()}`);
            console.log(`Age: ${formatTimeDiff(currentTime - safeTimestamp)}\n`);
        } catch (e) {
            console.log('=== Safe Block ===');
            console.log('Not supported on this network\n');
        }

        // Analysis
        console.log('=== Analysis ===');
        console.log(`Blocks between latest and finalized: ${latestNumber - finalizedNumber}`);
        console.log(`Time between latest and finalized: ${formatTimeDiff(latestTimestamp - finalizedTimestamp)}`);

        const finalizedAge = currentTime - finalizedTimestamp;
        console.log(`\nFinalized block age: ${formatTimeDiff(finalizedAge)} (${finalizedAge} seconds)`);

        if (finalizedAge > 86400) {
            // More than 24 hours
            console.log('\n⚠️  WARNING: Finalized block is more than 24 hours old!');
            console.log('This suggests the devnet is not posting to L1 or finalization is not working properly.');
        } else if (finalizedAge > 3600) {
            // More than 1 hour
            console.log('\n⚠️  Finalized block is more than 1 hour old.');
            console.log('Finalization might be slow or intermittent.');
        } else {
            console.log('\n✅ Finalized block appears to be updating normally.');
        }

        // Check if finalized == genesis
        if (finalizedNumber === 0) {
            console.log('\n🚨 Finalized block is the genesis block!');
            console.log('The network likely has no L1 finalization mechanism.');
        }

        // Test the timestamp check that's failing
        console.log('\n=== Test Expectation Check ===');
        const maxDifference = 15000; // What the test expects
        const actualDifference = Math.abs(currentTime - finalizedTimestamp);

        console.log(`Test expects finalized block to be within: ${formatTimeDiff(maxDifference)}`);
        console.log(`Actual difference: ${formatTimeDiff(actualDifference)}`);

        if (actualDifference > maxDifference) {
            console.log(`❌ This would fail the test by ${formatTimeDiff(actualDifference - maxDifference)}`);
        } else {
            console.log('✅ This would pass the test');
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.message.includes('finalized')) {
            console.log('\n❌ The network might not support the "finalized" tag at all.');
        }
    }
}

function formatTimeDiff(seconds) {
    const absSeconds = Math.abs(seconds);
    const hours = Math.floor(absSeconds / 3600);
    const minutes = Math.floor((absSeconds % 3600) / 60);
    const secs = absSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

// Run the check
checkFinalizedBlock().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
