const { sortBy } = require('lodash');
const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { id, keccak256, getCreate2Address, defaultAbiCoder },
} = ethers;
const { expect } = chai;
const { isHardhat, getChainId, getEVMVersion, getGasOptions, getRandomString } = require('./utils');
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

    let auth;
    let tokenDeployer;
    let gateway;

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

        // reuse token deployer for all tests
        tokenDeployer = await tokenDeployerFactory.deploy();
        await tokenDeployer.deployTransaction.wait(network.config.confirmations);
    });

    const deployGateway = async () => {
        const operatorAddresses = getAddresses(operators);

        auth = await authFactory.deploy(getWeightedAuthDeployParam([operatorAddresses], [getWeights(operatorAddresses)], [threshold]));
        await auth.deployTransaction.wait(network.config.confirmations);

        const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address);
        await gatewayImplementation.deployTransaction.wait(network.config.confirmations);

        const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, [], [], threshold);

        const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params);
        await proxy.deployTransaction.wait(network.config.confirmations);

        await auth.transferOwnership(proxy.address).then((tx) => tx.wait(network.config.confirmations));

        gateway = gatewayFactory.attach(proxy.address);
    };

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
                istanbul: '0x549b06417d02700e3e54482f8a8c832207ad294823b12c6309e5702a1094bf0e',
                berlin: '0x9925a5f96366519ee0b5969a410851769be170c72e430c006c1e86f3d6ccff0a',
                london: '0x8332f8d76a3d5dd2aa43d12edcbeb40f50de048c96c56e7df7ddbc321ca3bfe0',
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
                (input) => gateway.execute(input, getGasOptions()),
            );
        });

        it("should allow governance to set a token's daily limit", async () => {
            const limit = getRandomInt(Number.MAX_SAFE_INTEGER);
            const limits = symbols.map(() => limit);

            await expect(gateway.connect(notGovernance).setTokenMintLimits(symbols, limits, getGasOptions())).to.be.revertedWithCustomError(
                gateway,
                'NotMintLimiter',
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
            await expect(
                gateway.connect(notGovernance).transferGovernance(governance.address, getGasOptions()),
            ).to.be.revertedWithCustomError(gateway, 'NotGovernance');

            await expect(await gateway.connect(governance).transferGovernance(notGovernance.address, getGasOptions()))
                .to.emit(gateway, 'GovernanceTransferred')
                .withArgs(governance.address, notGovernance.address);

            await expect(gateway.connect(governance).transferGovernance(governance.address, getGasOptions())).to.be.revertedWithCustomError(
                gateway,
                'NotGovernance',
            );

            expect(await gateway.governance()).to.be.equal(notGovernance.address);
        });

        it('should allow transferring mint limiter', async () => {
            const notMintLimiter = notGovernance;

            await expect(
                gateway.connect(notMintLimiter).transferMintLimiter(notMintLimiter.address, getGasOptions()),
            ).to.be.revertedWithCustomError(gateway, 'NotMintLimiter');

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
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);
            const params = '0x';

            await expect(
                gateway
                    .connect(notGovernance)
                    .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, getGasOptions()),
            ).to.be.revertedWithCustomError(gateway, 'NotGovernance');

            await expect(
                gateway
                    .connect(governance)
                    .upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params, getGasOptions()),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address)
                .to.not.emit(gateway, 'GovernanceTransferred')
                .to.not.emit(gateway, 'OperatorshipTransferred');
        });

        it('should allow governance to upgrade to the correct implementation with new governance and operators', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);

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
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);
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
            const wrongImplementationCodeHash = keccak256(`0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`);

            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, newOperatorAddresses, Array(2).fill(1), 2);

            await expect(
                gateway.connect(notGovernance).upgrade(newGatewayImplementation.address, wrongImplementationCodeHash, params),
            ).to.be.revertedWithCustomError(gateway, 'NotGovernance');

            await expect(
                gateway.connect(governance).upgrade(newGatewayImplementation.address, wrongImplementationCodeHash, params),
            ).to.be.revertedWithCustomError(gateway, 'InvalidCodeHash');
        });

        it('should not allow calling the setup function directly', async () => {
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, newOperatorAddresses, Array(2).fill(1), 2);

            await expect(gateway.connect(governance).setup(params)).not.to.emit(gateway, 'OperatorshipTransferred');

            const implementation = gatewayFactory.attach(await gateway.implementation());

            await expect(implementation.connect(governance).setup(params)).to.be.revertedWithCustomError(implementation, 'NotProxy');
        });

        it('should not allow calling the upgrade on the implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCodeHash = await getBytecodeHash(newGatewayImplementation);

            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(governance.address, mintLimiter.address, newOperatorAddresses, Array(2).fill(1), 2);

            const implementation = gatewayFactory.attach(await gateway.implementation());

            await expect(
                implementation.connect(notGovernance).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params),
            ).to.be.revertedWithCustomError(implementation, 'NotGovernance');
        });
    });

    describe('chain id', () => {
        // hardhat seems to have an issue to detect a revert here for live networks
        if (!isHardhat) {
            return;
        }

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

            await expect(gateway.execute(input, getGasOptions())).to.be.revertedWithCustomError(gateway, 'InvalidChainId');
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

            await gateway.connect(governance).setTokenMintLimits([symbol], [limit], getGasOptions());

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
        const externalName = 'An External Token';
        const externalSymbol = 'AET';
        const decimals = 18;
        const cap = 1e8;
        const burnAmount = 100;
        const amount = 10 * burnAmount;

        let token;
        let externalToken;

        before(async () => {
            await deployGateway();
        });

        before(async () => {
            externalToken = await mintableCappedERC20Factory.deploy(externalName, externalSymbol, decimals, cap).then((d) => d.deployed());
            await externalToken.mint(owner.address, amount).then((tx) => tx.wait());

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID(), getRandomID()],
                ['deployToken', 'deployToken', 'mintToken'],
                [
                    getDeployCommand(externalName, externalSymbol, decimals, cap, externalToken.address, 0),
                    getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0),
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
            token = burnableMintableCappedERC20Factory.attach(tokenAddress);
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

            const dataSecondBurn = buildCommandBatch(await getChainId(), [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

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
            await externalToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

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

            await expect(tx).to.emit(externalToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount);

            await externalToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

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
                .to.emit(externalToken, 'Transfer')
                .withArgs(depositHandlerAddress, gateway.address, burnAmount);

            expect(await externalToken.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);

            console.log('burnToken external gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should allow the operators to burn external tokens even if the deposit address has ether', async () => {
            const destinationAddress = getRandomString(32);
            const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

            await wallets[0].sendTransaction({ to: depositHandlerAddress, value: '100000000000000000' });

            const burnAmount = amount / 10;
            await externalToken.transfer(depositHandlerAddress, burnAmount);

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

            await expect(tx).to.emit(externalToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount);

            await externalToken.transfer(depositHandlerAddress, burnAmount);

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
                .then((tx) => expect(tx).to.emit(externalToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount));
            await externalToken
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

            await externalToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());
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
                .and.to.emit(externalToken, 'Transfer')
                .withArgs(depositHandlerAddress, gateway.address, burnAmount);

            return externalToken
                .balanceOf(depositHandlerAddress)
                .then(bigNumberToNumber)
                .then((balance) => {
                    expect(balance).to.eq(0);
                })
                .then(async () => await externalToken.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait()))
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
                        .and.to.emit(externalToken, 'Transfer')
                        .withArgs(depositHandlerAddress, gateway.address, burnAmount);

                    return externalToken.balanceOf(depositHandlerAddress);
                })
                .then(bigNumberToNumber)
                .then((balance) => {
                    expect(balance).to.eq(0);
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

            await token.transfer(depositHandlerAddress, amount);
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
            const tokenSymbol = `TEST${getRandomString(10)}`;
            const token = await mintableCappedERC20Factory.deploy(tokenName, tokenSymbol, decimals, cap).then((d) => d.deployed());

            await token.mint(owner.address, 1000000);

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
            await gateway.execute(input, getGasOptions());

            const issuer = owner.address;
            const locker = gateway.address;
            const amount = 1000;
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

    describe('external tokens', () => {
        before(async () => {
            await deployGateway();
        });

        it('should support external ERC20 token', async () => {
            const name = 'test';
            const symbol = getRandomString(10);
            const decimals = 16;
            const capacity = 0;

            const token = await mintableCappedERC20Factory.deploy(name, symbol, decimals, capacity).then((d) => d.deployed());

            const amount = 10000;

            await token.mint(owner.address, amount).then((tx) => tx.wait());

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

            await expect(gateway.execute(deployInput, getGasOptions())).to.emit(gateway, 'TokenDeployed').withArgs(symbol, token.address);

            const salt = '0x2b3e73733ff31436169744c5808241dad2ff8921cf7e4cca6405a6e38d4f7b37';
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));
            await token.transfer(depositHandlerAddress, amount).then((tx) => tx.wait());

            const burnData = buildCommandBatch(await getChainId(), [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

            const burnInput = await getSignedWeightedExecuteInput(
                burnData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(burnInput, getGasOptions()))
                .to.emit(token, 'Transfer')
                .withArgs(depositHandlerAddress, gateway.address, amount);

            const mintData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, wallets[1].address, amount)],
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
                .withArgs(gateway.address, wallets[1].address, amount);
        });
    });

    describe('batch commands', () => {
        before(async () => {
            await deployGateway();
        });

        it('should batch execute multiple commands', async () => {
            const name = 'Bitcoin';
            const symbol = 'BTC';
            const decimals = 8;
            const cap = 2100000000;
            const amount1 = 10000;
            const amount2 = 20000;
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID(), getRandomID(), getRandomID()],
                ['deployToken', 'mintToken', 'mintToken', 'transferOperatorship'],
                [
                    getDeployCommand(name, symbol, decimals, cap, ethers.constants.AddressZero, 0),
                    getMintCommand(symbol, owner.address, amount1),
                    getMintCommand(symbol, wallets[1].address, amount2),
                    getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2),
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
                .to.emit(gateway, 'TokenDeployed')
                .and.to.emit(gateway, 'OperatorshipTransferred');

            const tokenAddress = await gateway.tokenAddresses(symbol);

            expect(tokenAddress).to.be.properAddress;

            const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

            const values = await Promise.all([
                token.name(),
                token.symbol(),
                token.decimals(),
                token.cap().then(bigNumberToNumber),
                token.balanceOf(owner.address).then(bigNumberToNumber),
                token.balanceOf(wallets[1].address).then(bigNumberToNumber),
            ]);

            expect(values).to.deep.eq([name, symbol, decimals, cap, amount1, amount2]);
        });
    });

    describe('callContract', () => {
        before(async () => {
            await deployGateway();
        });

        it('should burn internal token and emit an event', async () => {
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'uint256'], [wallets[0].address, 1000]);

            const tx = await gateway.connect(owner).callContract(chain, destination, payload);

            await expect(tx).to.emit(gateway, 'ContractCall').withArgs(owner.address, chain, destination, keccak256(payload), payload);

            console.log('callContract gas:', (await tx.wait()).gasUsed.toNumber());
        });
    });

    describe('callContractWithToken', () => {
        const tokenName = 'Test Token';
        const decimals = 18;
        const cap = 1e9;

        before(async () => {
            await deployGateway();
        });

        it('should burn internal token and emit an event', async () => {
            const tokenSymbol = getRandomString(10);
            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID()],
                ['deployToken', 'mintToken'],
                [
                    getDeployCommand(tokenName, tokenSymbol, decimals, cap, ethers.constants.AddressZero, 0),
                    getMintCommand(tokenSymbol, owner.address, 1e6),
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
            const tokenSymbol = getRandomString(10);
            const token = await mintableCappedERC20Factory.deploy(tokenName, tokenSymbol, decimals, cap).then((d) => d.deployed());

            await token.mint(owner.address, 1000000).then((tx) => tx.wait());

            const data = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(tokenName, tokenSymbol, decimals, cap, token.address, 0)],
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
            const amount = 1000;
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'address'], [owner.address, destination]);

            await expect(token.approve(locker, amount)).to.emit(token, 'Approval').withArgs(issuer, locker, amount);

            const tx = await gateway.callContractWithToken(chain, destination, payload, tokenSymbol, amount);

            await expect(tx)
                .to.emit(token, 'Transfer')
                .withArgs(issuer, locker, amount)
                .to.emit(gateway, 'ContractCallWithToken')
                .withArgs(issuer, chain, destination, keccak256(payload), payload, tokenSymbol, amount);

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

            const isApprovedAfter = await gateway.isContractCallApproved(commandId, sourceChain, sourceAddress, owner.address, payloadHash);

            expect(isApprovedAfter).to.be.false;
        });

        it('should approve and validate contract call with token', async () => {
            const nameA = 'testA';
            const symbolA = 'testA';
            const decimals = 16;
            const capacity = 0;

            const tokenA = await mintableCappedERC20Factory.deploy(nameA, symbolA, decimals, capacity).then((d) => d.deployed());

            await tokenA.mint(gateway.address, 1e6).then((tx) => tx.wait());

            const deployTokenData = buildCommandBatch(
                await getChainId(),
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(nameA, symbolA, decimals, capacity, tokenA.address, 0)],
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
                .withArgs(symbolA, tokenA.address);

            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const amount = 20000;
            const commandId = getRandomID();
            const sourceChain = 'Polygon';
            const sourceAddress = 'address0x123';
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

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
                        symbolA,
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
                    symbolA,
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
                symbolA,
                amount,
            );

            expect(isApprovedBefore).to.be.true;

            await gateway
                .connect(owner)
                .validateContractCallAndMint(commandId, sourceChain, sourceAddress, payloadHash, symbolA, amount)
                .then((tx) => tx.wait());

            const isApprovedAfter = await gateway.isContractCallAndMintApproved(
                commandId,
                sourceChain,
                sourceAddress,
                owner.address,
                payloadHash,
                symbolA,
                amount,
            );

            expect(isApprovedAfter).to.be.false;
        });
    });
});
