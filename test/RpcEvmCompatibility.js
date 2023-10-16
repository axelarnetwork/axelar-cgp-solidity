'use strict';

const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { hexValue, getAddress, keccak256 },
    Wallet,
    BigNumber,
} = ethers;
const { expect } = chai;

const { isHardhat, getRandomInt, waitFor } = require('./utils');

const TestRpcCompatibility = require('../artifacts/contracts/test/TestRpcCompatibility.sol/TestRpcCompatibility.json');

function checkBlockTimeStamp(timeStamp) {
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDifference = Math.abs(currentTime - timeStamp);
    expect(timeDifference).to.be.lessThan(100);
}

describe('EVM RPC Compatibility Test', () => {
    const maxTransferAmount = 100;

    let provider;
    let signer;
    let transferAmount;
    let rpcCompatibilityFactory;
    let rpcCompatibilityContract;

    async function checkReceipt(receipt, value) {
        const topic = keccak256(ethers.utils.toUtf8Bytes('ValueUpdated(uint256)'));

        expect(receipt).to.not.be.null;
        expect(receipt.from).to.equal(signer.address);
        expect(receipt.to).to.equal(rpcCompatibilityContract.address);
        expect(receipt.status).to.equal(1);
        expect(receipt.logs[0].topics[0]).to.equal(topic);
        expect(parseInt(receipt.logs[0].topics[1], 16)).to.equal(value);
    }

    before(async () => {
        provider = ethers.provider;
        [signer] = await ethers.getSigners();

        rpcCompatibilityFactory = await ethers.getContractFactory('TestRpcCompatibility', signer);
        rpcCompatibilityContract = await rpcCompatibilityFactory.deploy();
        await rpcCompatibilityContract.deployTransaction.wait(network.config.confirmations);

        transferAmount = getRandomInt(maxTransferAmount);
    });

    it('should support RPC method eth_getLogs', async () => {
        const newValue = 100;
        const receipt = await rpcCompatibilityContract.updateValue(newValue).then((tx) => tx.wait());
        const blockNumber = hexValue(receipt.blockNumber);
        const logs = [];

        let filter = {
            fromBlock: blockNumber,
            toBlock: blockNumber,
        };
        let log = await provider.send('eth_getLogs', [filter]);
        logs.push(log);
        filter = {
            fromBlock: blockNumber,
            toBlock: 'latest',
        };
        log = await provider.send('eth_getLogs', [filter]);
        logs.push(log);
        filter = {
            fromBlock: blockNumber,
            toBlock: 'pending',
        };
        log = await provider.send('eth_getLogs', [filter]);
        logs.push(log);

        if (network.name.toLowerCase() === 'ethereum') {
            filter = {
                fromBlock: blockNumber,
                toBlock: 'safe',
            };
            log = await provider.send('eth_getLogs', [filter]);
            logs.push(log);
            filter = {
                fromBlock: blockNumber,
                toBlock: 'finalized',
            };
            log = await provider.send('eth_getLogs', [filter]);
            logs.push(log);
        }

        logs.forEach((log) => {
            expect(log).to.be.an('array');
            expect(log.length).to.be.greaterThan(0);
        });
    });

    describe('rpc get transaction and blockByHash methods', () => {
        let tx;

        before(async () => {
            tx = await signer.sendTransaction({
                to: signer.address,
                value: transferAmount,
            });
            await tx.wait();
        });

        it('should support RPC method eth_getTransactionReceipt', async () => {
            const receipt = await provider.send('eth_getTransactionReceipt', [tx.hash]);

            expect(receipt).to.be.an('object');
            expect(parseInt(receipt.blockNumber, 16)).to.be.a('number');
            expect(getAddress(receipt.to)).to.equal(signer.address);
        });

        it('should support RPC method eth_getTransactionByHash', async () => {
            const txInfo = await provider.send('eth_getTransactionByHash', [tx.hash]);

            expect(txInfo).to.be.an('object');
            expect(getAddress(txInfo.to)).to.equal(signer.address);
            expect(parseInt(txInfo.value, 16).toString()).to.equal(transferAmount.toString());
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
        const blocks = [];
        let block = await provider.send('eth_getBlockByNumber', ['latest', true]);
        expect(block.hash).to.be.a('string');
        checkBlockTimeStamp(parseInt(block.timestamp, 16));
        blocks.push(block);

        block = await provider.send('eth_getBlockByNumber', ['earliest', true]);
        expect(block.hash).to.be.a('string');
        blocks.push(block);

        block = await provider.send('eth_getBlockByNumber', ['pending', true]);
        checkBlockTimeStamp(parseInt(block.timestamp, 16));
        blocks.push(block);

        block = await provider.send('eth_getBlockByNumber', ['safe', true]);
        checkBlockTimeStamp(parseInt(block.timestamp, 16));
        blocks.push(block);

        block = await provider.send('eth_getBlockByNumber', ['finalized', true]);
        checkBlockTimeStamp(parseInt(block.timestamp, 16));
        blocks.push(block);

        block = await provider.send('eth_getBlockByNumber', ['0x1', true]);
        expect(block.hash).to.be.a('string');
        blocks.push(block);

        blocks.forEach((block) => {
            expect(block).to.be.an('object');
            expect(parseInt(block.number, 16)).to.be.a('number');
            expect(parseInt(block.timestamp, 16)).to.be.a('number');
            expect(block.transactions).to.be.an('array');
        });
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
        expect(code).to.equal(TestRpcCompatibility.deployedBytecode);
    });

    it('should support RPC method eth_estimateGas', async () => {
        const newValue = 300;
        const txParams = {
            to: rpcCompatibilityContract.address,
            data: rpcCompatibilityContract.interface.encodeFunctionData('updateValue', [newValue]),
        };

        const estimatedGas = await provider.send('eth_estimateGas', [txParams]);
        const gas = BigNumber.from(estimatedGas);

        expect(estimatedGas).to.be.a('string');
        expect(gas.gt(0)).to.be.true;
        expect(gas.lt(30000)).to.be.true; // report if gas estimation is different than ethereum
    });

    it('should support RPC method eth_gasPrice', async () => {
        const gasPrice = await provider.send('eth_gasPrice', []);

        expect(gasPrice).to.be.a('string');
        expect(BigNumber.from(gasPrice).toNumber()).to.be.above(0);
    });

    it('should support RPC method eth_chainId', async () => {
        const chainId = await provider.send('eth_chainId', []);

        expect(chainId).to.be.a('string');
        expect(BigNumber.from(chainId).toNumber()).to.equal(network.config.chainId);
    });

    it('should support RPC method eth_getTransactionCount', async () => {
        const txCount = await provider.send('eth_getTransactionCount', [signer.address, 'latest']);

        expect(txCount).to.be.a('string');
        const count = parseInt(txCount, 16);
        expect(count).to.be.at.least(0);

        await signer
            .sendTransaction({
                to: signer.address,
                value: transferAmount,
            })
            .then((tx) => tx.wait());

        const newTxCount = await provider.send('eth_getTransactionCount', [signer.address, 'latest']);

        expect(count + 1).to.eq(parseInt(newTxCount, 16));
    });

    it('should support RPC method eth_sendRawTransaction', async () => {
        const wallet = isHardhat ? Wallet.fromMnemonic(network.config.accounts.mnemonic) : new Wallet(network.config.accounts[0]);

        const newValue = 400;
        const tx = await signer.populateTransaction(await rpcCompatibilityContract.populateTransaction.updateValue(newValue));
        const rawTx = await wallet.signTransaction(tx);

        const txHash = await provider.send('eth_sendRawTransaction', [rawTx]);
        const receipt = await provider.waitForTransaction(txHash);

        expect(txHash).to.be.a('string');
        expect(txHash).to.match(/0x[0-9a-fA-F]{64}/);
        await checkReceipt(receipt, newValue);
    });

    it('should support RPC method eth_getBalance', async () => {
        const balance = await provider.send('eth_getBalance', [signer.address, 'latest']);

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
        await waitFor(5, () => {
            expect(isSubscribe).to.equal(true);
        });
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
                await checkReceipt(receipt, newValue);
            });
        }

        it('should send transaction based on RPC method eth_feeHistory pricing', async () => {
            const feeHistory = await provider.send('eth_feeHistory', ['0x1', 'latest', [25]]); // reference: https://docs.alchemy.com/reference/eth-feehistory

            expect(feeHistory).to.be.an('object');
            expect(parseInt(feeHistory.oldestBlock, 16)).to.be.an('number');
            feeHistory.baseFeePerGas.forEach((baseFee) => {
                expect(parseInt(baseFee, 16)).to.be.greaterThan(0);
            });
            expect(feeHistory.reward).to.be.an('array');

            const gasOptions = {};
            const baseFeePerGas = feeHistory.baseFeePerGas[0];
            gasOptions.maxFeePerGas = BigNumber.from(baseFeePerGas) * 3;
            gasOptions.maxPriorityFeePerGas = feeHistory.reward[0][0];
            const newValue = 700;
            const receipt = await rpcCompatibilityContract.updateValue(newValue, gasOptions).then((tx) => tx.wait());
            await checkReceipt(receipt, newValue);
        });
    });
});
