const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { Interface },
} = ethers;
const { expect } = chai;

describe('AxelarMultisigMintLimiter', () => {
    let signer1, signer2, signer3;
    let accounts;

    let mintLimiterFactory;
    let mintLimiter;

    let targetFactory;
    let targetContract;

    before(async () => {
        [signer1, signer2, signer3] = await ethers.getSigners();
        accounts = [signer1, signer2, signer3].map((signer) => signer.address);

        mintLimiterFactory = await ethers.getContractFactory('AxelarMultisigMintLimiter', signer1);
        targetFactory = await ethers.getContractFactory('Target', signer1);
    });

    beforeEach(async () => {
        mintLimiter = await mintLimiterFactory.deploy(accounts, 2).then((d) => d.deployed());
        targetContract = await targetFactory.deploy().then((d) => d.deployed());
    });

    it('should initialize the mint limiter with signer accounts and threshold', async () => {
        const currentEpoch = 1;
        const currentThreshold = 2;

        expect(await mintLimiter.signerThreshold(currentEpoch)).to.equal(currentThreshold);
        expect(await mintLimiter.signerAccounts(currentEpoch)).to.deep.equal(accounts);
    });

    it('should revert on execute with insufficient value sent', async () => {
        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');
        const nativeValue = 1000;

        await mintLimiter
            .connect(signer1)
            .execute(targetContract.address, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(mintLimiter.connect(signer2).execute(targetContract.address, calldata, nativeValue)).to.be.revertedWithCustomError(
            mintLimiter,
            'InsufficientValue',
        );
    });

    it('should revert on execute if call to target fails', async () => {
        // Encode function that does not exist on target
        const targetInterface = new Interface(['function set() external']);
        const calldata = targetInterface.encodeFunctionData('set');
        const nativeValue = 1000;

        await mintLimiter
            .connect(signer1)
            .execute(targetContract.address, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(
            mintLimiter.connect(signer2).execute(targetContract.address, calldata, nativeValue, { value: nativeValue }),
        ).to.be.revertedWithCustomError(mintLimiter, 'ExecutionFailed');
    });

    it('should execute function on target contract', async () => {
        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');
        const nativeValue = 1000;

        await mintLimiter
            .connect(signer1)
            .execute(targetContract.address, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(mintLimiter.connect(signer2).execute(targetContract.address, calldata, nativeValue, { value: nativeValue })).to.emit(
            targetContract,
            'TargetCalled',
        );
    });

    it('should execute function on target contract twice within the same epoch without rotating signers', async () => {
        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');
        const nativeValue = 1000;

        await mintLimiter
            .connect(signer1)
            .execute(targetContract.address, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(mintLimiter.connect(signer2).execute(targetContract.address, calldata, nativeValue, { value: nativeValue })).to.emit(
            targetContract,
            'TargetCalled',
        );

        await mintLimiter
            .connect(signer1)
            .execute(targetContract.address, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(mintLimiter.connect(signer2).execute(targetContract.address, calldata, nativeValue, { value: nativeValue })).to.emit(
            targetContract,
            'TargetCalled',
        );
    });

    it('should refund the caller if call value exceeds native value ', async () => {
        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');
        const nativeValue = 1000;
        const callValue = 5000;

        const initialBalance = await ethers.provider.getBalance(signer2.address);

        await mintLimiter
            .connect(signer1)
            .execute(targetContract.address, calldata, nativeValue)
            .then((tx) => tx.wait());

        const tx = await mintLimiter.connect(signer2).execute(targetContract.address, calldata, nativeValue, { value: callValue });
        await expect(tx).to.emit(targetContract, 'TargetCalled');

        const receipt = await tx.wait();
        const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed);

        const finalBalance = await ethers.provider.getBalance(signer2.address);
        const expectedBalance = initialBalance.sub(nativeValue).sub(gasCost);

        expect(finalBalance).to.equal(expectedBalance);
    });
});
