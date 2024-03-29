const { sortBy } = require('lodash');
const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { arrayify, defaultAbiCoder, keccak256, hashMessage },
} = ethers;
const { expect } = chai;

const {
    getAddresses,
    getWeightedAuthDeployParam,
    getWeightedSignaturesProof,
    getTransferWeightedOperatorshipCommand,
    expectRevert,
} = require('../utils');

describe('AxelarAuthWeighted', () => {
    const threshold = 2;

    let wallets;
    let owner;
    let operators;
    const previousOperators = [];

    let authFactory;

    let auth;

    before(async () => {
        wallets = await ethers.getSigners();

        owner = wallets[0];
        operators = sortBy(wallets.slice(1, 3), (wallet) => wallet.address.toLowerCase());
        previousOperators.push(sortBy(wallets.slice(0, 2), (wallet) => wallet.address.toLowerCase()));

        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', owner);
    });

    beforeEach(async () => {
        const initialOperators = [...previousOperators, operators];

        auth = await authFactory.deploy(
            getWeightedAuthDeployParam(
                initialOperators.map(getAddresses),
                initialOperators.map(({ length }) => Array(length).fill(1)), // weights
                initialOperators.map(() => threshold),
            ),
        );
        await auth.deployTransaction.wait(network.config.confirmations);
    });

    describe('validateProof', () => {
        it('validate the proof from the current operators', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const isCurrentOperators = await auth.validateProof(
                message,
                getWeightedSignaturesProof(
                    data,
                    operators,
                    operators.map(() => 1),
                    threshold,
                    operators.slice(0, threshold),
                ),
            );

            expect(isCurrentOperators).to.be.equal(true);
        });

        it('reject the proof for a non-existant epoch hash', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const invalidOperators = [owner, owner, owner];

            await expectRevert(
                (gasOptions) =>
                    auth.validateProof(
                        message,
                        getWeightedSignaturesProof(
                            data,
                            invalidOperators,
                            invalidOperators.map(() => 1),
                            threshold,
                            invalidOperators.slice(0, threshold - 1),
                        ),
                        gasOptions,
                    ),
                auth,
                'InvalidOperators',
            );
        });

        it('reject the proof if weights are not matching the threshold', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            await expectRevert(
                (gasOptions) =>
                    auth.validateProof(
                        message,
                        getWeightedSignaturesProof(
                            data,
                            operators,
                            operators.map(() => 1),
                            threshold,
                            operators.slice(0, threshold - 1),
                        ),
                        gasOptions,
                    ),
                auth,
                'LowSignaturesWeight',
            );
        });

        it('reject the proof if signatures are invalid', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            await expectRevert(
                (gasOptions) =>
                    auth.validateProof(
                        message,
                        getWeightedSignaturesProof(
                            data,
                            operators,
                            operators.map(() => 1),
                            threshold,
                            wallets.slice(0, threshold),
                        ),
                        gasOptions,
                    ),
                auth,
                'MalformedSigners',
            );
        });

        it('validate the proof for a single operator', async () => {
            const signleOperator = getAddresses([owner]);

            await expect(auth.transferOperatorship(getTransferWeightedOperatorshipCommand(signleOperator, [1], 1)))
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(signleOperator, [1], 1);

            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const isCurrentOperators = await auth.validateProof(message, getWeightedSignaturesProof(data, [owner], [1], 1, [owner]));

            await expect(isCurrentOperators).to.be.equal(true);
        });

        it('validate the proof for a single signer', async () => {
            await expect(
                auth.transferOperatorship(
                    getTransferWeightedOperatorshipCommand(
                        getAddresses(operators),
                        operators.map(() => 1),
                        1,
                    ),
                ),
            )
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(
                    getAddresses(operators),
                    operators.map(() => 1),
                    1,
                );

            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const isCurrentOperators = await auth.validateProof(
                message,
                getWeightedSignaturesProof(
                    data,
                    operators,
                    operators.map(() => 1),
                    1,
                    operators.slice(0, 1),
                ),
            );

            await expect(isCurrentOperators).to.be.equal(true);
        });
    });

    describe('validateProof with OLD_KEY_RETENTION as 16', () => {
        const OLD_KEY_RETENTION = 16;
        let newAuth;
        const previousOperators = [];
        before(async () => {
            for (let i = 0; i < OLD_KEY_RETENTION; i++) {
                previousOperators.push(sortBy(wallets.slice(0, 2), (wallet) => wallet.address.toLowerCase()));
            }

            const initialOperators = [...previousOperators, operators];
            newAuth = await authFactory.deploy(
                getWeightedAuthDeployParam(
                    initialOperators.map(getAddresses),
                    initialOperators.map(({ length }, index) => Array(length).fill(index + 1)), // weights
                    initialOperators.map(() => threshold),
                ),
            );
            await newAuth.deployTransaction.wait(network.config.confirmations);
        });

        it('validate the proof from the recent operators', async () => {
            const data = '0x123abc123abc';

            const message = hashMessage(arrayify(keccak256(data)));

            const validPreviousOperators = previousOperators.slice(-(OLD_KEY_RETENTION - 1));

            expect(validPreviousOperators.length).to.be.equal(OLD_KEY_RETENTION - 1);

            await Promise.all(
                validPreviousOperators.map(async (operators, index) => {
                    const isCurrentOperators = await newAuth.validateProof(
                        message,
                        getWeightedSignaturesProof(
                            data,
                            operators,
                            operators.map(() => index + 2),
                            threshold,
                            operators.slice(0, threshold),
                        ),
                    );
                    expect(isCurrentOperators).to.be.equal(false);
                }),
            );
        });

        it('reject the proof from the operators older than key retention', async () => {
            const data = '0x123abc123abc';
            const message = hashMessage(arrayify(keccak256(data)));
            const invalidPreviousOperators = previousOperators.slice(0, -(OLD_KEY_RETENTION - 1));

            await Promise.all(
                invalidPreviousOperators.map(async (operators) => {
                    await expectRevert(
                        (gasOptions) =>
                            newAuth.validateProof(
                                message,
                                getWeightedSignaturesProof(
                                    data,
                                    operators,
                                    operators.map(() => 1),
                                    threshold,
                                    operators.slice(0, threshold),
                                ),
                                gasOptions,
                            ),
                        auth,
                        'InvalidOperators',
                    );
                }),
            );
        });
    });

    describe('transferOperatorship', () => {
        it('should allow owner to transfer operatorship', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            await expect(auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 2)))
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(newOperators, [1, 1], 2);
        });

        it('should not allow non-owner to transfer operatorship', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            await expectRevert(
                (gasOptions) =>
                    auth
                        .connect(operators[0])
                        .transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 2, gasOptions)),
                auth,
                'NotOwner',
            );
        });

        it('should revert if new operators length is zero', async () => {
            const newOperators = [];

            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 2, gasOptions)),
                auth,
                'InvalidOperators',
            );
        });

        it('should not allow transferring operatorship to address zero', async () => {
            const newOperators = [ethers.constants.AddressZero, '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 2, gasOptions)),
                auth,
                'InvalidOperators',
            );
        });

        it('should not allow transferring operatorship to duplicated operators', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 2, gasOptions)),
                auth,
                'InvalidOperators',
            );
        });

        it('should not allow transferring operatorship to unsorted operators', async () => {
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            await expectRevert(
                (gasOptions) =>
                    auth.transferOperatorship(
                        defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [newOperators, [1, 1], 2], gasOptions),
                    ),
                auth,
                'InvalidOperators',
            );
        });

        it('should not allow operatorship transfer to the previous operators ', async () => {
            const updatedOperators = getAddresses(operators.slice(0, threshold));

            await expect(
                auth.transferOperatorship(
                    getTransferWeightedOperatorshipCommand(
                        updatedOperators,
                        updatedOperators.map(() => 2),
                        threshold,
                    ),
                ),
            )
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(
                    updatedOperators,
                    updatedOperators.map(() => 2),
                    threshold,
                );

            const oldOperators = getAddresses(operators);

            await expectRevert(
                (gasOptions) =>
                    auth.transferOperatorship(
                        getTransferWeightedOperatorshipCommand(
                            oldOperators,
                            oldOperators.map(() => 1),
                            threshold,
                        ),
                        gasOptions,
                    ),
                auth,
                'DuplicateOperators',
            );
        });

        it('should not allow transferring operatorship with invalid threshold', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 0, gasOptions)),
                auth,
                'InvalidThreshold',
            );
            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1], 3, gasOptions)),
                auth,
                'InvalidThreshold',
            );
        });

        it('should not allow transferring operatorship with invalid number of weights', async () => {
            const newOperators = ['0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1], 0, gasOptions)),
                auth,
                'InvalidWeights',
            );
            await expectRevert(
                (gasOptions) => auth.transferOperatorship(getTransferWeightedOperatorshipCommand(newOperators, [1, 1, 1], 3, gasOptions)),
                auth,
                'InvalidWeights',
            );
        });
    });

    describe('hashForEpoch and epochForHash', () => {
        it('should expose correct hashes and epoch', async () => {
            const operatorsHistory = [...previousOperators, operators];

            await Promise.all(
                operatorsHistory.map(async (operators, i) => {
                    const hash = keccak256(
                        getTransferWeightedOperatorshipCommand(
                            getAddresses(operators),
                            operators.map(() => 1),
                            threshold,
                        ),
                    );
                    expect(await auth.hashForEpoch(i + 1)).to.be.equal(hash);
                    expect(await auth.epochForHash(hash)).to.be.equal(i + 1);
                }),
            );
        });
    });
});
