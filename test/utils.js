'use strict';

const {
    utils: { defaultAbiCoder, id, arrayify, keccak256 },
} = require('ethers');
const { sortBy } = require('lodash');

const getRandomInt = (max) => {
    return Math.floor(Math.random() * max);
};

module.exports = {
    bigNumberToNumber: (bigNumber) => bigNumber.toNumber(),

    getSignedExecuteInput: (data, wallet) =>
        wallet.signMessage(arrayify(keccak256(data))).then((signature) => defaultAbiCoder.encode(['bytes', 'bytes'], [data, signature])),

    getSignedMultisigExecuteInput: (data, wallets) =>
        Promise.all(
            sortBy(wallets, (wallet) => wallet.address.toLowerCase()).map((wallet) => wallet.signMessage(arrayify(keccak256(data)))),
        ).then((signatures) => defaultAbiCoder.encode(['bytes', 'bytes[]'], [data, signatures])),

    getRandomInt,

    getRandomID: () => id(getRandomInt(1e10).toString()),

    tickBlockTime: (provider, seconds) => provider.send('evm_increaseTime', [seconds]),

    getSinglesigProxyDeployParams: (admins, adminThreshold, owner, operator) =>
        arrayify(defaultAbiCoder.encode(['address[]', 'uint8', 'address', 'address'], [admins, adminThreshold, owner, operator])),

    getMultisigProxyDeployParams: (admins, adminThreshold, owners, ownerThreshold, operators, operatorThreshold) =>
        arrayify(
            defaultAbiCoder.encode(
                ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
                [admins, adminThreshold, owners, ownerThreshold, operators, operatorThreshold],
            ),
        ),

    getDeployCommand: (name, symbol, decimals, cap, tokenAddress, dailyMintLimit) =>
        defaultAbiCoder.encode(
            ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
            [name, symbol, decimals, cap, tokenAddress, dailyMintLimit],
        ),

    getMintCommand: (symbol, address, amount) => defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount]),

    getBurnCommand: (symbol, salt) => defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt]),

    getTransferMultiOwnershipCommand: (newOwners, threshold) => defaultAbiCoder.encode(['address[]', 'uint8'], [newOwners, threshold]),

    getTransferOwnershipCommand: (newOwner) => defaultAbiCoder.encode(['address'], [newOwner]),

    getTransferMultiOperatorshipCommand: (newOperators, threshold) =>
        defaultAbiCoder.encode(['address[]', 'uint8'], [newOperators, threshold]),

    getTransferOperatorshipCommand: (newOperator) => defaultAbiCoder.encode(['address'], [newOperator]),

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

    buildCommandBatch: (chianId, role, commandIDs, commandNames, commands) =>
        arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [chianId, role, commandIDs, commandNames, commands],
            ),
        ),

    getAddresses: (wallets) => wallets.map(({ address }) => address),
};
