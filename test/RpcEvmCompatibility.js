'use strict';

const chai = require('chai');
const { Wallet } = require('ethers');
const { ethers, network } = require('hardhat');
const {
    getDefaultProvider,
    utils: { hexValue },
} = ethers;
const { expect } = chai;
const { readJSON } = require('@axelar-network/axelar-chains-config');
const keys = readJSON(`${__dirname}/../keys.json`);

const { isHardhat } = require('./utils');

describe('EVM Compatibility Test', () => {
    let rpcUrl;
    let provider;
    let signers;
    let signer;
    let rpcCompatibilityFactory;
    let rpcCompatibilityContract;
    const ADDRESS_1 = '0x0000000000000000000000000000000000000001';
    const INITIAL_VALUE = 10;
    const KnownAccount0PrivateKeyHardhat = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'];

    before(async () => {
        rpcUrl = network.config.rpc;
        provider = rpcUrl ? getDefaultProvider(rpcUrl) : ethers.provider;
        signers = await ethers.getSigners();
        signer = signers[0];
    });

    beforeEach(async () => {
        rpcCompatibilityFactory = await ethers.getContractFactory('RpcCompatibility', signers[0]);
        rpcCompatibilityContract = await rpcCompatibilityFactory.deploy(INITIAL_VALUE);
        await rpcCompatibilityContract.deployTransaction.wait(network.config.confirmations);
    });

    it('should execute eth_getLogs on the RPC URL', async () => {
        // Execute updateValue function (assuming newValue is a BigNumber)
        const newValue = ethers.BigNumber.from(100);
        const tx = await rpcCompatibilityContract.updateValue(newValue);
        // Wait for the transaction to be mined
        const receipt = await tx.wait();
        const blockNo = hexValue(receipt.blockNumber);

        // Attempt to retrieve logs using eth_getLogs
        const filter = {
            fromBlock: blockNo,
            toBlock: blockNo,
        };
        // Make the call to eth_getLogs
        const logs = await provider.send('eth_getLogs', [filter]);
        // If the logs are retrieved successfully, the test passes
        expect(logs).to.be.an('array');
        expect(logs.length).to.be.greaterThan(0);
    });

    it('should retrieve a transaction receipt', async () => {
        // Send a simple eth transfer transaction
        const transaction = await signer.sendTransaction({
            to: ADDRESS_1, // Replace with the recipient's address
            value: ethers.utils.parseEther('0.001'), // Send 0.001 Ether
        });

        // Wait for the transaction to be mined
        await transaction.wait();

        // Retrieve the transaction receipt
        const receipt = await provider.send('eth_getTransactionReceipt', [transaction.hash]);

        // If the receipt is retrieved successfully, the test passes
        expect(receipt).to.be.an('object');
        expect(parseInt(receipt.blockNumber, 16)).to.be.a('number');
        expect(receipt.to).to.equal(ADDRESS_1);
    });

    it('should retrieve a transaction by hash', async () => {
        // Send a simple eth transfer transaction
        const transaction = await signer.sendTransaction({
            to: ADDRESS_1, // Replace with the recipient's address
            value: ethers.utils.parseEther('0.001'), // Send 0.001 Ether
        });

        // Wait for the transaction to be mined
        await transaction.wait();

        // Retrieve the transaction by hash
        const transactionInfo = await provider.send('eth_getTransactionByHash', [transaction.hash]);

        // If the receipt is retrieved successfully, the test passes
        expect(transactionInfo).to.be.an('object');
        expect(transactionInfo.to).to.equal(ADDRESS_1); // Verify the recipient address
        expect(parseInt(transactionInfo.value, 16).toString()).to.equal(ethers.utils.parseEther('0.001').toString()); // Verify the sent value
    });

    it('should retrieve a block by hash', async () => {
        // Send a simple eth transfer transaction
        const transaction = await signer.sendTransaction({
            to: ADDRESS_1, // Replace with the recipient's address
            value: ethers.utils.parseEther('0.001'), // Send 0.001 Ether
        });

        // Wait for the transaction to be mined
        await transaction.wait();
        const receipt = await provider.getTransactionReceipt(transaction.hash);
        const blockHash = receipt.blockHash;

        // Make the eth_getBlockByHash call
        const block = await provider.send('eth_getBlockByHash', [blockHash, true]);

        // Verify properties of the block
        expect(block).to.be.an('object');
        expect(block.hash).to.equal(blockHash);
        expect(parseInt(block.number, 16)).to.be.a('number');
        expect(parseInt(block.timestamp, 16)).to.be.a('number');
        expect(block.transactions).to.be.an('array');
    });

    it('should retrieve the latest block', async () => {
        // Make the eth_getBlockByNumber call for the latest block
        const block = await provider.send('eth_getBlockByNumber', ['latest', true]);

        // Verify properties of the block
        expect(block).to.be.an('object');
        expect(block.hash).to.be.a('string');
        expect(parseInt(block.number), 16).to.be.a('number');
        expect(parseInt(block.timestamp), 16).to.be.a('number');
        expect(block.transactions).to.be.an('array');
    });

    it('should retrieve the current block number', async () => {
        // Make the eth_blockNumber call
        const blockNumber = await provider.send('eth_blockNumber', []);

        // Verify the block number
        expect(blockNumber).to.be.a('string');
        const blockNumberDecimal = ethers.BigNumber.from(blockNumber).toNumber();
        expect(blockNumberDecimal).to.be.a('number');
        expect(blockNumberDecimal).to.be.gte(0);
    });

    it('should make an eth_call', async () => {
        // Make the eth_call to getValue in rpcCompatibilityContract
        const callResult = await provider.send('eth_call', [
            {
                to: rpcCompatibilityContract.address,
                data: rpcCompatibilityContract.interface.encodeFunctionData('getValue'),
            },
            'latest',
        ]);

        // Parse the result
        const result = ethers.BigNumber.from(callResult).toNumber();
        // Verify the result
        expect(result).to.equal(INITIAL_VALUE);
    });

    it('should retrieve the code of a contract', async () => {
        // Make the eth_getCode call for the deployed contract
        const code = await provider.send('eth_getCode', [rpcCompatibilityContract.address, 'latest']);

        // Verify the code
        expect(code).to.be.a('string');
        expect(/^0x[0-9a-fA-F]*$/.test(code)).to.be.true; // Ensure it's a valid hexadecimal string
        expect(code).to.not.equal('0x'); // Ensure it's not an empty code
    });

    it('should estimate gas for a transaction', async () => {
        const gasLimit = network.config.gasOptions?.gasLimit || 50000;
        const newValue = 100;
        const transactionParams = {
            to: rpcCompatibilityContract.address,
            data: rpcCompatibilityContract.interface.encodeFunctionData('updateValue', [newValue]),
            gasLimit,
        };

        // Make the eth_estimateGas call
        const estimatedGas = await provider.send('eth_estimateGas', [transactionParams]);

        // Verify the estimated gas
        expect(estimatedGas).to.be.a('string');
        expect(ethers.BigNumber.from(estimatedGas).gt(0)).to.be.true;
    });

    it('should retrieve the current gas price', async () => {
        // Make the eth_gasPrice call
        const gasPrice = await provider.send('eth_gasPrice', []);

        // Verify the gas price
        expect(gasPrice).to.be.a('string');
        expect(ethers.BigNumber.from(gasPrice).toNumber()).to.be.above(0); // Gas price should be a positive integer
    });

    it('should retrieve the chain ID', async () => {
        // Make the eth_chainId call
        const chainId = await provider.send('eth_chainId', []);

        // Verify the chain ID
        expect(chainId).to.be.a('string');
        expect(ethers.BigNumber.from(chainId).toNumber()).to.be.above(0); // Chain ID should be a positive integer
    });

    it('should retrieve the transaction count of an address', async () => {
        // Make the eth_getTransactionCount call
        const transactionCount = await provider.send('eth_getTransactionCount', [signers[0].address, 'latest']);

        // Verify the transaction count
        expect(transactionCount).to.be.a('string');
        expect(ethers.BigNumber.from(transactionCount).toNumber()).to.be.at.least(0); // Transaction count should be a non-negative integer
    });

    it('should send a raw transaction', async () => {
        const privateKeys = isHardhat ? KnownAccount0PrivateKeyHardhat : keys?.accounts || keys.chains[network.name]?.accounts;
        const wallet = new Wallet(privateKeys[0], provider);

        let tx = {
            to: rpcCompatibilityContract.address,
            data: rpcCompatibilityContract.interface.encodeFunctionData('getValue'),
            gasLimit: network.config.gasOptions?.gasLimit || 23310, // Use an appropriate gas limit
        };

        tx = await signer.populateTransaction(tx);
        const rawTransaction = await wallet.signTransaction(tx);

        // Make the eth_sendRawTransaction call
        const transactionHash = await provider.send('eth_sendRawTransaction', [rawTransaction]);
        // Get the receipt for the transaction
        const receipt = await provider.waitForTransaction(transactionHash);

        // Verify the transaction hash
        expect(transactionHash).to.be.a('string');
        expect(transactionHash).to.match(/0x[0-9a-fA-F]{64}/); // Check if it's a valid transaction hash
        // Verify the receipt
        expect(receipt).to.not.be.null;
        expect(receipt.from).to.equal(signer.address); // Check if the sender address is correct
        expect(receipt.to).to.equal(rpcCompatibilityContract.address); // Check if the recipient is correct
        expect(receipt.status).to.equal(1);
    });

    it('should retrieve the balance of an address at a specific block', async () => {
        // Make the eth_balanceAt call
        const balance = await provider.send('eth_getBalance', [signers[0].address, 'latest']);

        // Verify the balance
        expect(balance).to.be.a('string');
        expect(ethers.BigNumber.from(balance)).to.be.gte(0);
    });

    it('should check if the node is syncing', async () => {
        // Make the eth_syncing call
        const syncingStatus = await provider.send('eth_syncing', []);

        if (syncingStatus) {
            expect(syncingStatus).to.be.an('object');
            expect(syncingStatus.startingBlock).to.be.a('string');
            expect(syncingStatus.currentBlock).to.be.a('string');
            expect(syncingStatus.highestBlock).to.be.a('string');
        } else {
            expect(syncingStatus).to.be.false; // currently on live testnet the syncingStatus is always coming as false.
        }
    });

    it('should subscribe to the event', async function () {
        // This uses eth_subscribe
        // Setting up manually via wss rpc is tricky
        rpcCompatibilityContract.on('ValueUpdated', (value) => {
            console.log('Subscription successful');
            expect(value.toNumber()).to.equal(123);
        });

        await rpcCompatibilityContract.updateValue(123).then((tx) => tx.wait());
        const resolve = (res) => setTimeout(() => res(null), 5000);
        await new Promise(resolve);
    });

    if (!isHardhat) {
        it('should get the max priority fee per gas', async () => {
            // Make the eth_maxPriorityFeePerGas call
            const maxPriorityFeePerGas = await provider.send('eth_maxPriorityFeePerGas', []);

            // Verify the max priority fee per gas
            expect(maxPriorityFeePerGas).to.be.a('string');
            expect(ethers.BigNumber.from(maxPriorityFeePerGas).toNumber()).to.be.at.least(0); // Should be a non-negative number
        });
    }

    it('should retrieve fee history', async () => {
        // Make the call to eth_feeHistory
        const feeHistory = await provider.send('eth_feeHistory', ['0x1', 'latest', [25, 75]]); // referecne: https://docs.alchemy.com/reference/eth-feehistory

        // If the fee history is retrieved successfully, the test passes
        expect(feeHistory).to.be.an('object');
        expect(parseInt(feeHistory.oldestBlock, 16)).to.be.an('number');
        expect(feeHistory.reward).to.be.an('array');
    });
});
