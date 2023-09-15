'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { toUtf8Bytes, keccak256, arrayify, splitSignature, recoverAddress },
} = ethers;
const { expect } = chai;
const { toEthSignedMessageHash, expectRevert } = require('./utils');

const TEST_MESSAGE = keccak256(toUtf8Bytes('OpenZeppelin'));
const WRONG_MESSAGE = keccak256(toUtf8Bytes('Nope'));
const NON_HASH_MESSAGE = '0x' + Buffer.from('abcd').toString('hex');

describe('ECDSA', () => {
    let accounts;
    let ecdsa;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const ECDSA = await ethers.getContractFactory('TestECDSA');
        ecdsa = await ECDSA.deploy();
        await ecdsa.deployed();
    });

    describe('recover with invalid signature', () => {
        it('with short signature', async () => {
            await expectRevert((gasOptions) => ecdsa.recover(TEST_MESSAGE, '0x1234', gasOptions), ecdsa, 'InvalidSignatureLength');
        });

        it('with long signature', async () => {
            await expectRevert(
                (gasOptions) =>
                    ecdsa.recover(
                        TEST_MESSAGE,
                        '0x01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789',
                        gasOptions,
                    ),
                ecdsa,
                'InvalidSignatureLength',
            );
        });
    });

    describe('recover with valid signature', () => {
        it('returns signer address with correct signature', async () => {
            const signer = accounts[0];
            const signature = await signer.signMessage(arrayify(TEST_MESSAGE));
            expect(await ecdsa.recover(toEthSignedMessageHash(TEST_MESSAGE), signature)).to.equal(signer.address);
        });

        it('returns signer address with correct signature for arbitrary length message', async () => {
            const signer = accounts[0];
            const signature = await signer.signMessage(arrayify(NON_HASH_MESSAGE));
            expect(await ecdsa.recover(toEthSignedMessageHash(NON_HASH_MESSAGE), signature)).to.equal(signer.address);
        });

        it('returns a different address', async () => {
            const signer = accounts[0];
            const signature = await signer.signMessage(arrayify(TEST_MESSAGE));
            expect(await ecdsa.recover(WRONG_MESSAGE, signature)).to.not.equal(signer.address);
        });

        it('reverts with invalid signature', async () => {
            const signature =
                '0x332ce75a821c982f9127538858900d87d3ec1f9f737338ad67cad133fa48feff48e6fa0c18abc62e42820f05943e47af3e9fbe306ce74d64094bdf1691ee53e01c';

            await expectRevert((gasOptions) => ecdsa.recover(TEST_MESSAGE, signature, gasOptions), ecdsa, 'InvalidSignature');
        });
    });

    describe('with v=27 signature', () => {
        const signer = '0x2cc1166f6212628A0deEf2B33BEFB2187D35b86c';
        const signatureWithoutV =
            '0x5d99b6f7f6d1f73d1a26497f2b1c89b24c0993913f86e9a2d02cd69887d9c94f3c880358579d811b21dd1b7fd9bb01c1d81d10e69f0384e675c32b39643be892';

        it('works with correct v value', async () => {
            const v = '1b'; // 27 = 1b.
            const signature = signatureWithoutV + v;

            const splitSig = splitSignature(signature);
            const recoveredAddress = recoverAddress(TEST_MESSAGE, splitSig);
            expect(recoveredAddress).to.equal(signer);

            expect(await ecdsa.recover(TEST_MESSAGE, signature)).to.equal(signer);
        });

        it('rejects incorrect v value', async () => {
            const v = '1c'; // 28 = 1c.
            const signature = signatureWithoutV + v;

            const splitSig = splitSignature(signature);
            const recoveredAddress = recoverAddress(TEST_MESSAGE, splitSig);
            expect(recoveredAddress).to.not.equal(signer);

            expect(await ecdsa.recover(TEST_MESSAGE, signature)).to.not.equal(signer);
        });

        it('reverts wrong v values', async () => {
            for (const v of ['00', '01']) {
                const signature = signatureWithoutV + v;

                await expectRevert((gasOptions) => ecdsa.recover(TEST_MESSAGE, signature, gasOptions), ecdsa, 'InvalidV');

                await expectRevert((gasOptions) => ecdsa.recover(TEST_MESSAGE, signature, gasOptions), ecdsa, 'InvalidV');
            }
        });
    });

    describe('with v=28 signature', () => {
        const signer = '0x1E318623aB09Fe6de3C9b8672098464Aeda9100E';
        const signatureWithoutV =
            '0x331fe75a821c982f9127538858900d87d3ec1f9f737338ad67cad133fa48feff48e6fa0c18abc62e42820f05943e47af3e9fbe306ce74d64094bdf1691ee53e0';

        it('works with correct v value', async () => {
            const v = '1c'; // 28 = 1c.
            const signature = signatureWithoutV + v;

            const splitSig = splitSignature(signature);
            const recoveredAddress = recoverAddress(TEST_MESSAGE, splitSig);
            expect(recoveredAddress).to.equal(signer);

            expect(await ecdsa.recover(TEST_MESSAGE, signature)).to.equal(signer);
        });

        it('rejects incorrect v value', async () => {
            const v = '1b'; // 27 = 1b.
            const signature = signatureWithoutV + v;

            const splitSig = splitSignature(signature);
            const recoveredAddress = recoverAddress(TEST_MESSAGE, splitSig);
            expect(recoveredAddress).to.not.equal(signer);

            expect(await ecdsa.recover(TEST_MESSAGE, signature)).to.not.equal(signer);
        });

        it('reverts invalid v values', async () => {
            for (const v of ['00', '01']) {
                const signature = signatureWithoutV + v;

                await expectRevert((gasOptions) => ecdsa.recover(TEST_MESSAGE, signature, gasOptions), ecdsa, 'InvalidV');
            }
        });

        it('reverts with high-s value signature', async () => {
            const message = '0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
            const highSSignature =
                '0xe742ff452d41413616a5bf43fe15dd88294e983d3d36206c2712f39083d638bde0a0fc89be718fbc1033e1d30d78be1c68081562ed2e97af876f286f3453231d1b';

            await expectRevert((gasOptions) => ecdsa.recover(message, highSSignature, gasOptions), ecdsa, 'InvalidS');
        });
    });

    describe('compute Ethereum Signed Message Hash', () => {
        it('should correctly compute the Ethereum Signed Message Hash', async () => {
            const originalHash = keccak256(toUtf8Bytes('Hello, world!'));

            const expectedEthSignedMessageHash = toEthSignedMessageHash(originalHash);

            const result = await ecdsa.toEthSignedMessageHashPublic(originalHash);

            expect(result).to.equal(expectedEthSignedMessageHash);
        });
    });
});
