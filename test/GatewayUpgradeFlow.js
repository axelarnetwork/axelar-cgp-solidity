'use strict';

const chai = require('chai');
const { sortBy } = require('lodash');
const { ethers, network } = require('hardhat');
const {
    utils: { defaultAbiCoder, Interface, solidityKeccak256 },
} = ethers;
const { expect } = chai;
const { isHardhat, getAddresses, getWeightedAuthDeployParam, getWeightedProxyDeployParams } = require('./utils');
const { getBytecodeHash } = require('@axelar-network/axelar-contract-deployments');

const getWeights = ({ length }, weight = 1) => Array(length).fill(weight);

describe('InterchainGovernance', () => {
    const threshold = isHardhat ? 4 : 2;

    let ownerWallet;
    let governanceAddress;

    let interchainGovernanceFactory;
    let interchainGovernance;
    let gatewayFactory;
    let authFactory;
    let gatewayProxyFactory;
    let tokenDeployerFactory;

    let auth;
    let tokenDeployer;
    let gateway;

    let wallets;
    let owner;
    let operators;
    let mintLimiter;

    const governanceChain = 'Governance Chain';

    before(async () => {
        wallets = await ethers.getSigners();
        ownerWallet = wallets[0];
        mintLimiter = ownerWallet;
        governanceAddress = wallets[1].address;
        operators = sortBy(wallets.slice(0, threshold), (wallet) => wallet.address.toLowerCase());

        interchainGovernanceFactory = await ethers.getContractFactory('TestInterchainGovernance', ownerWallet);

        gatewayFactory = await ethers.getContractFactory('AxelarGateway', owner);
        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', owner);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', owner);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', owner);
        tokenDeployer = await tokenDeployerFactory.deploy();
        await tokenDeployer.deployTransaction.wait(network.config.confirmations);
    });

    beforeEach(async () => {
        const buffer = 10 * 60 * 60;

        const operatorAddresses = getAddresses(operators);

        auth = await authFactory.deploy(getWeightedAuthDeployParam([operatorAddresses], [getWeights(operatorAddresses)], [threshold]));
        await auth.deployTransaction.wait(network.config.confirmations);

        const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address);
        await gatewayImplementation.deployTransaction.wait(network.config.confirmations);

        const params = getWeightedProxyDeployParams(ownerWallet.address, mintLimiter.address, [], [], threshold);

        const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params);
        await proxy.deployTransaction.wait(network.config.confirmations);

        await auth.transferOwnership(proxy.address).then((tx) => tx.wait(network.config.confirmations));

        gateway = gatewayFactory.attach(proxy.address);

        interchainGovernance = await interchainGovernanceFactory
            .deploy(gateway.address, governanceChain, governanceAddress, buffer)
            .then((d) => d.deployed());

        await gateway.transferGovernance(interchainGovernance.address).then((tx) => tx.wait(network.config.confirmations));
    });

    it('should get the correct governance address', async () => {
        expect(await gateway.governance()).to.eq(interchainGovernance.address);
    });

    it('should get the correct mint limiter address', async () => {
        expect(await gateway.mintLimiter()).to.eq(mintLimiter.address);
    });

    it('should get the correct auth module', async () => {
        expect(await gateway.authModule()).to.eq(auth.address);
    });

    it('auth module should have the correct owner', async () => {
        expect(await auth.owner()).to.eq(gateway.address);
    });

    it('should get the correct token deployer', async () => {
        expect(await gateway.tokenDeployer()).to.eq(tokenDeployer.address);
    });

    it('should schedule a proposal to upgrade AxelarGateway', async () => {
        const commandID = 0;
        const target = gateway.address;
        const nativeValue = 0;
        const timeDelay = 12 * 60 * 60;

        const targetInterface = new Interface([
            'function upgrade(address newImplementation, bytes32 newImplementationCodeHash, bytes calldata setupParams) external',
        ]);
        const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
        const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);
        const setupParams = '0x';
        const calldata = targetInterface.encodeFunctionData('upgrade', [
            newGatewayImplementation.address,
            newGatewayImplementationCodeHash,
            setupParams,
        ]);

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);
    });

    it('should execute an upgrade proposal on AxelarGateway', async () => {
        const commandID = 0;
        const target = gateway.address;
        const nativeValue = 0;
        const timeDelay = 12 * 60 * 60;

        const targetInterface = new Interface([
            'function upgrade(address newImplementation, bytes32 newImplementationCodeHash, bytes calldata setupParams) external',
        ]);
        const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
        const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);
        const setupParams = '0x';
        const calldata = targetInterface.encodeFunctionData('upgrade', [
            newGatewayImplementation.address,
            newGatewayImplementationCodeHash,
            setupParams,
        ]);

        const block = await ethers.provider.getBlock('latest');
        const eta = block.timestamp + timeDelay;

        const proposalHash = solidityKeccak256(['address', 'bytes', 'uint256'], [target, calldata, nativeValue]);

        const payload = defaultAbiCoder.encode(
            ['uint256', 'address', 'bytes', 'uint256', 'uint256'],
            [commandID, target, calldata, nativeValue, eta],
        );

        await expect(interchainGovernance.executeProposalAction(governanceChain, governanceAddress, payload))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

        await network.provider.send('evm_increaseTime', [timeDelay]);
        await network.provider.send('evm_mine');

        const tx = await interchainGovernance.executeProposal(target, calldata, nativeValue, { value: nativeValue });
        const executionTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        await expect(tx)
            .to.emit(interchainGovernance, 'ProposalExecuted')
            .withArgs(proposalHash, target, calldata, nativeValue, executionTimestamp)
            .and.to.emit(gateway, 'Upgraded')
            .withArgs(newGatewayImplementation.address);
    });
});
