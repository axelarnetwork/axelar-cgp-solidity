'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { defaultAbiCoder, Interface, solidityKeccak256 },
} = ethers;
const { expect } = chai;

describe('AxelarServiceGovernance', () => {
    let ownerWallet;
    let governanceAddress;
    let gateway;
    let signer1, signer2, signer3;
    let signers;

    let serviceGovernanceFactory;
    let serviceGovernance;

    let targetFactory;
    let targetContract;

    const governanceChain = 'Governance Chain';

    before(async () => {
        [ownerWallet, governanceAddress, gateway, signer1, signer2, signer3] = await ethers.getSigners();
        signers = [signer1, signer2, signer3].map((signer) => signer.address);

        serviceGovernanceFactory = await ethers.getContractFactory('TestServiceGovernance', ownerWallet);
        targetFactory = await ethers.getContractFactory('Target', ownerWallet);
    });

    beforeEach(async () => {
        const minimumTimeDelay = 10 * 60 * 60;
        const threshold = 2;

        serviceGovernance = await serviceGovernanceFactory
            .deploy(gateway.address, governanceChain, governanceAddress.address, minimumTimeDelay, signers, threshold)
            .then((d) => d.deployed());

        targetContract = await targetFactory.deploy().then((d) => d.deployed());
    });

    it('should initialize the service governance with correct parameters', async () => {
        // will need to remove epoch param when merged with updated multisig
        const currentThreshold = 2;

        expect(await serviceGovernance.gateway()).to.equal(gateway.address);
        expect(await serviceGovernance.governanceChain()).to.equal(governanceChain);
        expect(await serviceGovernance.governanceAddress()).to.equal(governanceAddress.address);
        expect(await serviceGovernance.signerThreshold()).to.equal(currentThreshold);
        expect(await serviceGovernance.signerAccounts()).to.deep.equal(signers);
    });

    it('should schedule a proposal', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);
    });

    it('should cancel an existing proposal', async () => {
        const commandID = 0;
        const commandIDCancel = 1;
        const target = targetContract.address;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

        const cancelPayload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandIDCancel, target, calldata, nativeValue, eta],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, cancelPayload))
            .to.emit(serviceGovernance, 'ProposalCancelled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);
    });

    it('should approve a multisig proposal', async () => {
        const commandID = 2;
        const target = targetContract.address;
        const nativeValue = 100;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);
    });

    it('should cancel an approved multisig proposal', async () => {
        const commandID = 3;
        const target = targetContract.address;
        const nativeValue = 100;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigCancelled')
            .withArgs(proposalHash, target, calldata, nativeValue);
    });

    it('should re-approve a multisig proposal after cancelling it', async () => {
        const commandID = 2;
        const commandIDCancel = 3;
        const target = targetContract.address;
        const nativeValue = 100;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        const payloadCancel = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandIDCancel, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payloadCancel))
            .to.emit(serviceGovernance, 'MultisigCancelled')
            .withArgs(proposalHash, target, calldata, nativeValue);

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);
    });

    it('should revert on executing a multisig proposal if called by non-signer', async () => {
        const target = targetContract.address;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        await expect(serviceGovernance.connect(ownerWallet).executeMultisigProposal(target, calldata, 0)).to.be.revertedWithCustomError(
            serviceGovernance,
            'NotSigner',
        );
    });

    it('should revert on executing a multisig proposal if proposal is not approved', async () => {
        const target = targetContract.address;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        await serviceGovernance
            .connect(signer1)
            .executeMultisigProposal(target, calldata, 0)
            .then((tx) => tx.wait());

        await expect(serviceGovernance.connect(signer2).executeMultisigProposal(target, calldata, 0)).to.be.revertedWithCustomError(
            serviceGovernance,
            'NotApproved',
        );
    });

    it('should revert on executing a multisig proposal if call to target fails', async () => {
        const commandID = 2;
        const target = targetContract.address;
        const nativeValue = 0;

        // Encode function that does not exist on target
        const targetInterface = new Interface(['function set() external']);
        const calldata = targetInterface.encodeFunctionData('set');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);

        await serviceGovernance
            .connect(signer1)
            .executeMultisigProposal(target, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(
            serviceGovernance.connect(signer2).executeMultisigProposal(target, calldata, nativeValue),
        ).to.be.revertedWithCustomError(serviceGovernance, 'ExecutionFailed');
    });

    it('should not execute a multisig proposal if only one signer votes', async () => {
        const commandID = 2;
        const target = targetContract.address;
        const nativeValue = 0;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);

        await expect(serviceGovernance.connect(signer1).executeMultisigProposal(target, calldata, 0)).to.not.emit(
            serviceGovernance,
            'MultisigExecuted',
        );
    });

    it('should execute a multisig proposal', async () => {
        const commandID = 2;
        const target = targetContract.address;
        const nativeValue = 0;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);

        await serviceGovernance
            .connect(signer1)
            .executeMultisigProposal(target, calldata, nativeValue)
            .then((tx) => tx.wait());

        await expect(serviceGovernance.connect(signer2).executeMultisigProposal(target, calldata, nativeValue))
            .to.emit(serviceGovernance, 'MultisigExecuted')
            .withArgs(proposalHash, target, calldata, nativeValue)
            .and.to.emit(targetContract, 'TargetCalled');
    });

    it('should execute a multisig proposal and increase balance of target', async () => {
        const commandID = 2;
        const target = targetContract.address;
        const nativeValue = 1000;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, 0],
        );

        await expect(serviceGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(serviceGovernance, 'MultisigApproved')
            .withArgs(proposalHash, target, calldata, nativeValue);

        await serviceGovernance
            .connect(signer1)
            .executeMultisigProposal(target, calldata, nativeValue)
            .then((tx) => tx.wait());

        const tx = await serviceGovernance.connect(signer2).executeMultisigProposal(target, calldata, nativeValue, { value: nativeValue });

        await expect(tx)
            .to.emit(serviceGovernance, 'MultisigExecuted')
            .withArgs(proposalHash, target, calldata, nativeValue)
            .and.to.emit(targetContract, 'TargetCalled');
        await expect(tx).to.changeEtherBalance(target, nativeValue);
    });
});
