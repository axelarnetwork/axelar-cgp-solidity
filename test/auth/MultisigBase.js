const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { keccak256, Interface },
    constants: { AddressZero },
} = ethers;
const { expect } = chai;

describe('MultisigBase', () => {
    let signer1, signer2, signer3, signer4, signer5, signer6, nonSigner;
    let initAccounts;
    let rotatedAccounts;

    let multiSigFactory;
    let multiSig;

    before(async () => {
        [signer1, signer2, signer3, signer4, signer5, signer6, nonSigner] = await ethers.getSigners();
        initAccounts = [signer1, signer2, signer3].map((signer) => signer.address);
        rotatedAccounts = [signer4, signer5, signer6].map((signer) => signer.address);

        multiSigFactory = await ethers.getContractFactory('TestMultiSigBase', signer1);
    });

    beforeEach(async () => {
        multiSig = await multiSigFactory.deploy(initAccounts, 2).then((d) => d.deployed());
    });

    it('should return the current epoch', async () => {
        const currentEpoch = 1;
        const returnedEpoch = await multiSig.signerEpoch();

        expect(currentEpoch).to.equal(returnedEpoch);
    });

    it('should return the signer threshold for a given epoch', async () => {
        const currentThreshold = 2;

        expect(await multiSig.signerThreshold()).to.equal(currentThreshold);
    });

    it('should return true if an account is a signer', async () => {
        expect(await multiSig.isSigner(signer1.address)).to.equal(true);
        expect(await multiSig.isSigner(signer2.address)).to.equal(true);
        expect(await multiSig.isSigner(signer3.address)).to.equal(true);
    });

    it('should return false if an account is not a signer', async () => {
        expect(await multiSig.isSigner(nonSigner.address)).to.equal(false);
    });

    it('should return the array of signers for a given epoch', async () => {
        expect(await multiSig.signerAccounts()).to.deep.equal(initAccounts);
    });

    it('should revert if non-signer calls only signers function', async () => {
        const newThreshold = 2;

        await expect(multiSig.connect(nonSigner).rotateSigners(rotatedAccounts, newThreshold)).to.be.revertedWithCustomError(
            multiSig,
            'NotSigner',
        );
    });

    it('should not proceed with operation execution with insufficient votes', async () => {
        const newThreshold = 2;

        const tx = await multiSig.connect(signer1).rotateSigners(rotatedAccounts, newThreshold);

        await expect(tx).to.not.emit(multiSig, 'MultisigOperationExecuted');
    });

    it('should revert if signer tries to vote twice', async () => {
        const newThreshold = 2;

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccounts, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer1).rotateSigners(rotatedAccounts, newThreshold)).to.be.revertedWithCustomError(
            multiSig,
            'AlreadyVoted',
        );
    });

    it('should proceed with operation execution with sufficient votes', async () => {
        const newThreshold = 2;

        const rotateInterface = new Interface([
            'function rotateSigners(address[] memory newAccounts, uint256 newThreshold) external payable',
        ]);
        const msgData = rotateInterface.encodeFunctionData('rotateSigners', [rotatedAccounts, newThreshold]);
        const msgDataHash = keccak256(msgData);

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccounts, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer2).rotateSigners(rotatedAccounts, newThreshold))
            .to.emit(multiSig, 'MultisigOperationExecuted')
            .withArgs(msgDataHash);
    });

    it('should revert on rotate signers if new threshold is too large', async () => {
        const newThreshold = 4;

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccounts, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer2).rotateSigners(rotatedAccounts, newThreshold)).to.be.revertedWithCustomError(
            multiSig,
            'InvalidSigners',
        );
    });

    it('should revert on rotate signers if new threshold is zero', async () => {
        const newThreshold = 0;

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccounts, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer2).rotateSigners(rotatedAccounts, newThreshold)).to.be.revertedWithCustomError(
            multiSig,
            'InvalidSignerThreshold',
        );
    });

    it('should revert on rotate signers with any duplicate signers', async () => {
        const newThreshold = 2;

        const rotatedAccountsWithDuplicate = rotatedAccounts.concat(signer4.address);

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccountsWithDuplicate, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer2).rotateSigners(rotatedAccountsWithDuplicate, newThreshold)).to.be.revertedWithCustomError(
            multiSig,
            'DuplicateSigner',
        );
    });

    it('should revert on rotate signers with any invalid signer addresses', async () => {
        const newThreshold = 2;

        const rotatedAccountsInvalid = rotatedAccounts.concat(AddressZero);

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccountsInvalid, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer2).rotateSigners(rotatedAccountsInvalid, newThreshold)).to.be.revertedWithCustomError(
            multiSig,
            'InvalidSigners',
        );
    });

    it('should proceed with signer rotation with sufficient votes and valid arguments', async () => {
        const newThreshold = 2;

        const rotateInterface = new Interface([
            'function rotateSigners(address[] memory newAccounts, uint256 newThreshold) external payable',
        ]);
        const msgData = rotateInterface.encodeFunctionData('rotateSigners', [rotatedAccounts, newThreshold]);
        const msgDataHash = keccak256(msgData);

        await multiSig
            .connect(signer1)
            .rotateSigners(rotatedAccounts, newThreshold)
            .then((tx) => tx.wait());

        await expect(multiSig.connect(signer2).rotateSigners(rotatedAccounts, newThreshold))
            .to.emit(multiSig, 'MultisigOperationExecuted')
            .withArgs(msgDataHash)
            .and.to.emit(multiSig, 'SignersRotated')
            .withArgs(rotatedAccounts, newThreshold);
    });
});
