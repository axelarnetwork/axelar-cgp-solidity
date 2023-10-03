'use strict';

const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    getDefaultProvider,
    utils: { hexValue, getAddress, keccak256 },
    Wallet,
    BigNumber,
} = ethers;
const { expect } = chai;
const { readJSON } = require('@axelar-network/axelar-chains-config');
const keys = readJSON(`${__dirname}/../keys.json`);

const { isHardhat, getRandomInt } = require('./utils');

function checkBlockTimeStamp(timeStamp) {
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDifference = Math.abs(currentTime - timeStamp);
    expect(timeDifference).to.be.lessThan(100);
}

describe('EVM Compatibility Test', () => {
    let rpcUrl;
    let provider;
    let signers;
    let signer;
    let rpcCompatibilityFactory;
    let rpcCompatibilityContract;
    let fundsReceiver;
    const INITIAL_VALUE = 10;
    const MAX_TRANSFER = 100; // 100 wei
    const KnownAccount0PrivateKeyHardhat = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'];

    before(async () => {
        rpcUrl = network.config.rpc;
        provider = network.provider;
        signers = await ethers.getSigners();
        signer = signers[0];
        fundsReceiver = signers[1].address;
        rpcCompatibilityFactory = await ethers.getContractFactory('RpcCompatibility', signer);
        rpcCompatibilityContract = await rpcCompatibilityFactory.deploy(INITIAL_VALUE);
        await rpcCompatibilityContract.deployTransaction.wait(network.config.confirmations);
    });

    it('should support RPC method eth_getLogs', async () => {
        const newValue = 100;
        const receipt = await rpcCompatibilityContract.updateValue(newValue).then((tx) => tx.wait());
        const blockNumber = hexValue(receipt.blockNumber);

        const filter = {
            fromBlock: blockNumber,
            toBlock: blockNumber,
        };
        const logs = await provider.send('eth_getLogs', [filter]);
        expect(logs).to.be.an('array');
        expect(logs.length).to.be.greaterThan(0);
    });

    describe('rpc get transaction and blockByHash methods', () => {
        let tx;
        let amount;

        before(async () => {
            amount = getRandomInt(MAX_TRANSFER);
            tx = await signer.sendTransaction({
                to: fundsReceiver,
                value: amount,
            });
            await tx.wait();
        });

        it('should support RPC method eth_getTransactionReceipt', async () => {
            const receipt = await provider.send('eth_getTransactionReceipt', [tx.hash]);

            expect(receipt).to.be.an('object');
            expect(parseInt(receipt.blockNumber, 16)).to.be.a('number');
            expect(getAddress(receipt.to)).to.equal(fundsReceiver);
        });

        it('should support RPC method eth_getTransactionByHash', async () => {
            const txInfo = await provider.send('eth_getTransactionByHash', [tx.hash]);

            expect(txInfo).to.be.an('object');
            expect(getAddress(txInfo.to)).to.equal(fundsReceiver);
            expect(parseInt(txInfo.value, 16).toString()).to.equal(amount.toString());
        });

        it('should support RPC method eth_getBlockByHash', async () => {
            const receipt = await provider.send('eth_getTransactionReceipt', [tx.hash]);
            const blockHash = receipt.blockHash;
            const block = await provider.send('eth_getBlockByHash', [blockHash, true]);

            expect(block).to.be.an('object');
            expect(block.hash).to.equal(blockHash);
            expect(parseInt(block.number, 16)).to.be.a('number');
            expect(parseInt(block.timestamp, 16)).to.be.a('number');
            checkBlockTimeStamp(parseInt(block.timestamp, 16));
            expect(block.transactions).to.be.an('array');
        });
    });

    it('should support RPC method eth_getBlockByNumber', async () => {
        const block = await provider.send('eth_getBlockByNumber', ['latest', true]);

        expect(block).to.be.an('object');
        expect(block.hash).to.be.a('string');
        expect(parseInt(block.number, 16)).to.be.a('number');
        expect(parseInt(block.timestamp, 16)).to.be.a('number');
        checkBlockTimeStamp(parseInt(block.timestamp, 16));
        expect(block.transactions).to.be.an('array');
    });

    it('should support RPC method eth_blockNumber', async () => {
        const blockNumber = await provider.send('eth_blockNumber', []);
        const blockNumberDecimal = BigNumber.from(blockNumber).toNumber();

        expect(blockNumber).to.be.a('string');
        expect(blockNumberDecimal).to.be.a('number');
        expect(blockNumberDecimal).to.be.gte(0);
    });

    it('should support RPC method eth_call', async () => {
        const newValue = 200;
        await rpcCompatibilityContract.updateValue(newValue).then((tx) => tx.wait());
        const callResult = await provider.send('eth_call', [
            {
                to: rpcCompatibilityContract.address,
                data: rpcCompatibilityContract.interface.encodeFunctionData('getValue'),
            },
            'latest',
        ]);

        const result = BigNumber.from(callResult).toNumber();
        expect(result).to.equal(newValue);
    });

    it('should support RPC method eth_getCode', async () => {
        const code = await provider.send('eth_getCode', [rpcCompatibilityContract.address, 'latest']);
        expect(code).to.be.a('string');
        expect(/^0x[0-9a-fA-F]*$/.test(code)).to.be.true;
        expect(code).to.equal(await rpcCompatibilityContract.getRuntimeCode());
    });

    it('should support RPC method eth_estimateGas', async () => {
        const newValue = 300;
        const gasLimit = network.config.gasOptions?.gasLimit || 50000;
        const txParams = {
            to: rpcCompatibilityContract.address,
            data: rpcCompatibilityContract.interface.encodeFunctionData('updateValue', [newValue]),
            gasLimit,
        };

        const estimatedGas = await provider.send('eth_estimateGas', [txParams]);

        expect(estimatedGas).to.be.a('string');
        expect(BigNumber.from(estimatedGas).gt(0)).to.be.true;
    });

    it('should support RPC method eth_gasPrice', async () => {
        const gasPrice = await provider.send('eth_gasPrice', []);

        expect(gasPrice).to.be.a('string');
        expect(BigNumber.from(gasPrice).toNumber()).to.be.above(0);
    });

    it('should support RPC method eth_chainId', async () => {
        const chainId = await provider.send('eth_chainId', []);

        expect(chainId).to.be.a('string');
        expect(BigNumber.from(chainId).toNumber()).to.be.above(0);
    });

    it('should support RPC method eth_getTransactionCount', async () => {
        const txCount = await provider.send('eth_getTransactionCount', [signers[0].address, 'latest']);

        expect(txCount).to.be.a('string');
        expect(BigNumber.from(txCount).toNumber()).to.be.at.least(0);

        const amount = getRandomInt(MAX_TRANSFER);
        const tx = await signer.sendTransaction({
            to: fundsReceiver,
            value: amount,
        });
        await tx.wait();
        const newTxCount = await provider.send('eth_getTransactionCount', [signers[0].address, 'latest']);

        expect(parseInt(txCount, 16) + 1).to.eq(parseInt(newTxCount, 16));
    });

    it('should support RPC method eth_sendRawTransaction', async () => {
        const privateKeys = isHardhat ? KnownAccount0PrivateKeyHardhat : keys?.accounts || keys.chains[network.name]?.accounts;
        provider = rpcUrl ? getDefaultProvider(rpcUrl) : ethers.provider;
        const wallet = new Wallet(privateKeys[0], provider);
        const newValue = 400;
        const tx = await signer.populateTransaction(await rpcCompatibilityContract.populateTransaction.updateValue(newValue));
        const rawTx = await wallet.signTransaction(tx);

        const txHash = await provider.send('eth_sendRawTransaction', [rawTx]);
        const receipt = await provider.waitForTransaction(txHash);
        const topic0 = keccak256(ethers.utils.toUtf8Bytes('ValueUpdated(uint256)'));
        expect(txHash).to.be.a('string');
        expect(txHash).to.match(/0x[0-9a-fA-F]{64}/);
        expect(receipt).to.not.be.null;
        expect(receipt.from).to.equal(signer.address);
        expect(receipt.to).to.equal(rpcCompatibilityContract.address);
        expect(receipt.status).to.equal(1);
        expect(receipt.logs[0].topics[0]).to.equal(topic0);
        expect(parseInt(receipt.logs[0].topics[1], 16)).to.equal(newValue);
    });

    it('should support RPC method eth_getBalance', async () => {
        const balance = await provider.send('eth_getBalance', [signers[0].address, 'latest']);

        expect(balance).to.be.a('string');
        expect(BigNumber.from(balance)).to.be.gt(0);
    });

    it('should support RPC method eth_syncing', async () => {
        const syncingStatus = await provider.send('eth_syncing', []);

        if (syncingStatus) {
            throw new Error('The provided rpc node is not synced');
        } else {
            expect(syncingStatus).to.be.false;
        }
    });

    it('should support RPC method eth_subscribe', async function () {
        // This uses eth_subscribe
        // Setting up manually via wss rpc is tricky
        const newValue = 500;
        let isSubscribe = false;
        rpcCompatibilityContract.on('ValueUpdatedForSubscribe', (value) => {
            expect(value.toNumber()).to.equal(newValue);
            isSubscribe = true;
        });

        await rpcCompatibilityContract.updateValueForSubscribe(newValue).then((tx) => tx.wait());
        const resolve = (res) =>
            setTimeout(() => {
                expect(isSubscribe).to.be.equal(true);
                res(null);
            }, 5000);
        await new Promise(resolve);
    });

    describe('eip-1559 supported rpc methods', () => {
        if (!isHardhat) {
            it('should support RPC method eth_maxPriorityFeePerGas', async () => {
                const maxPriorityFeePerGas = await provider.send('eth_maxPriorityFeePerGas', []);

                expect(maxPriorityFeePerGas).to.be.a('string');
                expect(BigNumber.from(maxPriorityFeePerGas).toNumber()).to.be.at.least(0);

                const gasLimit = network.config.gasOptions?.gasLimit || 50000;
                const gasOptions = { maxPriorityFeePerGas, gasLimit };
                const newValue = 600;
                const receipt = await rpcCompatibilityContract.updateValue(newValue, gasOptions).then((tx) => tx.wait());
                const topic0 = keccak256(ethers.utils.toUtf8Bytes('ValueUpdated(uint256)'));

                expect(receipt.from).to.equal(signer.address);
                expect(receipt.to).to.equal(rpcCompatibilityContract.address);
                expect(receipt.status).to.equal(1);
                expect(receipt.logs[0].topics[0]).to.equal(topic0);
                expect(parseInt(receipt.logs[0].topics[1], 16)).to.equal(newValue);
            });
        }

        it('should support RPC method eth_feeHistory', async () => {
            const feeHistory = await provider.send('eth_feeHistory', ['0x1', 'latest', [25, 75]]); // reference: https://docs.alchemy.com/reference/eth-feehistory

            expect(feeHistory).to.be.an('object');
            expect(parseInt(feeHistory.oldestBlock, 16)).to.be.an('number');
            expect(feeHistory.reward).to.be.an('array');

            const gasOptions = {};
            const baseFeePerGas = feeHistory.baseFeePerGas[0];
            gasOptions.gasPrice = BigNumber.from(baseFeePerGas);
            gasOptions.gasLimit = network.config.gasOptions?.gasLimit || 50000;
            const newValue = 700;
            const receipt = await rpcCompatibilityContract.updateValue(newValue, gasOptions).then((tx) => tx.wait());
            const topic0 = keccak256(ethers.utils.toUtf8Bytes('ValueUpdated(uint256)'));

            expect(receipt.from).to.equal(signer.address);
            expect(receipt.to).to.equal(rpcCompatibilityContract.address);
            expect(receipt.status).to.equal(1);
            expect(receipt.logs[0].topics[0]).to.equal(topic0);
            expect(parseInt(receipt.logs[0].topics[1], 16)).to.equal(newValue);
        });
    });
});
