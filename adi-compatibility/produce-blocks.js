require('dotenv').config();
const { ethers, network } = require('hardhat');
const { Wallet } = ethers;

async function keepProducingBlocks() {
    console.log('🔄 Block Producer Script Started\n');

    const provider = ethers.provider;

    // Get block producer keys from env vars
    const key1 = process.env.BLOCK_PRODUCER_KEY_1;
    const key2 = process.env.BLOCK_PRODUCER_KEY_2;

    if (!key1 || !key2) {
        console.error('❌ Please set BLOCK_PRODUCER_KEY_1 and BLOCK_PRODUCER_KEY_2 environment variables');
        process.exit(1);
    }

    const wallet1 = new Wallet(key1, provider);
    const wallet2 = new Wallet(key2, provider);

    console.log(`Wallet 1: ${wallet1.address}`);
    console.log(`Wallet 2: ${wallet2.address}`);

    // Check balances
    const balance1 = await provider.getBalance(wallet1.address);
    const balance2 = await provider.getBalance(wallet2.address);

    console.log(`Balance 1: ${ethers.utils.formatEther(balance1)} ETH`);
    console.log(`Balance 2: ${ethers.utils.formatEther(balance2)} ETH\n`);

    if (balance1.isZero() && balance2.isZero()) {
        console.error('❌ Both wallets have zero balance! Cannot send transactions.');
        process.exit(1);
    }

    // Configuration
    const INTERVAL = 2000; // Send transaction every 2 seconds
    const AMOUNT = ethers.utils.parseEther('0.000001'); // Very small amount

    let nonce1 = await provider.getTransactionCount(wallet1.address);
    let nonce2 = await provider.getTransactionCount(wallet2.address);
    let txCount = 0;
    let lastBlock = await provider.getBlock('latest');

    console.log('Starting continuous transactions...\n');
    console.log('Press Ctrl+C to stop\n');

    // Set up graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\n✅ Block producer stopped gracefully');
        console.log(`Total transactions sent: ${txCount}`);
        process.exit(0);
    });

    // Main loop
    while (true) {
        try {
            // Alternate between wallets
            const sender = txCount % 2 === 0 ? wallet1 : wallet2;
            const receiver = txCount % 2 === 0 ? wallet2 : wallet1;
            const senderNonce = txCount % 2 === 0 ? nonce1++ : nonce2++;

            // Get current gas price
            const gasPrice = await provider.getGasPrice();

            // Create and sign transaction
            const tx = {
                to: receiver.address,
                value: AMOUNT,
                gasLimit: 300000, // Higher for zkSync
                gasPrice: gasPrice,
                nonce: senderNonce,
                chainId: network.config.chainId,
            };

            const signedTx = await sender.signTransaction(tx);

            // Send transaction
            const txHash = await provider.send('eth_sendRawTransaction', [signedTx]);
            txCount++;

            // Wait for confirmation
            const receipt = await provider.waitForTransaction(txHash);

            // Check if new block was produced
            const currentBlock = await provider.getBlock('latest');
            if (currentBlock.number > lastBlock.number) {
                console.log(`✅ TX ${txCount}: ${txHash.substring(0, 10)}... | New block #${currentBlock.number} produced`);
                lastBlock = currentBlock;
            } else {
                console.log(`📤 TX ${txCount}: ${txHash.substring(0, 10)}... | Block: ${receipt.blockNumber}`);
            }
        } catch (error) {
            console.error(`❌ Transaction ${txCount + 1} failed:`, error.message);

            // Update nonces in case they got out of sync
            try {
                nonce1 = await provider.getTransactionCount(wallet1.address);
                nonce2 = await provider.getTransactionCount(wallet2.address);
                console.log('🔄 Nonces updated, retrying...');
            } catch (e) {
                console.error('Failed to update nonces:', e.message);
            }
        }

        // Wait before next transaction
        await new Promise((resolve) => setTimeout(resolve, INTERVAL));
    }
}

// Run the script
keepProducingBlocks().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
