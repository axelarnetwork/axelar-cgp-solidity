'use strict';

const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { hexValue, getAddress, keccak256, id, hexlify, randomBytes },
    Wallet,
    BigNumber,
} = ethers;
const { expect } = chai;

const { isHardhat, getRandomInt, waitFor, getGasOptions } = require('./utils');

const TestRpcCompatibility = require('../artifacts/contracts/test/TestRpcCompatibility.sol/TestRpcCompatibility.json');

describe('RpcCompatibility', () => {
    const maxTransferAmount = 100;

    let provider;
    let signer;
    let transferAmount;
    let rpcCompatibilityFactory;
    let rpcCompatibilityContract;

    async function checkReceipt(receipt, value) {
        const expectedTopic = keccak256(ethers.utils.toUtf8Bytes('ValueUpdated(uint256)'));

        expect(receipt).to.not.be.null;
        expect(receipt.from).to.equal(signer.address);
        expect(receipt.to).to.equal(rpcCompatibilityContract.address);
        expect(receipt.status).to.equal(1);
        const foundLog = receipt.logs.find((log) => log.topics && log.topics[0] === expectedTopic);
        expect(foundLog, 'ValueUpdated event not found in logs from tx receipt').to.exist;
        expect(parseInt(foundLog.topics[1], 16), 'ValueUpdated event log mismatch').to.equal(value);
        expect(receipt.logs[0].topics[0], "ValueUpdated found, but it's expected to be the first log").to.equal(expectedTopic);
    }

    function checkBlockTimeStamp(timeStamp, maxDifference) {
        const currentTime = Math.floor(Date.now() / 1000);
        const timeDifference = Math.abs(currentTime - timeStamp);
        expect(timeDifference).to.be.lessThanOrEqual(maxDifference);
    }

    async function validParentHashes(blockTag) {
        const withTransaction = false;
        const block = await provider.send('eth_getBlockByNumber', [blockTag, withTransaction]);
        const parentBlock = await provider.send('eth_getBlockByHash', [block.parentHash, withTransaction]);

        expect(parentBlock.hash).to.equal(block.parentHash);
    }

    before(async () => {
        provider = ethers.provider;
        [signer] = await ethers.getSigners();

        rpcCompatibilityFactory = await ethers.getContractFactory('TestRpcCompatibility', signer);
        rpcCompatibilityContract = await rpcCompatibilityFactory.deploy();
        await rpcCompatibilityContract.deployTransaction.wait(network.config.confirmations);

        transferAmount = getRandomInt(maxTransferAmount);
    });

    describe('eth_getLogs', () => {
        const newValue = 100;
        let blockNumber;

        async function checkLog(filter) {
            const log = await provider.send('eth_getLogs', [filter]);

            expect(log).to.be.an('array');
            expect(log.length).to.be.at.least(0);

            if (filter.topics) {
                const found = log.some((item) => item.topics && item.topics[0] === filter.topics[0]);
                expect(found).to.equal(true);
            }
        }

        before(async () => {
            const receipt = await rpcCompatibilityContract.updateValue(newValue).then((tx) => tx.wait());
            blockNumber = hexValue(receipt.blockNumber);
        });

        it('should support RPC method eth_getLogs', async () => {
            const expectedTopic = keccak256(ethers.utils.toUtf8Bytes('ValueUpdated(uint256)'));

            let filter = {
                fromBlock: blockNumber,
                toBlock: blockNumber,
                address: [rpcCompatibilityContract.address],
                topics: [expectedTopic],
            };
            await checkLog(filter);

            filter = {
                fromBlock: blockNumber,
                toBlock: 'latest',
                address: [rpcCompatibilityContract.address],
                topics: [expectedTopic],
            };
            await checkLog(filter);
        });

        it('supports safe tag', async () => {
            let isLarger = false;

            try {
                const safeBlockNumber = await provider.send('eth_getBlockByNumber', ['safe', false]);

                if (safeBlockNumber && safeBlockNumber.number !== null) {
                    isLarger = safeBlockNumber.number >= blockNumber;

                    if (isLarger) {
                        console.log('Achieved safety for the block instantly');
                    }
                }
            } catch (error) {
                console.error('Failed to retrieve safe block number:', error);
            }

            const fromBlock = isLarger ? blockNumber : 'safe';
            const toBlock = fromBlock === 'safe' ? blockNumber : 'safe';
            const filter = {
                fromBlock,
                toBlock,
            };
            await checkLog(filter);
        });

        describe('supports finalized tag', () => {
            let finalizedBlockNumber;

            before(async () => {
                try {
                    finalizedBlockNumber = await provider.send('eth_getBlockByNumber', ['finalized', false]);
                } catch (error) {
                    console.error('Failed to retrieve finalized block number:', error);
                    throw error;
                }
            });

            it('should return latest.number > finalized.number', async () => {
                let isLarger = false;

                if (finalizedBlockNumber && finalizedBlockNumber.number !== null) {
                    isLarger = finalizedBlockNumber.number >= blockNumber;

                    if (isLarger) {
                        console.log('Achieved finality for the block instantly');
                    }
                }

                const fromBlock = isLarger ? blockNumber : 'finalized';
                const toBlock = fromBlock === 'finalized' ? blockNumber : 'finalized';
                const filter = {
                    fromBlock: isHardhat ? hexValue(0) : fromBlock,
                    toBlock,
                };
                await checkLog(filter);
            });
        });

        it('should have valid parent hash', async () => {
            validParentHashes('finalized');
        });

        it('should fail on querying eth_getLogs with a random blockHash', async () => {
            const randomBlockHash = hexlify(randomBytes(32));

            const params = [
                {
                    blockHash: randomBlockHash,
                },
            ];

            await expect(provider.send('eth_getLogs', params)).to.be.rejected;
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
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 100);
            expect(block.transactions).to.be.an('array');
        });
    });

    describe('eth_getBlockByNumber', () => {
        function checkBlock(block, hydratedTransactions) {
            expect(block.hash).to.be.a('string');
            expect(block).to.be.an('object');
            expect(parseInt(block.number, 16)).to.be.a('number');
            expect(parseInt(block.timestamp, 16)).to.be.a('number');
            expect(block.transactions).to.be.an('array');

            if (hydratedTransactions) {
                block.transactions.forEach((transaction) => {
                    expect(transaction).to.be.an('object');
                });
            } else {
                block.transactions.forEach((txHash) => {
                    expect(txHash).to.be.a('string');
                    expect(txHash).to.match(/0x[0-9a-fA-F]{64}/);
                });
            }
        }

        it('should support RPC method eth_getBlockByNumber', async () => {
            let block = await provider.send('eth_getBlockByNumber', ['latest', true]);
            checkBlock(block, true);
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 100);
            block = await provider.send('eth_getBlockByNumber', ['latest', false]);
            checkBlock(block, false);
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 100);

            block = await provider.send('eth_getBlockByNumber', ['earliest', true]);
            checkBlock(block, true);
            block = await provider.send('eth_getBlockByNumber', ['earliest', false]);
            checkBlock(block, false);

            block = await provider.send('eth_getBlockByNumber', ['0x1', true]);
            checkBlock(block, true);
            block = await provider.send('eth_getBlockByNumber', ['0x1', false]);
            checkBlock(block, false);
        });

        it('supports safe tag', async () => {
            let block = await provider.send('eth_getBlockByNumber', ['safe', true]);
            checkBlock(block, true);
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 12000);

            block = await provider.send('eth_getBlockByNumber', ['safe', false]);
            checkBlock(block, false);
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 12000);
        });

        it('supports finalized tag', async () => {
            let block = await provider.send('eth_getBlockByNumber', ['finalized', true]);
            checkBlock(block, true);
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 12000);

            block = await provider.send('eth_getBlockByNumber', ['finalized', false]);
            checkBlock(block, false);
            checkBlockTimeStamp(parseInt(block.timestamp, 16), 12000);
        });

        it('should have valid parent hashes', async () => {
            // Note: If chain doesn't have instant finality, reorgs could cause this to fail
            validParentHashes('latest');
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

    describe('eth_estimateGas', () => {
        it('should support RPC method eth_estimateGas like ethereum mainnet', async () => {
            const newValue = 300;
            const txParams = {
                to: rpcCompatibilityContract.address,
                data: rpcCompatibilityContract.interface.encodeFunctionData('updateValue', [newValue]),
            };

            const estimatedGas = await provider.send('eth_estimateGas', [txParams]);
            const gas = BigNumber.from(estimatedGas);

            expect(estimatedGas).to.be.a('string');
            expect(gas).to.be.gt(0);
            expect(gas).to.be.lt(30000); // report if gas estimation does not matches Ethereum's behavior to adjust core configuration if necessary.
        });

        it('should send tx with estimated gas', async () => {
            const newValue = 300;
            const tx = await signer.populateTransaction(await rpcCompatibilityContract.populateTransaction.updateValue(newValue));

            const estimatedGas = await provider.estimateGas(tx);
            const receipt = await rpcCompatibilityContract.updateValue(newValue, { gasLimit: estimatedGas }).then((tx) => tx.wait());

            await checkReceipt(receipt, newValue);
        });
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

    it('should support RPC method eth_sendRawTransaction [ @skip-on-coverage ]', async () => {
        const wallet = isHardhat ? Wallet.fromMnemonic(network.config.accounts.mnemonic) : new Wallet(network.config.accounts[0]);

        const gasOptions = getGasOptions(network.config.chainId);
        const newValue = 400;
        const tx = await signer.populateTransaction(await rpcCompatibilityContract.populateTransaction.updateValue(newValue, gasOptions));
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
        const newValue = 1000;
        let found = false;
        rpcCompatibilityContract.on('ValueUpdatedForSubscribe', (value) => {
            expect(value.toNumber()).to.equal(newValue);
            found = true;
        });

        await rpcCompatibilityContract.updateValueForSubscribe(newValue).then((tx) => tx.wait());
        await waitFor(5, () => {
            expect(found).to.be.true;
        });
    });

    it('should return consistent logIndex values between eth_getLogs and eth_getTransactionReceipt', async () => {
        const amount = 100;

        const receipt = await rpcCompatibilityContract.updateValue(amount).then((tx) => tx.wait());
        const logsFromReceipt = receipt.logs;

        const eventSignature = id('ValueUpdated(uint256)');
        const expectedEvent = logsFromReceipt.find((log) => log.topics[0] === eventSignature);
        expect(expectedEvent, 'ValueUpdated event not found in logs from tx receipt').to.exist.and.to.not.be.null;

        const blockNumber = '0x' + parseInt(receipt.blockNumber).toString(16);
        const logsFromGetLogs = await provider.send('eth_getLogs', [
            {
                fromBlock: blockNumber,
                toBlock: blockNumber,
            },
        ]);

        const matchingEvent = logsFromGetLogs.find((log) => log.topics[0] === eventSignature);
        expect(matchingEvent, 'ValueUpdated event not found in logs from eth_getLogs').to.not.be.null;

        expect(parseInt(expectedEvent.logIndex)).to.equal(
            parseInt(matchingEvent.logIndex),
            'Log index mismatch between tx receipt and eth_getLogs',
        );
    });

    describe('eip-1559 supported rpc methods', () => {
        if (!isHardhat) {
            it('should support RPC method eth_maxPriorityFeePerGas', async () => {
                const maxPriorityFeePerGas = await provider.send('eth_maxPriorityFeePerGas', []);

                expect(maxPriorityFeePerGas).to.be.a('string');
                expect(BigNumber.from(maxPriorityFeePerGas).toNumber()).to.be.at.least(0);

                const newValue = 600;
                const receipt = await rpcCompatibilityContract.updateValue(newValue).then((tx) => tx.wait());
                await checkReceipt(receipt, newValue);
            });
        }

        // convert hex strings to big number and find the max
        function maxHexInt(array) {
            return array.reduce((a, b) => {
                const a1 = BigNumber.from(a);
                const b1 = BigNumber.from(b);

                if (a1.gt(b1)) {
                    return a1;
                }

                return b1;
            }, BigNumber.from('0x0'));
        }

        it('should send transaction based on RPC method eth_feeHistory pricing', async () => {
            const feeHistory = await provider.send('eth_feeHistory', ['0x5', 'latest', [50]]); // reference: https://docs.alchemy.com/reference/eth-feehistory

            expect(feeHistory).to.be.an('object');
            expect(parseInt(feeHistory.oldestBlock, 16)).to.be.an('number');
            feeHistory.baseFeePerGas.forEach((baseFee) => {
                expect(parseInt(baseFee, 16)).to.be.greaterThanOrEqual(0);
            });
            expect(feeHistory.reward).to.be.an('array');

            const gasOptions = {};
            const baseFeePerGas = maxHexInt(feeHistory.baseFeePerGas);
            gasOptions.maxPriorityFeePerGas = maxHexInt(feeHistory.reward.map((a) => a[0]));

            gasOptions.maxFeePerGas = baseFeePerGas.add(gasOptions.maxPriorityFeePerGas);

            const newValue = 700;
            const receipt = await rpcCompatibilityContract.updateValue(newValue, gasOptions).then((tx) => tx.wait());
            await checkReceipt(receipt, newValue);
        });
    });
});
