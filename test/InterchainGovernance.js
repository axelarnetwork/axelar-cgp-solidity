'use strict';

const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { defaultAbiCoder, Interface, solidityKeccak256 },
    constants: { AddressZero },
} = ethers;
const { expect } = chai;

describe('InterchainGovernance', () => {
    let ownerWallet;
    let governanceAddress;
    let gatewayAddress;

    let interchainGovernanceFactory;
    let interchainGovernance;

    let targetFactory;
    let targetContract;

    const governanceChain = 'Governance Chain';

    before(async () => {
        [ownerWallet, governanceAddress, gatewayAddress] = await ethers.getSigners();

        interchainGovernanceFactory = await ethers.getContractFactory('TestInterchainGovernance', ownerWallet);
        targetFactory = await ethers.getContractFactory('Target', ownerWallet);
    });

    beforeEach(async () => {
        const buffer = 10 * 60 * 60;

        interchainGovernance = await interchainGovernanceFactory
            .deploy(gatewayAddress.address, governanceChain, governanceAddress.address, buffer)
            .then((d) => d.deployed());

        targetContract = await targetFactory.deploy().then((d) => d.deployed());
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

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);
    });

    it('should revert on scheduling a proposal if source chain is not the governance chain', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;
        const sourceChain = 'Source Chain';

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(
            interchainGovernance.executeProposalAction(sourceChain, governanceAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'NotGovernance');
    });

    it('should revert on scheduling a proposal if source address is not the governance address', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(
            interchainGovernance.executeProposalAction(governanceChain, gatewayAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'NotGovernance');
    });

    it('should revert on scheduling a proposal if the target address is invalid', async () => {
        const commandID = 0;
        const target = AddressZero;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;

        const targetInterface = new Interface(['function callTarget() external']);
        const calldata = targetInterface.encodeFunctionData('callTarget');

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(
            interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload),
        ).to.be.revertedWithCustomError(interchainGovernance, 'InvalidTarget');
    });

    it('should withdraw native ether from governance', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;
        const calldata = '0x';

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await ownerWallet
            .sendTransaction({
                to: interchainGovernance.address,
                value: nativeValue,
            })
            .then((tx) => tx.wait());

        await interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload);

        await network.provider.send('evm_increaseTime', [timeDelay]);
        await network.provider.send('evm_mine');

        const tx = await interchainGovernance.executeProposal(target, calldata, nativeValue);

        await expect(tx).to.emit(interchainGovernance, 'ProposalExecuted').to.changeEtherBalance(target, nativeValue);
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

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

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

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

        await network.provider.send('evm_increaseTime', [timeDelay]);
        await network.provider.send('evm_mine');

        const tx = await interchainGovernance.executeProposal(target, calldata, nativeValue, { value: nativeValue });
        const executionTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        await expect(tx)
            .to.emit(interchainGovernance, 'ProposalExecuted')
            .withArgs(proposalHash, target, calldata, nativeValue, executionTimestamp)
            .and.to.emit(targetContract, 'TargetCalled');
    });

    it('should revert on executing a proposal if call to target fails', async () => {
        const commandID = 0;
        const target = targetContract.address;
        const nativeValue = 100;
        const timeDelay = 12 * 60 * 60;

        // Encode function that does not exist on target
        const targetInterface = new Interface(['function set() external']);
        const calldata = targetInterface.encodeFunctionData('set');

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress.address, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

        await network.provider.send('evm_increaseTime', [timeDelay]);
        await network.provider.send('evm_mine');

        await expect(
            interchainGovernance.executeProposal(target, calldata, nativeValue, { value: nativeValue }),
        ).to.be.revertedWithCustomError(interchainGovernance, 'ExecutionFailed');
    });
});
