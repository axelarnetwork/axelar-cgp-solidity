'use strict';

const { config, ethers } = require('hardhat');
const {
    utils: { defaultAbiCoder, id, arrayify, keccak256 },
} = ethers;
const { network } = require('hardhat');
const { sortBy } = require('lodash');

const getRandomInt = (max) => {
    return Math.floor(Math.random() * max);
};

const getRandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
};

const getAddresses = (wallets) => wallets.map(({ address }) => address);

const getSignaturesProof = async (data, operators, signers) => {
    const hash = arrayify(keccak256(data));
    const signatures = await Promise.all(
        sortBy(signers, (wallet) => wallet.address.toLowerCase()).map((wallet) => wallet.signMessage(hash)),
    );
    return defaultAbiCoder.encode(['address[]', 'bytes[]'], [getAddresses(operators), signatures]);
};

const getWeightedSignaturesProof = async (data, operators, weights, threshold, signers) => {
    const hash = arrayify(keccak256(data));
    const signatures = await Promise.all(
        sortBy(signers, (wallet) => wallet.address.toLowerCase()).map((wallet) => wallet.signMessage(hash)),
    );
    return defaultAbiCoder.encode(
        ['address[]', 'uint256[]', 'uint256', 'bytes[]'],
        [getAddresses(operators), weights, threshold, signatures],
    );
};

const getGasOptions = () => {
    return network.config.blockGasLimit ? { gasLimit: network.config.blockGasLimit.toString() } : {};
};

const getEVMVersion = () => {
    return config.solidity.compilers[0].settings.evmVersion;
};

module.exports = {
    getChainId: async () => await network.provider.send('eth_chainId'),

    getEVMVersion,

    getGasOptions,

    bigNumberToNumber: (bigNumber) => bigNumber.toNumber(),

    getSignaturesProof,

    getWeightedSignaturesProof,

    getSignedMultisigExecuteInput: async (data, operators, signers) =>
        defaultAbiCoder.encode(['bytes', 'bytes'], [data, await getSignaturesProof(data, operators, signers)]),

    getSignedWeightedExecuteInput: async (data, operators, weights, threshold, signers) =>
        defaultAbiCoder.encode(['bytes', 'bytes'], [data, await getWeightedSignaturesProof(data, operators, weights, threshold, signers)]),

    getRandomInt,

    getRandomID: () => id(getRandomInt(1e10).toString()),

    getRandomString,

    isHardhat: network.name === 'hardhat',

    tickBlockTime: (provider, seconds) => provider.send('evm_increaseTime', [seconds]),

    getAuthDeployParam: (operatorSets, operatorThresholds) =>
        operatorSets.map((operators, i) => defaultAbiCoder.encode(['address[]', 'uint256'], [operators, operatorThresholds[i]])),

    getWeightedAuthDeployParam: (operatorSets, weightSets, operatorThresholds) =>
        operatorSets.map((operators, i) =>
            defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [operators, weightSets[i], operatorThresholds[i]]),
        ),

    getWeightedProxyDeployParams: (governance, mintLimiter, operators, weights, operatorThreshold) =>
        arrayify(
            defaultAbiCoder.encode(
                ['address', 'address', 'bytes'],
                [
                    governance,
                    mintLimiter,
                    operators.length
                        ? defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [operators, weights, operatorThreshold])
                        : '0x',
                ],
            ),
        ),

    getDeployCommand: (name, symbol, decimals, cap, tokenAddress, dailyMintLimit) =>
        defaultAbiCoder.encode(
            ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
            [name, symbol, decimals, cap, tokenAddress, dailyMintLimit],
        ),

    getMintCommand: (symbol, address, amount) => defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount]),

    getBurnCommand: (symbol, salt) => defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt]),

    getTransferMultiOperatorshipCommand: (newOperators, threshold) =>
        defaultAbiCoder.encode(['address[]', 'uint256'], [sortBy(newOperators, (address) => address.toLowerCase()), threshold]),

    getTransferWeightedOperatorshipCommand: (newOperators, newWeights, threshold) =>
        defaultAbiCoder.encode(
            ['address[]', 'uint256[]', 'uint256'],
            [sortBy(newOperators, (address) => address.toLowerCase()), newWeights, threshold],
        ),

    getApproveContractCall: (sourceChain, source, destination, payloadHash, sourceTxHash, sourceEventIndex) =>
        defaultAbiCoder.encode(
            ['string', 'string', 'address', 'bytes32', 'bytes32', 'uint256'],
            [sourceChain, source, destination, payloadHash, sourceTxHash, sourceEventIndex],
        ),

    getApproveContractCallWithMint: (sourceChain, source, destination, payloadHash, symbol, amount, sourceTxHash, sourceEventIndex) =>
        defaultAbiCoder.encode(
            ['string', 'string', 'address', 'bytes32', 'string', 'uint256', 'bytes32', 'uint256'],
            [sourceChain, source, destination, payloadHash, symbol, amount, sourceTxHash, sourceEventIndex],
        ),

    buildCommandBatch: (chainId, commandIDs, commandNames, commands) =>
        arrayify(defaultAbiCoder.encode(['uint256', 'bytes32[]', 'string[]', 'bytes[]'], [chainId, commandIDs, commandNames, commands])),

    buildCommandBatchWithRole: (chainId, role, commandIDs, commandNames, commands) =>
        arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [chainId, role, commandIDs, commandNames, commands],
            ),
        ),

    getAddresses,
};
