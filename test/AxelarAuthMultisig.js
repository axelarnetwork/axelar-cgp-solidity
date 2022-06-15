const { sortBy } = require('lodash');
const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { arrayify, defaultAbiCoder, keccak256, hashMessage },
} = ethers;
const { expect } = chai;

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const OLD_KEY_RETENTION = 16;

const { getAddresses, getAuthDeployParam, getSignaturesProof, getTransferMultiOperatorshipCommand } = require('./utils');

describe('AxelarAuthMultisig', () => {
    const threshold = 3;

    let wallets;
    let owner;
    let operators;
    let previousOperators = [];

    let authFactory;

    let auth;

    before(async () => {
        wallets = await ethers.getSigners();

        owner = wallets[0];
        operators = sortBy(wallets.slice(3, 9), (wallet) => wallet.address.toLowerCase());

        let previousOperatorsLimit = OLD_KEY_RETENTION;
        for (let i = 0; i < wallets.length - 3; i++) {
            for (let j = i; j < wallets.length - 3; j++) {
                previousOperators.push(sortBy(wallets.slice(i, j + 3), (wallet) => wallet.address.toLowerCase()));
                --previousOperatorsLimit;
            }
            if (previousOperatorsLimit <= 0) break;
        }

        authFactory = await ethers.getContractFactory('AxelarAuthMultisig', owner);
    });

    beforeEach(async () => {
        const initialOperators = [...previousOperators, operators];

        auth = await authFactory
            .deploy(
                getAuthDeployParam(
                    initialOperators.map(getAddresses),
                    initialOperators.map(() => threshold),
                ),
            )
            .then((d) => d.deployed());
    });

    describe('validateProof', () => {
        it('validate the proof from the current operators', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const isCurrentOperators = await auth.validateProof(
                message,
                getSignaturesProof(data, operators, operators.slice(0, threshold)),
            );

            await expect(isCurrentOperators).to.be.equal(true);
        });

        it('reject the proof if signatures are not matching the threshold', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            await expect(
                auth.validateProof(message, getSignaturesProof(data, operators, operators.slice(0, threshold + 1))),
            ).to.be.revertedWith('InvalidOperators()');
        });

        it('reject the proof if signatures are invalid', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            await expect(auth.validateProof(message, getSignaturesProof(data, operators, wallets.slice(0, threshold)))).to.be.revertedWith(
                'MalformedSigners()',
            );
        });

        it('validate the proof from the recent operators', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const validPreviousOperators = previousOperators.slice(-(OLD_KEY_RETENTION - 1));

            await expect(validPreviousOperators.length).to.be.equal(OLD_KEY_RETENTION - 1);

            await Promise.all(
                validPreviousOperators.map(async (operators) => {
                    const isCurrentOperators = await auth.validateProof(
                        message,
                        getSignaturesProof(data, operators, operators.slice(0, threshold)),
                    );
                    await expect(isCurrentOperators).to.be.equal(false);
                }),
            );
        });

        it('reject the proof from the operators older than key retention', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const invalidPreviousOperators = previousOperators.slice(0, -(OLD_KEY_RETENTION - 1));

            await Promise.all(
                invalidPreviousOperators.map(async (operators) => {
                    await expect(
                        auth.validateProof(message, getSignaturesProof(data, operators, operators.slice(0, threshold))),
                    ).to.be.revertedWith('InvalidOperators()');
                }),
            );
        });

        it('validate the proof for a single operator', async () => {
            const signleOperator = getAddresses([owner]);

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(signleOperator, 1)))
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(signleOperator, 1);

            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const isCurrentOperators = await auth.validateProof(message, getSignaturesProof(data, [owner], [owner]));

            await expect(isCurrentOperators).to.be.equal(true);
        });
    });

    describe('transferOperatorship', () => {
        it('should allow owner to transfer operatorship', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(newOperators, 2)))
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(newOperators, 2);
        });

        it('should not allow transferring operatorship to address zero', async () => {
            const newOperators = [ADDRESS_ZERO, '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(newOperators, 2))).to.be.revertedWith(
                'InvalidOperators()',
            );
        });

        it('should not allow transferring operatorship to duplicated operators', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(newOperators, 2))).to.be.revertedWith(
                'InvalidOperators()',
            );
        });

        it('should not allow transferring operatorship to unsorted operators', async () => {
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            await expect(auth.transferOperatorship(defaultAbiCoder.encode(['address[]', 'uint256'], [newOperators, 2]))).to.be.revertedWith(
                'InvalidOperators()',
            );
        });

        it('should not allow operatorship transfer to the previous operators ', async () => {
            const updatedOperators = getAddresses(operators.slice(0, threshold));

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(updatedOperators, threshold)))
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(updatedOperators, threshold);

            const oldOperators = getAddresses(operators);

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(oldOperators, threshold))).to.be.revertedWith(
                'SameOperators()',
            );
        });

        it('should not allow transferring operatorship with invalid threshold', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(newOperators, 0))).to.be.revertedWith(
                'InvalidThreshold()',
            );
            await expect(auth.transferOperatorship(getTransferMultiOperatorshipCommand(newOperators, 3))).to.be.revertedWith(
                'InvalidThreshold()',
            );
        });
    });

    describe('hashForEpoch and epochForHash', () => {
        it('should expose correct hashes and epoch', async () => {
            const operatorsHistory = [...previousOperators, operators];

            await Promise.all(
                operatorsHistory.map(async (operators, i) => {
                    const hash = keccak256(getTransferMultiOperatorshipCommand(getAddresses(operators), threshold));
                    expect(await auth.hashForEpoch(i + 1)).to.be.equal(hash);
                    expect(await auth.epochForHash(hash)).to.be.equal(i + 1);
                }),
            );
        });
    });
});
