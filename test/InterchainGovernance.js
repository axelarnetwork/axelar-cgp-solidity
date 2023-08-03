'use strict';

const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { defaultAbiCoder, Interface },
    constants: { AddressZero },
} = ethers;
const { expect } = chai;
const { isHardhat, getPayloadAndProposalHash } = require('./utils');

describe('InterchainGovernance', () => {
    let ownerWallet;
    let governanceAddress;
    let gatewayAddress;

    let interchainGovernanceFactory;
    let interchainGovernance;

    let targetFactory;
    let targetContract;

    const governanceChain = 'Governance Chain';
    const timeDelay = isHardhat ? 12 * 60 * 60 : 30;

    const targetInterface = new Interface(['function callTarget() external']);
    const calldata = targetInterface.encodeFunctionData('callTarget');

    before(async () => {
        [ownerWallet, governanceAddress, gatewayAddress] = await ethers.getSigners();

        interchainGovernanceFactory = await ethers.getContractFactory('TestInterchainGovernance', ownerWallet);
        targetFactory = await ethers.getContractFactory('Target', ownerWallet);
    });

    beforeEach(async () => {
        const minimumTimeDelay = isHardhat ? 10 * 60 * 60 : 20;

        interchainGovernance = await interchainGovernanceFactory
            .deploy(gatewayAddress.address, governanceChain, governanceAddress.address, minimumTimeDelay)
            .then((d) => d.deployed());

        targetContract = await targetFactory.deploy().then((d) => d.deployed());
    });

    it('should revert on invalid command', async () => {
        const commandID = 2;
        const target = targetContract.address;
        const nativeValue = 100;

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await expect(
            interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'InvalidCommand');
    });

    it('should schedule a proposal and get the correct eta', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const [payload, proposalHash, eta] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

        const proposalEta = await interchainGovernance.getProposalEta(target, calldata, nativeValue);
        expect(proposalEta).to.eq(eta);
    });

    it('should revert on scheduling a proposal if source chain is not the governance chain', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const sourceChain = 'Source Chain';

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await expect(
            interchainGovernance.executeProposalAction(sourceChain, governanceAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'NotGovernance');
    });

    it('should revert on scheduling a proposal if source address is not the governance address', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await expect(
            interchainGovernance.executeProposalAction(governanceChain, gatewayAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'NotGovernance');
    });

    it('should revert on scheduling a proposal if the target address is invalid', async () => {
        const commandID = 0;
        const target = AddressZero;
        const nativeValue = 100;

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await expect(
            interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'InvalidTarget');
    });

    it('should withdraw native ether from governance', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const calldata = '0x';

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await ownerWallet
            .sendTransaction({
                to: interchainGovernance.address,
                value: nativeValue,
            })
            .then((tx) => tx.wait());

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        if (isHardhat) {
            await network.provider.send('evm_increaseTime', [timeDelay]);
            await network.provider.send('evm_mine');
        } else {
            await new Promise((resolve) => setTimeout(resolve, timeDelay * 1000));
        }

        const tx = await interchainGovernance.executeProposal(target, calldata, nativeValue);

        await expect(tx).to.emit(interchainGovernance, 'ProposalExecuted').to.changeEtherBalance(target, nativeValue);
    });

    it('should revert on calling withdraw directly', async () => {
        const recipient = ownerWallet.address;
        const nativeValue = 100;
        await expect(interchainGovernance.withdraw(recipient, nativeValue)).to.be.revertedWithCustomError(interchainGovernance, 'NotSelf');
    });

    it('should withdraw native ether from governance to recipient', async () => {
        const commandID = 0;
        const target = interchainGovernance.address;
        const nativeValue = 100;
        const recipient = ownerWallet.address;

        const withdrawInterface = new Interface(['function withdraw(address recipient, uint256 amount) external']);
        const withdrawCalldata = withdrawInterface.encodeFunctionData('withdraw', [recipient, nativeValue]);

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, withdrawCalldata, timeDelay);

        await ownerWallet
            .sendTransaction({
                to: interchainGovernance.address,
                value: nativeValue,
            })
            .then((tx) => tx.wait());

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        if (isHardhat) {
            await network.provider.send('evm_increaseTime', [timeDelay]);
            await network.provider.send('evm_mine');
        } else {
            await new Promise((resolve) => setTimeout(resolve, timeDelay * 1000));
        }

        const tx = await interchainGovernance.executeProposal(target, withdrawCalldata, nativeValue);

        await expect(tx).to.emit(interchainGovernance, 'ProposalExecuted').to.changeEtherBalance(recipient, nativeValue);
    });

    it('should cancel an existing proposal', async () => {
        const commandID = 0;
        const commandIDCancel = 1;
        const target = targetContract.address;
        const nativeValue = 100;

        const [payload, proposalHash, eta] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        const cancelPayload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandIDCancel, target, calldata, nativeValue, eta],
        );

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, cancelPayload))
            .to.emit(interchainGovernance, 'ProposalCancelled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);
    });

    it('should execute an existing proposal', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;

        const [payload, proposalHash] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        if (isHardhat) {
            await network.provider.send('evm_increaseTime', [timeDelay]);
            await network.provider.send('evm_mine');
        } else {
            await new Promise((resolve) => setTimeout(resolve, timeDelay * 1000));
        }

        const tx = await interchainGovernance.executeProposal(target, calldata, nativeValue, { value: nativeValue });
        const executionTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        await expect(tx)
            .to.emit(interchainGovernance, 'ProposalExecuted')
            .withArgs(proposalHash, target, calldata, nativeValue, executionTimestamp)
            .and.to.emit(targetContract, 'TargetCalled');
    });

    it('should revert on executing a proposal if target is not a contract', async () => {
        const commandID = 0;
        const target = ownerWallet.address;
        const nativeValue = 100;

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        if (isHardhat) {
            await network.provider.send('evm_increaseTime', [timeDelay]);
            await network.provider.send('evm_mine');
        } else {
            await new Promise((resolve) => setTimeout(resolve, timeDelay * 1000));
        }

        await expect(
            interchainGovernance.executeProposal(target, calldata, nativeValue, { value: nativeValue }),
        ).to.be.revertedWithCustomError(interchainGovernance, 'InvalidContract');
    });

    it('should revert on executing a proposal if governance has insufficient balance', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        if (isHardhat) {
            await network.provider.send('evm_increaseTime', [timeDelay]);
            await network.provider.send('evm_mine');
        } else {
            await new Promise((resolve) => setTimeout(resolve, timeDelay * 1000));
        }

        await expect(interchainGovernance.executeProposal(target, calldata, nativeValue)).to.be.revertedWithCustomError(
            interchainGovernance,
            'InsufficientBalance',
        );
    });

    it('should revert on executing a proposal if call to target fails', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;

        // Encode function that does not exist on target
        const invalidTargetInterface = new Interface(['function set() external']);
        const invalidCalldata = invalidTargetInterface.encodeFunctionData('set');

        const [payload] = await getPayloadAndProposalHash(commandID, target, nativeValue, invalidCalldata, timeDelay);

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload).then((tx) => tx.wait());

        if (isHardhat) {
            await network.provider.send('evm_increaseTime', [timeDelay]);
            await network.provider.send('evm_mine');
        } else {
            await new Promise((resolve) => setTimeout(resolve, timeDelay * 1000));
        }

        await expect(
            interchainGovernance.executeProposal(target, invalidCalldata, nativeValue, { value: nativeValue }),
        ).to.be.revertedWithCustomError(interchainGovernance, 'ExecutionFailed');
    });
});
