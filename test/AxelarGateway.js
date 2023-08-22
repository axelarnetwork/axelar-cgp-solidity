const { sortBy } = require('lodash');
const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { id, keccak256, getCreate2Address, defaultAbiCoder },
    constants: { AddressZero, HashZero },
} = ethers;
const { expect } = chai;
const { isHardhat, getChainId, getEVMVersion, getGasOptions, getRandomString, expectRevert } = require('./utils');
const { getBytecodeHash } = require('@axelar-network/axelar-contract-deployments');

const {
    bigNumberToNumber,
    getSignedWeightedExecuteInput,
    getRandomInt,
    getRandomID,
    getDeployCommand,
    getMintCommand,
    getBurnCommand,
    buildCommandBatch,
    getAddresses,
    getApproveContractCall,
    getApproveContractCallWithMint,
    tickBlockTime,
    getWeightedAuthDeployParam,
    getTransferWeightedOperatorshipCommand,
    getWeightedProxyDeployParams,
} = require('./utils');

const getWeights = ({ length }, weight = 1) => Array(length).fill(weight);

describe('AxelarGateway', () => {
    const threshold = isHardhat ? 4 : 2;

    let wallets;
    let owner;
    let operators;
    let governance;
    let mintLimiter;
    let notGovernance;

    let gatewayFactory;
    let authFactory;
    let tokenDeployerFactory;
    let gatewayProxyFactory;
    let burnableMintableCappedERC20Factory;
    let depositHandlerFactory;
    let mintableCappedERC20Factory;
    let nonStandardERC20Factory;

    let auth;
    let tokenDeployer;
    let gateway;

    let externalToken;
    let externalTokenName;
    let externalSymbol;
    let externalDecimals;
    let externalCap;

    before(async () => {
        wallets = await ethers.getSigners();
        owner = wallets[0];
        governance = mintLimiter = owner;
        notGovernance = wallets[1];
        operators = sortBy(wallets.slice(0, threshold), (wallet) => wallet.address.toLowerCase());

        gatewayFactory = await ethers.getContractFactory('AxelarGateway', owner);
        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', owner);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', owner);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', owner);
        burnableMintableCappedERC20Factory = await ethers.getContractFactory('BurnableMintableCappedERC20', owner);
        depositHandlerFactory = await ethers.getContractFactory('DepositHandler', owner);
        mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', owner);
        nonStandardERC20Factory = await ethers.getContractFactory('TestNonStandardERC20', owner);

        // reuse token deployer for all tests
        tokenDeployer = await tokenDeployerFactory.deploy();
        await tokenDeployer.deployTransaction.wait(network.config.confirmations);

        // reuse external token for all tests
        externalTokenName = 'An External Token';
        externalSymbol = 'AET';
        externalDecimals = 18;
        externalCap = 0;

        externalToken = await mintableCappedERC20Factory.deploy(externalTokenName, externalSymbol, externalDecimals, externalCap);
        await externalToken.deployTransaction.wait(network.config.confirmations);
    });

    const deployGateway = async (invalidDeployer = false) => {
        const operatorAddresses = getAddresses(operators);

        auth = await authFactory.deploy(getWeightedAuthDeployParam([operatorAddresses], [getWeights(operatorAddresses)], [threshold]));
        await auth.deployTransaction.wait(network.config.confirmations);

        const gatewayImplementation = invalidDeployer
            ? await gatewayFactory.deploy(auth.address, auth.address)
            : await gatewayFactory.deploy(auth.address, tokenDeployer.address);
        await gatewayImplementation.deployTransaction.wait(network.config.confirmations);

        const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, [], [], threshold);

        const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params);
        await proxy.deployTransaction.wait(network.config.confirmations);

        await auth.transferOwnership(proxy.address).then((tx) => tx.wait(network.config.confirmations));

        gateway = gatewayFactory.attach(proxy.address);
    };

    describe('constructor checks', () => {
        it('should revert if auth module is not a contract', async () => {
            await expectRevert(
                (gasOptions) => gatewayFactory.deploy(owner.address, externalToken.address, gasOptions),
                gatewayFactory,
                'InvalidAuthModule',
            );
        });

        it('should revert if token deployer is not a contract', async () => {
            await expectRevert(
                (gasOptions) => gatewayFactory.deploy(externalToken.address, owner.address, gasOptions),
                gatewayFactory,
                'InvalidTokenDeployer',
            );
        });
    });

    describe('deployment params', () => {
        before(async () => {
            await deployGateway();
        });

        it('should get the correct governance address', async () => {
            expect(await gateway.governance()).to.eq(governance.address);
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
    });

    describe('check external methods that should only be called by self', () => {
        const params = '0x';

        before(async () => {
            await deployGateway();
        });

        it('should fail on external call to deployToken', async () => {
            await expectRevert((gasOptions) => gateway.deployToken(params, HashZero, gasOptions), gateway, 'NotSelf');
        });

        it('should fail on external call to mintToken', async () => {
            await expectRevert((gasOptions) => gateway.mintToken(params, HashZero, gasOptions), gateway, 'NotSelf');
        });

        it('should fail on external call to burnToken', async () => {
            await expectRevert((gasOptions) => gateway.burnToken(params, HashZero, gasOptions), gateway, 'NotSelf');
        });

        it('should fail on external call to approveContractCall', async () => {
            await expectRevert((gasOptions) => gateway.approveContractCall(params, HashZero, gasOptions), gateway, 'NotSelf');
        });

        it('should fail on external call to approveContractCallWithMint', async () => {
            await expectRevert((gasOptions) => gateway.approveContractCallWithMint(params, HashZero, gasOptions), gateway, 'NotSelf');
        });

        it('should fail on external call to transferOperatorship', async () => {
            await expectRevert((gasOptions) => gateway.transferOperatorship(params, HashZero, gasOptions), gateway, 'NotSelf');
        });
    });

    describe('should preserve the bytecode [ @skip-on-coverage ]', () => {
        it('should preserve the same proxy bytecode for each EVM', async () => {
            const proxyBytecode = gatewayProxyFactory.bytecode;
            const proxyBytecodeHash = keccak256(proxyBytecode);

            const expected = {
                istanbul: '0x6905e9ed2ee714532275d658b7cc3e3186acc52da48ffd499a2705a1185b8dde',
                berlin: '0x374b511f48e03dfc872c49b1f3234785b50e4db2fb5eb135ef0c3f58b20c8b7a',
                london: '0xcac4f10cb12909b2256570ae01df6fee5830b78afb230097fc401a69efa896cd',
            }[getEVMVersion()];

            expect(proxyBytecodeHash).to.be.equal(expected);
        });

        it('should preserve the implementation bytecode for each EVM', async () => {
            const implementationBytecode = gatewayFactory.bytecode;
            const implementationBytecodeHash = keccak256(implementationBytecode);

            const expected = {
                istanbul: '0x1296146fcd4c65ae95a5f8986ae5c3cddbb2e28e1fbcad944bb7eacc7ae0c61b',
                berlin: '0x12f934aa1ca12c8b1f7fcb78bb5c4e6dbb85c603d46ef95703ab90ee8fddc2f8',
                london: '0x9ab70c5e01ab2effa70192fe37de182a76e3d345cd2a27a9210a5abb05d8a4c2',
            }[getEVMVersion()];

            expect(implementationBytecodeHash).to.be.equal(expected);
        });

        it('should have the same deposit handler bytecode preserved for each EVM', async () => {
            const expected = {
                istanbul: '0x352c0ce048c2b25b0b6a58f4695613b587f3086b63b4c3a24d22c043aed230d2',
                berlin: '0xa26b1094ee475518c006cba8bd976fd4d3cd9a6089bcbe4453b1b4cf7f095609',
                london: '0x9f217a79e864028081339cfcead3c3d1fe92e237fcbe9468d6bb4d1da7aa6352',
            }[getEVMVersion()];

            expect(keccak256(depositHandlerFactory.bytecode)).to.be.equal(expected);
        });

        it('should have the same token bytecode preserved for each EVM', async () => {
            const tokenFactory = await ethers.getContractFactory('BurnableMintableCappedERC20', owner);

            const expectedToken = {
                istanbul: '0xfc2522491a56af4f3519968ed49c9ba82abc79798afe8f763f601e7d5e14bdbf',
                berlin: '0x81f6049561587bf700c0af132c504b22d696a6acfa606eee0257f92fd4ebd865',
                london: '0x37be59a866fd46ec4179e243e5d5e2639ca1e842b152e45a34628dad6494b94b',
            }[getEVMVersion()];

            expect(keccak256(tokenFactory.bytecode)).to.be.equal(expectedToken);

            const expectedDeployer = {
                istanbul: '0xc68014e297eb42dbde383254ef3129d59528159e6c51b4f9a38f995be1dd451f',
                berlin: '0xd3a39792ca8d1ce8e5318135ca29d8a7f0b800837726997b132ebc04f88cf9aa',
                london: '0x0698929742de660596af20d09d04eb91bfe532ef5e2927858e4c4952034967a5',
            }[getEVMVersion()];

            expect(keccak256(tokenDeployerFactory.bytecode)).to.be.equal(expectedDeployer);
        });
    });

    describe('setTokenMintLimits', () => {
        const symbols = ['tokenA', 'tokenB'];
        const decimals = 8;

        before(async () => {
            await deployGateway();
        });

        beforeEach(async () => {
            const data = buildCommandBatch(
                await getChainId(),
                symbols.map(getRandomID),
                symbols.map(() => 'deployToken'),
                symbols.map((symbol) => getDeployCommand(symbol, symbol, decimals, 0, ethers.constants.AddressZero, 0)),
            );

            return getSignedWeightedExecuteInput(data, operators, getWeights(operators), threshold, operators.slice(0, threshold)).then(
                (input) => gateway.execute(input, getGasOptions()).then((tx) => tx.wait()),
            );
        });

        it("should allow governance to set a token's daily limit", async () => {
            const limit = getRandomInt(Number.MAX_SAFE_INTEGER);
            const limits = symbols.map(() => limit);

            await expectRevert(
                (gasOptions) => gateway.connect(notGovernance).setTokenMintLimits(symbols, limits, gasOptions),
                gateway,
                'NotMintLimiter',
            );

            const invalidLimits = [...limits];
            invalidLimits.pop();

            await expectRevert(
                (gasOptions) => gateway.connect(governance).setTokenMintLimits(symbols, invalidLimits, gasOptions),
                gateway,
                'InvalidSetMintLimitsParams',
            );

            const invalidSymbols = ['TokenX', 'TokenY'];

            await expectRevert(
                (gasOptions) => gateway.connect(governance).setTokenMintLimits(invalidSymbols, limits, gasOptions),
                gateway,
                'TokenDoesNotExist',
            );

            await gateway
                .connect(governance)
                .setTokenMintLimits(symbols, limits, getGasOptions())
                .then((tx) =>
                    Promise.all(symbols.map((symbol) => expect(tx).to.emit(gateway, 'TokenMintLimitUpdated').withArgs(symbol, limit))),
                )
                .then(() => Promise.all(symbols.map((symbol) => gateway.tokenMintLimit(symbol))))
                .then((limits) => limits.map((limit) => limit.toNumber()))
                .then((actual) => {
                    expect(actual).to.deep.eq(limits);
                });
        });
    });

    describe('gateway operators', () => {
        beforeEach(async () => {
            await deployGateway();
        });

        it('should allow transferring governance', async () => {
            await expectRevert(
                (gasOptions) => gateway.connect(notGovernance).transferGovernance(governance.address, gasOptions),
                gateway,
                'NotGovernance',
            );

            await expectRevert(
                (gasOptions) => gateway.connect(governance).transferGovernance(AddressZero, gasOptions),
                gateway,
                'InvalidGovernance',
            );

            await expect(await gateway.connect(governance).transferGovernance(notGovernance.address, getGasOptions()))
                .to.emit(gateway, 'GovernanceTransferred')
                .withArgs(governance.address, notGovernance.address);

            await expectRevert(
                (gasOptions) => gateway.connect(governance).transferGovernance(governance.address, gasOptions),
                gateway,
                'NotGovernance',
            );

            expect(await gateway.governance()).to.be.equal(notGovernance.address);
        });

        it('should allow transferring mint limiter', async () => {
            const notMintLimiter = notGovernance;

            await expectRevert(
                (gasOptions) => gateway.connect(notMintLimiter).transferMintLimiter(notMintLimiter.address, gasOptions),
                gateway,
                'NotMintLimiter',
            );

            await expectRevert(
                (gasOptions) => gateway.connect(mintLimiter).transferMintLimiter(AddressZero, gasOptions),
                gateway,
                'InvalidMintLimiter',
            );

            await expect(await gateway.connect(mintLimiter).transferMintLimiter(notMintLimiter.address, getGasOptions()))
                .to.emit(gateway, 'MintLimiterTransferred')
                .withArgs(mintLimiter.address, notMintLimiter.address);

            expect(await gateway.mintLimiter()).to.be.equal(notMintLimiter.address);

            // test that governance can transfer mint limiter too
            await expect(await gateway.connect(governance).transferMintLimiter(mintLimiter.address, getGasOptions()))
                .to.emit(gateway, 'MintLimiterTransferred')
                .withArgs(notMintLimiter.address, mintLimiter.address);
        });
    });

    describe('upgrade', () => {
        beforeEach(async () => {
            await deployGateway();
        });

        it('should allow governance to upgrade to the correct implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);
            const params = '0x';

            await expectRevert(
                (gasOptions) =>
                    gateway
                        .connect(notGovernance)
                        .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, gasOptions),
                gateway,
                'NotGovernance',
            );

            await expect(gateway.connect(governance).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params))
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address)
                .to.not.emit(gateway, 'GovernanceTransferred')
                .to.not.emit(gateway, 'OperatorshipTransferred');
        });

        it('should allow governance to upgrade to the correct implementation with new governance and mint limiter', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);
            let params = '0x';

            await expectRevert(
                (gasOptions) =>
                    gateway
                        .connect(notGovernance)
                        .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, gasOptions),
                gateway,
                'NotGovernance',
            );

            params = getWeightedProxyDeployParams(notGovernance.address, notGovernance.address, []);

            await expect(
                gateway
                    .connect(governance)
                    .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, getGasOptions()),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address)
                .to.emit(gateway, 'GovernanceTransferred')
                .withArgs(governance.address, notGovernance.address)
                .to.emit(gateway, 'MintLimiterTransferred')
                .withArgs(governance.address, notGovernance.address);
        });

        it('should allow governance to upgrade to the correct implementation with new operators', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);

            const newOperatorAddresses = getAddresses(operators.slice(0, threshold - 1));

            const params = getWeightedProxyDeployParams(
                AddressZero,
                AddressZero,
                newOperatorAddresses,
                getWeights(newOperatorAddresses),
                threshold - 1,
            );

            await expect(
                gateway
                    .connect(governance)
                    .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, getGasOptions()),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address)
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(newOperatorAddresses, getWeights(newOperatorAddresses), threshold - 1)
                .to.not.emit(gateway, 'GovernanceTransferred')
                .to.not.emit(gateway, 'MintLimiterTransferred');

            expect(await gateway.governance()).to.be.eq(governance.address);
            expect(await gateway.mintLimiter()).to.be.eq(governance.address);
        });

        it('should allow governance to upgrade to the correct implementation with new governance and operators', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);

            const newOperatorAddresses = getAddresses(operators.slice(0, threshold - 1));

            const params = getWeightedProxyDeployParams(
                notGovernance.address,
                mintLimiter.address,
                newOperatorAddresses,
                getWeights(newOperatorAddresses),
                threshold - 1,
            );

            await expect(
                gateway
                    .connect(governance)
                    .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, getGasOptions()),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address)
                .to.emit(auth, 'OperatorshipTransferred')
                .withArgs(newOperatorAddresses, getWeights(newOperatorAddresses), threshold - 1)
                .to.emit(gateway, 'GovernanceTransferred')
                .withArgs(governance.address, notGovernance.address);

            expect(await gateway.governance()).to.be.eq(notGovernance.address);
        });

        it('should allow governance to upgrade to the same implementation with new governance', async () => {
            const newGatewayImplementation = await gatewayFactory.attach(await gateway.implementation());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);
            const params = getWeightedProxyDeployParams(notGovernance.address, mintLimiter.address, [], [], 1);

            await expect(
                gateway
                    .connect(governance)
                    .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, getGasOptions()),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address)
                .to.emit(gateway, 'GovernanceTransferred')
                .withArgs(governance.address, notGovernance.address)
                .to.not.emit(gateway, 'OperatorshipTransferred');

            expect(await gateway.governance()).to.be.eq(notGovernance.address);
        });

        it('should not allow governance to upgrade to a wrong implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const wrongCodeHash = keccak256(`0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`);
            const depositServiceFactory = await ethers.getContractFactory('AxelarDepositService', owner);
            const wrongImplementation = await depositServiceFactory.deploy(gateway.address, '', owner.address).then((d) => d.deployed());
            const wrongImplementationCodeHash = await getBytecodeHash(wrongImplementation, network.config.id);

            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, newOperatorAddresses, Array(2).fill(1), 2);

            await expectRevert(
                (gasOptions) => gateway.connect(notGovernance).upgrade(newGatewayImplementation.address, wrongCodeHash, params, gasOptions),
                gateway,
                'NotGovernance',
            );

            await expectRevert(
                (gasOptions) => gateway.connect(governance).upgrade(newGatewayImplementation.address, wrongCodeHash, params, gasOptions),
                gateway,
                'InvalidCodeHash',
            );

            await expectRevert(
                (gasOptions) =>
                    gateway.connect(governance).upgrade(wrongImplementation.address, wrongImplementationCodeHash, params, gasOptions),
                gateway,
                'InvalidImplementation',
            );
        });

        it('should not allow calling the setup function directly', async () => {
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, newOperatorAddresses, Array(2).fill(1), 2);

            await expect(gateway.connect(governance).setup(params)).not.to.emit(gateway, 'OperatorshipTransferred');

            const implementation = gatewayFactory.attach(await gateway.implementation());

            await expectRevert((gasOptions) => implementation.connect(governance).setup(params, gasOptions), gateway, 'NotProxy');
        });

        it('should not allow malicious proxy to call setup function directly and transfer governance or mint limiter', async () => {
            const params = getWeightedProxyDeployParams(notGovernance.address, notGovernance.address, []);

            const implementation = await gateway.implementation();

            const maliciousProxy = await gatewayProxyFactory.deploy(implementation, params);
            await maliciousProxy.deployTransaction.wait(network.config.confirmations);

            expect(await gateway.governance()).to.eq(governance.address);
            expect(await gateway.mintLimiter()).to.eq(governance.address);
        });

        it('should not allow calling the upgrade on the implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);

            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, newOperatorAddresses, Array(2).fill(1), 2);

            const implementation = gatewayFactory.attach(await gateway.implementation());

            await expectRevert(
                (gasOptions) =>
                    implementation
                        .connect(notGovernance)
                        .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, gasOptions),
                gateway,
                'NotGovernance',
            );
        });

        it('should revert on upgrade if setup fails for any reason', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation, network.config.id);

            // invalid setup params
            const params = '0x1234';

            await expectRevert(
                (gasOptions) =>
                    gateway
                        .connect(governance)
                        .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, gasOptions),
                gateway,
                'SetupFailed',
            );
        });
    });

    describe('chain id', () => {
        before(async () => {
            await deployGateway();
        });

        it('should fail if chain id mismatches', async () => {
            const data = buildCommandBatch(
                (await getChainId()) + 1,
                [getRandomID()],
                ['transferOperatorship'],
                [
                    getTransferWeightedOperatorshipCommand(
                        ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'],
                        [1, 1],
                        2,
                    ),
                ],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expectRevert((gasOptions) => gateway.execute(input, gasOptions), gateway, 'InvalidChainId');
        });
    });

    describe('command deployToken', () => {
        const name = 'An Awesome Token';
        const decimals = 18;
        const cap = 10000;
        const limit = 1000;

        let symbol;

        before(async () => {
            await deployGateway();
        });

        it('should allow operators to deploy a new token', async () => {
            const commandID = getRandomID();
            symbol = `AAT${getRandomInt(1e10)}`;

            const data = buildCommandBatch(
                await getChainId(),
                [commandID],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, limit)],
            );

            const { data: tokenInitCode } = burnableMintableCappedERC20Factory.getDeployTransaction(name, symbol, decimals, cap);
            const expectedTokenAddress = getCreate2Address(gateway.address, id(symbol), keccak256(tokenInitCode));

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const tx = await gateway.execute(input, getGasOptions());

            await expect(tx)
                .to.emit(gateway, 'TokenDeployed')
                .and.to.emit(gateway, 'Executed')
                .withArgs(commandID)
                .and.to.emit(gateway, 'TokenMintLimitUpdated')
                .withArgs(symbol, limit);

            const tokenAddress = await gateway.tokenAddresses(symbol);

            expect(tokenAddress).to.be.properAddress;
            expect(tokenAddress).to.eq(expectedTokenAddress);

            const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

            const actualValues = await Promise.all([token.name(), token.symbol(), token.decimals(), token.cap().then(bigNumberToNumber)]);

            expect(actualValues).to.deep.eq([name, symbol, decimals, cap]);

            console.log('deployToken gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should not deploy a duplicate token', async () => {
            const firstCommandID = getRandomID();
            symbol = `AAT${getRandomInt(1e10)}`;

            const firstData = buildCommandBatch(
                await getChainId(),
                [firstCommandID],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0)],
            );

            const firstInput = await getSignedWeightedExecuteInput(
                firstData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(firstInput, getGasOptions()))
                .to.emit(gateway, 'TokenDeployed')
                .and.to.emit(gateway, 'Executed')
                .withArgs(firstCommandID);

            const secondCommandID = getRandomID();

            const secondData = buildCommandBatch(
                await getChainId(),
                [secondCommandID],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0)],
            );

            const secondInput = await getSignedWeightedExecuteInput(
                secondData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            const executeTx = await gateway.execute(secondInput, getGasOptions());

            await expect(executeTx).to.not.emit(gateway, 'Executed');
            await expect(executeTx).to.not.emit(gateway, 'TokenDeployed');
        });
    });

    describe('command mintToken', () => {
        const name = 'An Awesome Token';
        const decimals = 18;
        const cap = 1e8;

        let token;
        let symbol;

        before(async () => {
            await deployGateway();
        });

        beforeEach(async () => {
            symbol = `AAT${getRandomInt(1e10)}`;

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

            const tokenAddress = await gateway.tokenAddresses(symbol);
            token = burnableMintableCappedERC20Factory.attach(tokenAddress);
        });

        it('should not allow the operators to mint tokens exceeding the daily limit', async () => {
            const limit = getRandomInt(cap / 2);

            await gateway
                .connect(governance)
                .setTokenMintLimits([symbol], [limit], getGasOptions())
                .then((tx) => tx.wait());

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, owner.address, limit)],
            );

            const input = getSignedWeightedExecuteInput(data, operators, getWeights(operators), threshold, operators.slice(0, threshold));

            await expect(gateway.execute(input, getGasOptions()))
                .to.emit(token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, owner.address, limit)
                .and.to.emit(gateway, 'Executed');

            const mintAmount = await gateway.tokenMintAmount(symbol);
            expect(mintAmount.toNumber()).to.eq(limit);

            const amount = 1;
            const data2 = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, owner.address, amount)],
            );
            const input2 = await getSignedWeightedExecuteInput(
                data2,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input2, getGasOptions())).to.not.emit(gateway, 'Executed');

            if (isHardhat) {
                await tickBlockTime(gateway.provider, 6 * 60 * 60); // 6 hours later
                await expect(gateway.execute(input2, getGasOptions()))
                    .to.emit(token, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, owner.address, amount)
                    .and.to.emit(gateway, 'Executed');
            }
        });

        it('should allow the operators to mint tokens', async () => {
            const amount = getRandomInt(cap);

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, owner.address, amount)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions()))
                .to.emit(token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, owner.address, amount)
                .and.to.emit(gateway, 'Executed');

            expect(await token.balanceOf(owner.address).then(bigNumberToNumber)).to.eq(amount);
        });

        it('should not mint wrong symbols', async () => {
            const amount = getRandomInt(cap);

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID()],
                ['mintToken', 'mintToken'],
                [getMintCommand('wrongSymbol', owner.address, amount), getMintCommand('', owner.address, amount)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions())).not.to.emit(token, 'Transfer').and.not.to.emit(gateway, 'Executed');

            expect(await token.balanceOf(owner.address).then(bigNumberToNumber)).to.eq(0);
        });
    });

    describe('command burnToken', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const burnAmount = 100;
        const amount = 10 * burnAmount;

        let burnTestToken;
        let token;

        const burnTokenSetup = async (isStandardERC20) => {
            if (!isStandardERC20) {
                burnTestToken = await nonStandardERC20Factory
                    .deploy(externalTokenName, externalSymbol, externalDecimals, externalCap)
                    .then((d) => d.deployed());
            } else {
                burnTestToken = externalToken;
            }

            await burnTestToken.mint(owner.address, amount).then((tx) => tx.wait());

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID(), getRandomID()],
                ['deployToken', 'deployToken', 'mintToken'],
                [
                    getDeployCommand(externalTokenName, externalSymbol, externalDecimals, externalCap, burnTestToken.address, 0),
                    getDeployCommand(name, symbol, externalDecimals, externalCap, ethers.constants.AddressZero, 0),
                    getMintCommand(symbol, owner.address, amount),
                ],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

            const tokenAddress = await gateway.tokenAddresses(symbol);
            token = await burnableMintableCappedERC20Factory.attach(tokenAddress);
        };

        describe('burn token positive tests', () => {
            before(async () => {
                await deployGateway();
            });

            before(async () => {
                await burnTokenSetup(true);
            });

            it('should allow the operators to burn internal tokens', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnAmount = amount / 10;
                await token.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const dataFirstBurn = buildCommandBatch(await getChainId(), [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

                const firstInput = await getSignedWeightedExecuteInput(
                    dataFirstBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(firstInput, getGasOptions());

                await expect(tx).to.emit(token, 'Transfer').withArgs(depositHandlerAddress, ethers.constants.AddressZero, burnAmount);

                await token.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const dataSecondBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(symbol, salt)],
                );

                const secondInput = await getSignedWeightedExecuteInput(
                    dataSecondBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                await expect(await gateway.execute(secondInput, getGasOptions()))
                    .to.emit(token, 'Transfer')
                    .withArgs(depositHandlerAddress, ethers.constants.AddressZero, burnAmount);

                expect(await token.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);

                console.log('burnToken internal gas:', (await tx.wait()).gasUsed.toNumber());
            });

            it('should allow the operators to burn external tokens', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnAmount = amount / 10;
                await burnTestToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const dataFirstBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(externalSymbol, salt)],
                );

                const firstInput = await getSignedWeightedExecuteInput(
                    dataFirstBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(firstInput, getGasOptions());

                await expect(tx).to.emit(burnTestToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount);

                await burnTestToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const dataSecondBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(externalSymbol, salt)],
                );

                const secondInput = await getSignedWeightedExecuteInput(
                    dataSecondBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                await expect(await gateway.execute(secondInput, getGasOptions()))
                    .to.emit(burnTestToken, 'Transfer')
                    .withArgs(depositHandlerAddress, gateway.address, burnAmount);

                expect(await burnTestToken.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);

                console.log('burnToken external gas:', (await tx.wait()).gasUsed.toNumber());
            });

            it('should allow the operators to burn external tokens even if the deposit address has ether', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                await owner.sendTransaction({ to: depositHandlerAddress, value: '1' }).then((tx) => tx.wait());

                const burnAmount = amount / 10;
                await burnTestToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const dataFirstBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(externalSymbol, salt)],
                );

                const firstInput = await getSignedWeightedExecuteInput(
                    dataFirstBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(firstInput, getGasOptions());

                await expect(tx).to.emit(burnTestToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount);

                await burnTestToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const dataSecondBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(externalSymbol, salt)],
                );

                const secondInput = await getSignedWeightedExecuteInput(
                    dataSecondBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                await gateway
                    .execute(secondInput, getGasOptions())
                    .then((tx) =>
                        expect(tx).to.emit(burnTestToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount),
                    );

                await burnTestToken
                    .balanceOf(depositHandlerAddress)
                    .then(bigNumberToNumber)
                    .then((balance) => expect(balance).to.eq(0));
            });

            it('should allow the operators to burn the external token multiple times from the same address', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));
                const commandIDs = [getRandomID(), getRandomID()];
                const burnAmount = amount / 10;

                await burnTestToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const command = getBurnCommand(externalSymbol, salt);
                const input = await getSignedWeightedExecuteInput(
                    buildCommandBatch(await getChainId(), commandIDs, ['burnToken', 'burnToken'], [command, command]),
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(input, getGasOptions());

                await expect(tx)
                    .to.emit(gateway, 'Executed')
                    .withArgs(commandIDs[0])
                    .and.to.emit(gateway, 'Executed')
                    .withArgs(commandIDs[1])
                    .and.to.emit(burnTestToken, 'Transfer')
                    .withArgs(depositHandlerAddress, gateway.address, burnAmount);

                return burnTestToken
                    .balanceOf(depositHandlerAddress)
                    .then(bigNumberToNumber)
                    .then((balance) => {
                        expect(balance).to.eq(0);
                    })
                    .then(async () => await burnTestToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait()))
                    .then(async () => {
                        const commandID = getRandomID();
                        const input = await getSignedWeightedExecuteInput(
                            buildCommandBatch(await getChainId(), [commandID], ['burnToken'], [getBurnCommand(externalSymbol, salt)]),
                            operators,
                            getWeights(operators),
                            threshold,
                            operators.slice(0, threshold),
                        );

                        const tx = await gateway.execute(input, getGasOptions());
                        await expect(tx)
                            .to.emit(gateway, 'Executed')
                            .withArgs(commandID)
                            .and.to.emit(burnTestToken, 'Transfer')
                            .withArgs(depositHandlerAddress, gateway.address, burnAmount);

                        return await burnTestToken.balanceOf(depositHandlerAddress);
                    })
                    .then(bigNumberToNumber)
                    .then((balance) => {
                        expect(balance).to.eq(0);
                    });
            });
        });

        describe('burn token negative tests', () => {
            before(async () => {
                await deployGateway();
            });

            before(async () => {
                await burnTokenSetup(false);
            });

            it('should fail if symbol does not correspond to internal token', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnAmount = amount / 10;
                await token.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

                const invalidSymbol = 'NA';
                const dataFirstBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(invalidSymbol, salt)],
                );

                const firstInput = await getSignedWeightedExecuteInput(
                    dataFirstBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(firstInput, getGasOptions());

                await expect(tx).to.not.emit(token, 'Transfer');
            });

            it('should fail to burn external tokens if deposit handler execute reverts', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);

                const dataFirstBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(externalSymbol, salt)],
                );

                const firstInput = await getSignedWeightedExecuteInput(
                    dataFirstBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(firstInput, getGasOptions());

                await expect(tx).to.not.emit(burnTestToken, 'Transfer');
            });

            it('should fail to burn external tokens if deposit handler execute fails', async () => {
                const destinationAddress = getRandomString(32);
                const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);

                await burnTestToken.setFailTransfer(true).then((tx) => tx.wait());

                const dataFirstBurn = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(externalSymbol, salt)],
                );

                const firstInput = await getSignedWeightedExecuteInput(
                    dataFirstBurn,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                const tx = await gateway.execute(firstInput, getGasOptions());

                await expect(tx).to.not.emit(burnTestToken, 'Transfer');
            });
        });
    });

    describe('command transferOperatorship', () => {
        beforeEach(async () => {
            await deployGateway();
        });

        it('should allow operators to transfer operatorship', async () => {
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['transferOperatorship'],
                [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newOperators.length)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const tx = await gateway.execute(input, getGasOptions());

            await expect(tx)
                .to.emit(gateway, 'OperatorshipTransferred')
                .withArgs(getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2));

            console.log('transferOperatorship gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should not allow transferring operatorship to address zero', async () => {
            const newOperators = [ethers.constants.AddressZero, '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['transferOperatorship'],
                [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions())).not.to.emit(gateway, 'OperatorshipTransferred');
        });

        it('should allow the previous operators to mint and burn token', async () => {
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const transferOperatorshipData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['transferOperatorship'],
                [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2)],
            );

            const transferOperatorshipInput = await getSignedWeightedExecuteInput(
                transferOperatorshipData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(transferOperatorshipInput, getGasOptions()))
                .to.emit(gateway, 'OperatorshipTransferred')
                .withArgs(getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2));

            const name = 'An Awesome Token';
            const symbol = 'AAT';
            const decimals = 18;
            const cap = 1e8;

            const deployData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0)],
            );

            const deployAndMintInput = await getSignedWeightedExecuteInput(
                deployData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(deployAndMintInput, getGasOptions())).to.emit(gateway, 'TokenDeployed');

            const tokenAddress = await gateway.tokenAddresses(symbol);
            const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

            const amount = getRandomInt(cap);

            const mintData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, owner.address, amount)],
            );

            const mintInput = await getSignedWeightedExecuteInput(
                mintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(mintInput, getGasOptions()))
                .to.emit(token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, owner.address, amount)
                .and.to.emit(gateway, 'Executed');

            expect(await token.balanceOf(owner.address).then(bigNumberToNumber)).to.eq(amount);

            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(`${destinationBtcAddress}-${owner.address}-${Date.now()}`);
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

            const burnData = buildCommandBatch(await getChainId(), [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

            await token.transfer(depositHandlerAddress, amount).then((tx) => tx.wait());

            const burnInput = await getSignedWeightedExecuteInput(
                burnData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(burnInput, getGasOptions()))
                .to.emit(token, 'Transfer')
                .withArgs(depositHandlerAddress, ethers.constants.AddressZero, amount);
        });

        it('should not allow the previous operators to transfer operatorship', async () => {
            let newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const buildTransferData = async () =>
                buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newOperators.length)],
                );

            let input = await getSignedWeightedExecuteInput(
                await buildTransferData(),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions())).to.emit(gateway, 'OperatorshipTransferred');

            newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            input = await getSignedWeightedExecuteInput(
                await buildTransferData(),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions())).not.to.emit(gateway, 'OperatorshipTransferred');
        });

        it('should not allow operatorship transfer to the previous operators', async () => {
            const updatedOperators = getAddresses(operators.slice(0, threshold - 1));

            const buildTransferData = async (newOperators, newThreshold = newOperators.length) =>
                buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newThreshold)],
                );

            let input = await getSignedWeightedExecuteInput(
                await buildTransferData(updatedOperators),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions())).to.emit(gateway, 'OperatorshipTransferred');

            // now transfer operatorship back to the original operators
            const oldOperators = getAddresses(operators);

            input = await getSignedWeightedExecuteInput(
                await buildTransferData(oldOperators, threshold),
                operators.slice(0, threshold - 1),
                getWeights(updatedOperators),
                threshold - 1,
                operators.slice(0, threshold - 1),
            );

            await expect(gateway.execute(input, getGasOptions())).not.to.emit(gateway, 'OperatorshipTransferred');
        });

        it('should not allow multiple operatorship transfers in one batch', async () => {
            const updatedOperators = getAddresses(operators.slice(0, threshold - 1));
            const commandIds = Array(threshold).fill(null).map(getRandomID);

            const buildTransferData = async (newOperators, newThreshold = newOperators.length) =>
                buildCommandBatch(
                    await getChainId(),
                    commandIds,
                    commandIds.map(() => 'transferOperatorship'),
                    commandIds.map((x, i) =>
                        getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newThreshold - i),
                    ),
                );

            const input = await getSignedWeightedExecuteInput(
                await buildTransferData(updatedOperators),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const result = await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

            expect(result.events.filter(({ event }) => event === 'Executed').length).to.be.equal(1);
        });
    });

    describe('sendToken', () => {
        const tokenName = 'Test Token';
        const decimals = 18;
        const cap = 1e9;

        describe('send token negative tests', () => {
            before(async () => {
                await deployGateway(true);
            });

            it('should fail if token deployment fails', async () => {
                const tokenSymbol = `TEST${getRandomString(10)}`;

                const deployAndMintData = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(tokenName, tokenSymbol, decimals, cap, ethers.constants.AddressZero, 0)],
                );

                const input = await getSignedWeightedExecuteInput(
                    deployAndMintData,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

                const tokenAddress = await gateway.tokenAddresses(tokenSymbol);
                expect(tokenAddress).to.equal(AddressZero);
            });
        });

        describe('send token positive tests', () => {
            before(async () => {
                await deployGateway();
            });

            it('should burn internal token and emit an event', async () => {
                const tokenSymbol = `TEST${getRandomString(10)}`;

                const deployAndMintData = buildCommandBatch(
                    await getChainId(),
                    [getRandomID(), getRandomID()],
                    ['deployToken', 'mintToken'],
                    [
                        getDeployCommand(tokenName, tokenSymbol, decimals, cap, ethers.constants.AddressZero, 0),
                        getMintCommand(tokenSymbol, owner.address, 1e6),
                    ],
                );

                const input = await getSignedWeightedExecuteInput(
                    deployAndMintData,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

                const tokenAddress = await gateway.tokenAddresses(tokenSymbol);
                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const issuer = owner.address;
                const spender = gateway.address;
                const amount = 1000;
                const destination = operators[1].address;

                const approveTx = await token.approve(spender, amount);
                await expect(approveTx).to.emit(token, 'Approval').withArgs(issuer, spender, amount);

                const tx = await gateway.sendToken('Polygon', destination, tokenSymbol, amount);
                await expect(tx)
                    .to.emit(token, 'Transfer')
                    .withArgs(issuer, ethers.constants.AddressZero, amount)
                    .to.emit(gateway, 'TokenSent')
                    .withArgs(issuer, 'Polygon', destination, tokenSymbol, amount);

                console.log('sendToken internal gas:', (await tx.wait()).gasUsed.toNumber());
            });

            it('should lock external token and emit an event', async () => {
                const tokenSymbol = externalSymbol;
                const token = externalToken;
                const amount = 1000;

                await token.mint(owner.address, amount).then((tx) => tx.wait());

                const deployData = buildCommandBatch(
                    await getChainId(),
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(tokenName, tokenSymbol, decimals, cap, token.address, 0)],
                );

                const input = await getSignedWeightedExecuteInput(
                    deployData,
                    operators,
                    getWeights(operators),
                    threshold,
                    operators.slice(0, threshold),
                );

                await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

                const issuer = owner.address;
                const locker = gateway.address;
                const destination = operators[1].address;

                await expect(token.approve(locker, amount)).to.emit(token, 'Approval').withArgs(issuer, locker, amount);

                const tx = await gateway.sendToken('Polygon', destination, tokenSymbol, amount);

                await expect(tx)
                    .to.emit(token, 'Transfer')
                    .withArgs(issuer, locker, amount)
                    .to.emit(gateway, 'TokenSent')
                    .withArgs(issuer, 'Polygon', destination, tokenSymbol, amount);

                console.log('sendNative external gas:', (await tx.wait()).gasUsed.toNumber());
            });
        });
    });

    describe('external tokens', () => {
        const name = 'test';
        const symbol = getRandomString(10);
        const decimals = 16;
        const capacity = 0;

        before(async () => {
            await deployGateway();
        });

        it('should fail if external ERC20 token address is invalid', async () => {
            const token = owner;

            const deployData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, capacity, token.address, 0)],
            );

            const deployInput = await getSignedWeightedExecuteInput(
                deployData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(deployInput, getGasOptions())).to.not.emit(gateway, 'TokenDeployed');

            const tokenAddress = await gateway.tokenAddresses(symbol);
            expect(tokenAddress).to.equal(AddressZero);
        });

        it('should support external ERC20 token', async () => {
            const amount = 10000;

            await externalToken.mint(owner.address, amount).then((tx) => tx.wait());

            const deployData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(externalTokenName, externalSymbol, externalDecimals, externalCap, externalToken.address, 0)],
            );

            const deployInput = await getSignedWeightedExecuteInput(
                deployData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(deployInput, getGasOptions()))
                .to.emit(gateway, 'TokenDeployed')
                .withArgs(externalSymbol, externalToken.address);

            const salt = '0x2b3e73733ff31436169744c5808241dad2ff8921cf7e4cca6405a6e38d4f7b37';
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));
            await externalToken.transfer(depositHandlerAddress, amount);

            const burnData = buildCommandBatch(await getChainId(), [getRandomID()], ['burnToken'], [getBurnCommand(externalSymbol, salt)]);

            const burnInput = await getSignedWeightedExecuteInput(
                burnData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(burnInput, getGasOptions()))
                .to.emit(externalToken, 'Transfer')
                .withArgs(depositHandlerAddress, gateway.address, amount);

            const mintData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(externalSymbol, wallets[1].address, amount)],
            );

            const mintInput = await getSignedWeightedExecuteInput(
                mintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(mintInput, getGasOptions()))
                .to.emit(externalToken, 'Transfer')
                .withArgs(gateway.address, wallets[1].address, amount);
        });
    });

    describe('batch commands', () => {
        const sourceChain = 'Polygon';
        const sourceAddress = 'address0x123';
        const sourceTxHash = keccak256('0x123abc123abc');
        const sourceEventIndex = 17;

        before(async () => {
            await deployGateway();
        });

        it('should revert on mismatch between commandID and command/params length', async () => {
            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            let data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID()],
                ['approveContractCall'],
                [getApproveContractCall(sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex)],
            );

            let input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expectRevert((gasOptions) => gateway.execute(input, gasOptions), gateway, 'InvalidCommands');

            data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID()],
                ['approveContractCall', 'approveContractCall'],
                [getApproveContractCall(sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex)],
            );

            input = await getSignedWeightedExecuteInput(data, operators, getWeights(operators), threshold, operators.slice(0, threshold));

            await expectRevert((gasOptions) => gateway.execute(input, gasOptions), gateway, 'InvalidCommands');
        });

        it('should batch execute multiple commands and skip any unknown commands', async () => {
            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const commandID1 = getRandomID();
            const commandID2 = getRandomID();

            const data = buildCommandBatch(
                await getChainId(),
                [commandID1, getRandomID(), commandID2],
                ['approveContractCall', 'unknownCommand', 'approveContractCall'],
                [
                    getApproveContractCall(sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex),
                    '0x',
                    getApproveContractCall(sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex),
                ],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions()))
                .to.emit(gateway, 'ContractCallApproved')
                .withArgs(commandID1, sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex)
                .to.emit(gateway, 'ContractCallApproved')
                .withArgs(commandID2, sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex);
        });

        it('should not execute the same commandID twice', async () => {
            const name = 'Bitcoin';
            const symbol = 'BTC';
            const decimals = 8;
            const cap = 2100000000;
            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const duplicateCommandID = getRandomID();

            const data = buildCommandBatch(
                await getChainId(),
                [duplicateCommandID, duplicateCommandID],
                ['approveContractCall', 'deployToken'],
                [
                    getApproveContractCall(sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex),
                    getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0),
                ],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input, getGasOptions()))
                .to.emit(gateway, 'ContractCallApproved')
                .withArgs(duplicateCommandID, sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex)
                .to.not.emit(gateway, 'TokenDeployed');
        });
    });

    describe('callContract', () => {
        before(async () => {
            await deployGateway();
        });

        it('should burn internal token and emit an event', async () => {
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'uint256'], [owner.address, 1000]);

            const tx = await gateway.connect(owner).callContract(chain, destination, payload);

            await expect(tx).to.emit(gateway, 'ContractCall').withArgs(owner.address, chain, destination, keccak256(payload), payload);

            console.log('callContract gas:', (await tx.wait()).gasUsed.toNumber());
        });
    });

    describe('callContractWithToken', () => {
        const tokenName = 'Test Token';
        const decimals = 18;
        const cap = 1e9;
        const tokenSymbol = getRandomString(10);

        before(async () => {
            await deployGateway();

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(tokenName, tokenSymbol, decimals, cap, ethers.constants.AddressZero, 0)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());
        });

        it('should revert if token does not exist', async () => {
            const invalidTokenSymbol = getRandomString(10);

            const amount = 1000;
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'address'], [owner.address, destination]);

            await expectRevert(
                (gasOptions) => gateway.callContractWithToken(chain, destination, payload, invalidTokenSymbol, amount, gasOptions),
                gateway,
                'TokenDoesNotExist',
            );
        });

        it('should revert if token amount is invalid', async () => {
            const amount = 0;
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'address'], [owner.address, destination]);

            await expectRevert(
                (gasOptions) => gateway.callContractWithToken(chain, destination, payload, tokenSymbol, amount, gasOptions),
                gateway,
                'InvalidAmount',
            );
        });

        it('should burn internal token and emit an event', async () => {
            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(tokenSymbol, owner.address, 1e6)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

            const tokenAddress = await gateway.tokenAddresses(tokenSymbol);
            const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

            const issuer = owner.address;
            const spender = gateway.address;
            const amount = 1000;
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'address'], [owner.address, destination]);

            await expect(token.approve(spender, amount)).to.emit(token, 'Approval').withArgs(issuer, spender, amount);

            const tx = await gateway.callContractWithToken(chain, destination, payload, tokenSymbol, amount);

            await expect(tx)
                .to.emit(token, 'Transfer')
                .withArgs(issuer, ethers.constants.AddressZero, amount)
                .to.emit(gateway, 'ContractCallWithToken')
                .withArgs(issuer, chain, destination, keccak256(payload), payload, tokenSymbol, amount);

            console.log('callContractWithToken internal gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should lock external token and emit an event', async () => {
            const amount = 1000;

            await externalToken.mint(owner.address, amount).then((tx) => tx.wait());

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(externalTokenName, externalSymbol, externalDecimals, externalCap, externalToken.address, 0)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await gateway.execute(input, getGasOptions()).then((tx) => tx.wait());

            const issuer = owner.address;
            const locker = gateway.address;
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'address'], [owner.address, destination]);

            await expect(externalToken.approve(locker, amount)).to.emit(externalToken, 'Approval').withArgs(issuer, locker, amount);

            const tx = await gateway.callContractWithToken(chain, destination, payload, externalSymbol, amount);

            await expect(tx)
                .to.emit(externalToken, 'Transfer')
                .withArgs(issuer, locker, amount)
                .to.emit(gateway, 'ContractCallWithToken')
                .withArgs(issuer, chain, destination, keccak256(payload), payload, externalSymbol, amount);

            console.log('callContractWithToken external gas:', (await tx.wait()).gasUsed.toNumber());
        });
    });

    describe('external contract approval and execution', () => {
        before(async () => {
            await deployGateway();
        });

        it('should approve and validate contract call', async () => {
            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const commandId = getRandomID();
            const sourceChain = 'Polygon';
            const sourceAddress = 'address0x123';
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const isApprovedInitially = await gateway.isContractCallApproved(
                commandId,
                sourceChain,
                sourceAddress,
                owner.address,
                payloadHash,
            );

            expect(isApprovedInitially).to.be.false;

            await gateway
                .connect(owner)
                .validateContractCall(commandId, sourceChain, sourceAddress, payloadHash)
                .then((tx) => tx.wait());

            expect(isApprovedInitially).to.be.false;

            const approveData = buildCommandBatch(
                await getChainId(),
                [commandId],
                ['approveContractCall'],
                [getApproveContractCall(sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex)],
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
                .withArgs(commandId, sourceChain, sourceAddress, owner.address, payloadHash, sourceTxHash, sourceEventIndex);

            const isApprovedBefore = await gateway.isContractCallApproved(
                commandId,
                sourceChain,
                sourceAddress,
                owner.address,
                payloadHash,
            );

            expect(isApprovedBefore).to.be.true;

            await gateway
                .connect(owner)
                .validateContractCall(commandId, sourceChain, sourceAddress, payloadHash)
                .then((tx) => tx.wait());

            expect(isApprovedBefore).to.be.true;

            await gateway
                .connect(owner)
                .validateContractCall(commandId, sourceChain, sourceAddress, payloadHash)
                .then((tx) => tx.wait());

            const isApprovedAfter = await gateway.isContractCallApproved(commandId, sourceChain, sourceAddress, owner.address, payloadHash);

            expect(isApprovedAfter).to.be.false;
        });

        it('should approve and validate contract call with token', async () => {
            await externalToken.mint(gateway.address, 1e6).then((tx) => tx.wait());

            const deployTokenData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(externalTokenName, externalSymbol, externalDecimals, externalCap, externalToken.address, 0)],
            );

            const deployTokenInput = await getSignedWeightedExecuteInput(
                deployTokenData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(deployTokenInput, getGasOptions()))
                .to.emit(gateway, 'TokenDeployed')
                .withArgs(externalSymbol, externalToken.address);

            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const amount = 20000;
            const commandId = getRandomID();
            const sourceChain = 'Polygon';
            const sourceAddress = 'address0x123';
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const isApprovedInitially = await gateway.isContractCallAndMintApproved(
                commandId,
                sourceChain,
                sourceAddress,
                owner.address,
                payloadHash,
                externalSymbol,
                amount,
            );

            expect(isApprovedInitially).to.be.false;

            await gateway
                .connect(owner)
                .validateContractCallAndMint(commandId, sourceChain, sourceAddress, payloadHash, externalSymbol, amount)
                .then((tx) => tx.wait());

            expect(isApprovedInitially).to.be.false;

            const approveWithMintData = buildCommandBatch(
                await getChainId(),
                [commandId],
                ['approveContractCallWithMint'],
                [
                    getApproveContractCallWithMint(
                        sourceChain,
                        sourceAddress,
                        owner.address,
                        payloadHash,
                        externalSymbol,
                        amount,
                        sourceTxHash,
                        sourceEventIndex,
                    ),
                ],
            );

            const approveWithMintInput = await getSignedWeightedExecuteInput(
                approveWithMintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(approveWithMintInput, getGasOptions()))
                .to.emit(gateway, 'ContractCallApprovedWithMint')
                .withArgs(
                    commandId,
                    sourceChain,
                    sourceAddress,
                    owner.address,
                    payloadHash,
                    externalSymbol,
                    amount,
                    sourceTxHash,
                    sourceEventIndex,
                );

            const isApprovedBefore = await gateway.isContractCallAndMintApproved(
                commandId,
                sourceChain,
                sourceAddress,
                owner.address,
                payloadHash,
                externalSymbol,
                amount,
            );

            expect(isApprovedBefore).to.be.true;

            await gateway
                .connect(owner)
                .validateContractCallAndMint(commandId, sourceChain, sourceAddress, payloadHash, externalSymbol, amount)
                .then((tx) => tx.wait());

            const isApprovedAfter = await gateway.isContractCallAndMintApproved(
                commandId,
                sourceChain,
                sourceAddress,
                owner.address,
                payloadHash,
                externalSymbol,
                amount,
            );

            expect(isApprovedAfter).to.be.false;
        });
    });

    describe('deprecated functions', () => {
        before(async () => {
            await deployGateway();
        });

        it('should return correct value for allTokensFrozen', async () => {
            expect(await gateway.allTokensFrozen()).to.be.false;
        });

        it('should return correct value for adminEpoch', async () => {
            expect(await gateway.adminEpoch()).to.eq(0);
        });

        it('should return correct value for adminThreshold', async () => {
            let epoch = 1;
            expect(await gateway.adminThreshold(epoch)).to.eq(0);

            epoch = getRandomInt(Number.MAX_SAFE_INTEGER);
            expect(await gateway.adminThreshold(epoch)).to.eq(0);
        });

        it('should return correct value for admins', async () => {
            let epoch = 1;
            expect(await gateway.admins(epoch)).to.deep.equal([]);

            epoch = getRandomInt(Number.MAX_SAFE_INTEGER);
            expect(await gateway.admins(epoch)).to.deep.equal([]);
        });

        it('should return correct value for tokenFrozen', async () => {
            const token = 'Token';
            expect(await gateway.tokenFrozen(token)).to.be.false;
        });
    });
});
