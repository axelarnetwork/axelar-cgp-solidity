'use strict';

const chai = require('chai');
const { sortBy } = require('lodash');
const { ethers, network } = require('hardhat');
const {
    utils: { Interface, solidityKeccak256, keccak256 },
} = ethers;
const { expect } = chai;
const {
    isHardhat,
    waitFor,
    getAddresses,
    getRandomID,
    getChainId,
    getGasOptions,
    buildCommandBatch,
    getApproveContractCall,
    getWeightedAuthDeployParam,
    getWeightedProxyDeployParams,
    getSignedWeightedExecuteInput,
    getPayloadAndProposalHash,
} = require('./utils');
const { getBytecodeHash } = require('@axelar-network/axelar-contract-deployments');

const getWeights = ({ length }, weight = 1) => Array(length).fill(weight);

describe('AxelarGatewayUpgrade', () => {
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

        interchainGovernanceFactory = await ethers.getContractFactory('InterchainGovernance', ownerWallet);

        gatewayFactory = await ethers.getContractFactory('AxelarGateway', owner);
        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', owner);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', owner);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', owner);
        tokenDeployer = await tokenDeployerFactory.deploy();
        await tokenDeployer.deployTransaction.wait(network.config.confirmations);

        await deployGateway();
    });

    const deployGateway = async () => {
        const buffer = isHardhat ? 10 * 60 * 60 : 10;

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
    };

    it('should deploy gateway with the correct variables', async () => {
        expect(await gateway.governance()).to.eq(interchainGovernance.address);
        expect(await gateway.mintLimiter()).to.eq(mintLimiter.address);
        expect(await gateway.authModule()).to.eq(auth.address);
        expect(await auth.owner()).to.eq(gateway.address);
        expect(await gateway.tokenDeployer()).to.eq(tokenDeployer.address);
    });

    it('should upgrade AxelarGateway through InterchainGovernance proposal', async () => {
        const commandID = 0;
        const target = gateway.address;
        const nativeValue = 0;
        const timeDelay = isHardhat ? 12 * 60 * 60 : 20;

        const targetInterface = new Interface(gateway.interface.fragments);
        const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
        const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);
        const setupParams = '0x';
        const calldata = targetInterface.encodeFunctionData('upgrade', [
            newGatewayImplementation.address,
            newGatewayImplementationCodeHash,
            setupParams,
        ]);

        const [payload, proposalHash, eta] = await getPayloadAndProposalHash(commandID, target, nativeValue, calldata, timeDelay);

        const payloadHash = solidityKeccak256(['bytes'], [payload]);
        const commandIdGateway = getRandomID();
        const sourceTxHash = keccak256('0x123abc123abc');
        const sourceEventIndex = 17;

        const approveData = buildCommandBatch(
            await getChainId(),
            [commandIdGateway],
            ['approveContractCall'],
            [
                getApproveContractCall(
                    governanceChain,
                    governanceAddress,
                    interchainGovernance.address,
                    payloadHash,
                    sourceTxHash,
                    sourceEventIndex,
                ),
            ],
        );

        const approveInput = await getSignedWeightedExecuteInput(
            approveData,
            operators,
            getWeights(operators),
            threshold,
            operators.slice(0, threshold),
        );

        await expect(gateway.execute(approveInput, getGasOptions()))
            .to.emit(gateway, 'ContractCallApproved')
            .withArgs(
                commandIdGateway,
                governanceChain,
                governanceAddress,
                interchainGovernance.address,
                payloadHash,
                sourceTxHash,
                sourceEventIndex,
            );

        await expect(interchainGovernance.execute(commandIdGateway, governanceChain, governanceAddress, payload, getGasOptions()))
            .to.emit(interchainGovernance, 'ProposalScheduled')
            .withArgs(proposalHash, target, calldata, nativeValue, eta);

        await waitFor(timeDelay);

        const tx = await interchainGovernance.executeProposal(target, calldata, nativeValue);
        const executionTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

        await expect(tx)
            .to.emit(interchainGovernance, 'ProposalExecuted')
            .withArgs(proposalHash, target, calldata, nativeValue, executionTimestamp)
            .and.to.emit(gateway, 'Upgraded')
            .withArgs(newGatewayImplementation.address);
    });
});
