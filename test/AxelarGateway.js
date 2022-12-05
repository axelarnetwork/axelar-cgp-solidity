const { sortBy } = require('lodash');
const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { id, keccak256, getCreate2Address, defaultAbiCoder },
} = ethers;
const { expect } = chai;

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const {
    bigNumberToNumber,
    getSignedWeightedExecuteInput,
    getRandomInt,
    getRandomID,
    getMultisigProxyDeployParams,
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
    const threshold = 3;

    let wallets;
    let owner;
    let operators;
    let admins;

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
        admins = wallets.slice(0, 3);
        owner = wallets[0];
        operators = sortBy(wallets.slice(3, 9), (wallet) => wallet.address.toLowerCase());

        gatewayFactory = await ethers.getContractFactory('AxelarGateway', owner);
        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', owner);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', owner);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', owner);
        burnableMintableCappedERC20Factory = await ethers.getContractFactory('BurnableMintableCappedERC20', owner);
        depositHandlerFactory = await ethers.getContractFactory('DepositHandler', owner);
        mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', owner);
    });

    beforeEach(async () => {
        const adminAddresses = getAddresses(admins);
        const operatorAddresses = getAddresses(operators);

        const params = getMultisigProxyDeployParams(adminAddresses, threshold, [], threshold);

        auth = await authFactory
            .deploy(getWeightedAuthDeployParam([operatorAddresses], [getWeights(operatorAddresses)], [threshold]))
            .then((d) => d.deployed());
        tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
        const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
        const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());
        await auth.transferOwnership(proxy.address);

        gateway = gatewayFactory.attach(proxy.address);
    });

    describe('admins', () => {
        it('should get the correct admins', async () => {
            expect(await gateway.admins(1)).to.deep.eq(getAddresses(admins));
        });
    });

    describe('setTokenMintLimits', () => {
        const symbols = ['tokenA', 'tokenB'];
        const decimals = 8;

        beforeEach(() => {
            const data = buildCommandBatch(
                CHAIN_ID,
                symbols.map(getRandomID),
                symbols.map(() => 'deployToken'),
                symbols.map((symbol) => getDeployCommand(symbol, symbol, decimals, 0, ADDRESS_ZERO, 0)),
            );

            return getSignedWeightedExecuteInput(data, operators, getWeights(operators), threshold, operators.slice(0, threshold)).then(
                (input) => gateway.execute(input),
            );
        });

        it("should allow admins to set a token's daily limit", () => {
            const limit = getRandomInt(Number.MAX_SAFE_INTEGER);
            const limits = symbols.map(() => limit);

            return expect(gateway.connect(admins[0]).setTokenMintLimits(symbols, limits))
                .to.not.emit(gateway, 'TokenMintLimitUpdated')
                .then(() =>
                    expect(gateway.connect(admins[1]).setTokenMintLimits(symbols, limits)).to.not.emit(gateway, 'TokenMintLimitUpdated'),
                )
                .then(() => gateway.connect(admins[2]).setTokenMintLimits(symbols, limits))
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

    describe('upgrade', () => {
        it('should allow the admins to upgrade to the correct implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCode = await newGatewayImplementation.provider.getCode(newGatewayImplementation.address);
            const newGatewayImplementationCodeHash = keccak256(newGatewayImplementationCode);

            const newAdminAddresses = getAddresses(admins.slice(0, 2));
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getWeightedProxyDeployParams(newAdminAddresses, 2, newOperatorAddresses, getWeights(newOperatorAddresses), 2);

            await Promise.all(
                admins
                    .slice(0, threshold - 1)
                    .map((admin) =>
                        expect(
                            gateway.connect(admin).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params),
                        ).to.not.emit(gateway, 'Upgraded'),
                    ),
            );

            await expect(
                gateway.connect(admins[threshold - 1]).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address);
        });

        it('should not allow the admins to upgrade to a wrong implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const wrongImplementationCodeHash = keccak256(`0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`);

            const newAdminAddresses = getAddresses(admins.slice(0, 2));
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getMultisigProxyDeployParams(newAdminAddresses, 2, newOperatorAddresses, 2);

            await Promise.all(
                admins
                    .slice(0, threshold - 1)
                    .map((admin) =>
                        expect(
                            gateway.connect(admin).upgrade(newGatewayImplementation.address, wrongImplementationCodeHash, params),
                        ).to.not.emit(gateway, 'Upgraded'),
                    ),
            );

            await expect(
                gateway.connect(admins[threshold - 1]).upgrade(newGatewayImplementation.address, wrongImplementationCodeHash, params),
            ).to.be.revertedWith('InvalidCodeHash()');
        });

        it('should not allow calling the setup function directly', async () => {
            const newAdminAddresses = getAddresses(admins.slice(0, 2));
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getMultisigProxyDeployParams(newAdminAddresses, 2, newOperatorAddresses, 2);

            await expect(gateway.connect(admins[0]).setup(params)).not.to.emit(gateway, 'OperatorshipTransferred');

            const implementation = gatewayFactory.attach(await gateway.implementation());

            await expect(implementation.connect(admins[0]).setup(params)).to.be.revertedWith('NotProxy()');
        });

        it('should not allow calling the upgrade on the implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCode = await newGatewayImplementation.provider.getCode(newGatewayImplementation.address);
            const newGatewayImplementationCodeHash = keccak256(newGatewayImplementationCode);

            const newAdminAddresses = getAddresses(admins.slice(0, 2));
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getMultisigProxyDeployParams(newAdminAddresses, 2, newOperatorAddresses, 2);

            const implementation = gatewayFactory.attach(await gateway.implementation());

            await expect(
                implementation.connect(admins[0]).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params),
            ).to.be.revertedWith('NotAdmin()');
        });
    });

    describe('execute', () => {
        it('should fail if chain id mismatches', async () => {
            const data = buildCommandBatch(
                CHAIN_ID + 1,
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

            await expect(gateway.execute(input)).to.be.revertedWith('InvalidChainId()');
        });
    });

    describe('command deployToken', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const limit = 1000;

        it('should allow operators to deploy a new token', async () => {
            const commandID = getRandomID();

            const data = buildCommandBatch(
                CHAIN_ID,
                [commandID],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, limit)],
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

            const tx = await gateway.execute(input);

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

            const firstData = buildCommandBatch(
                CHAIN_ID,
                [firstCommandID],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, 0)],
            );

            const firstInput = await getSignedWeightedExecuteInput(
                firstData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await expect(gateway.execute(firstInput))
                .to.emit(gateway, 'TokenDeployed')
                .and.to.emit(gateway, 'Executed')
                .withArgs(firstCommandID);

            const secondCommandID = getRandomID();

            const secondData = buildCommandBatch(
                CHAIN_ID,
                [secondCommandID],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, 0)],
            );

            const secondInput = await getSignedWeightedExecuteInput(
                secondData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await expect(gateway.execute(secondInput))
                .to.not.emit(gateway, 'TokenDeployed')
                .and.to.emit(gateway, 'Executed')
                .withArgs(secondCommandID);
        });
    });

    describe('command mintToken', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 1e8;

        let token;

        beforeEach(async () => {
            const data = buildCommandBatch(
                CHAIN_ID,
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, 0)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await gateway.execute(input);

            const tokenAddress = await gateway.tokenAddresses(symbol);
            token = burnableMintableCappedERC20Factory.attach(tokenAddress);
        });

        it('should mint tokens', async () => {
            const amount = 9999;

            const firstMintData = buildCommandBatch(
                CHAIN_ID,
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, owner.address, amount)],
            );

            const firstMintInput = await getSignedWeightedExecuteInput(
                firstMintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            const tx = await gateway.execute(firstMintInput);
            await expect(tx).to.emit(gateway, 'Executed');

            const secondMintData = buildCommandBatch(
                CHAIN_ID,
                [getRandomID()],
                ['mintToken'],
                [getMintCommand(symbol, owner.address, amount)],
            );

            const secondMintInput = getSignedWeightedExecuteInput(
                secondMintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(secondMintInput)).to.emit(gateway, 'Executed');

            console.log('mintToken gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should not allow the operators to mint tokens exceeding the daily limit', () => {
            const limit = getRandomInt(cap / 2);

            return Promise.all(admins.slice(0, threshold).map((admin) => gateway.connect(admin).setTokenMintLimits([symbol], [limit])))
                .then(() => {
                    const data = buildCommandBatch(
                        CHAIN_ID,
                        [getRandomID()],
                        ['mintToken'],
                        [getMintCommand(symbol, owner.address, limit)],
                    );

                    return getSignedWeightedExecuteInput(
                        data,
                        operators,
                        getWeights(operators),
                        threshold,
                        operators.slice(0, threshold),
                    ).then((input) =>
                        expect(gateway.execute(input))
                            .to.emit(token, 'Transfer')
                            .withArgs(ADDRESS_ZERO, owner.address, limit)
                            .and.to.emit(gateway, 'Executed'),
                    );
                })
                .then(async () => {
                    const mintAmount = await gateway.tokenMintAmount(symbol);
                    expect(mintAmount.toNumber()).to.eq(limit);
                })
                .then(async () => {
                    const amount = 1;
                    const data = buildCommandBatch(
                        CHAIN_ID,
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

                    await expect(gateway.execute(input)).to.not.emit(gateway, 'Executed');
                    await tickBlockTime(gateway.provider, 6 * 60 * 60); // 6 hours later
                    await expect(gateway.execute(input))
                        .to.emit(token, 'Transfer')
                        .withArgs(ADDRESS_ZERO, owner.address, amount)
                        .and.to.emit(gateway, 'Executed');
                });
        });

        it('should allow the operators to mint tokens', async () => {
            const amount = getRandomInt(cap);

            const data = buildCommandBatch(CHAIN_ID, [getRandomID()], ['mintToken'], [getMintCommand(symbol, owner.address, amount)]);

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input))
                .to.emit(token, 'Transfer')
                .withArgs(ADDRESS_ZERO, owner.address, amount)
                .and.to.emit(gateway, 'Executed');

            expect(await token.balanceOf(owner.address).then(bigNumberToNumber)).to.eq(amount);
        });

        it('should not mint wrong symbols', async () => {
            const amount = getRandomInt(cap);

            const data = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(input)).not.to.emit(token, 'Transfer').and.not.to.emit(gateway, 'Executed');

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
        const amount = 100;

        let token;
        let externalToken;

        beforeEach(async () => {
            externalToken = await mintableCappedERC20Factory.deploy(externalName, externalSymbol, decimals, cap).then((d) => d.deployed());
            await externalToken.mint(owner.address, amount);

            const data = buildCommandBatch(
                CHAIN_ID,
                [getRandomID(), getRandomID(), getRandomID()],
                ['deployToken', 'deployToken', 'mintToken'],
                [
                    getDeployCommand(externalName, externalSymbol, decimals, cap, externalToken.address, 0),
                    getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, 0),
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
            await gateway.execute(input);

            const tokenAddress = await gateway.tokenAddresses(symbol);
            token = burnableMintableCappedERC20Factory.attach(tokenAddress);
        });

        it('should allow the operators to burn internal tokens', async () => {
            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(`${destinationBtcAddress}-${owner.address}-${Date.now()}`);
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

            const burnAmount = amount / 2;
            await token.transfer(depositHandlerAddress, burnAmount);

            const dataFirstBurn = buildCommandBatch(CHAIN_ID, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

            const firstInput = await getSignedWeightedExecuteInput(
                dataFirstBurn,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const tx = await gateway.execute(firstInput);

            await expect(tx).to.emit(token, 'Transfer').withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount);

            await token.transfer(depositHandlerAddress, burnAmount);

            const dataSecondBurn = buildCommandBatch(CHAIN_ID, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

            const secondInput = await getSignedWeightedExecuteInput(
                dataSecondBurn,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(await gateway.execute(secondInput))
                .to.emit(token, 'Transfer')
                .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount);

            expect(await token.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);

            console.log('burnToken internal gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should allow the operators to burn external tokens', async () => {
            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(`${destinationBtcAddress}-${owner.address}-${Date.now()}`);
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

            const burnAmount = amount / 2;
            await externalToken.transfer(depositHandlerAddress, burnAmount);

            const dataFirstBurn = buildCommandBatch(CHAIN_ID, [getRandomID()], ['burnToken'], [getBurnCommand(externalSymbol, salt)]);

            const firstInput = await getSignedWeightedExecuteInput(
                dataFirstBurn,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const tx = await gateway.execute(firstInput);

            await expect(tx).to.emit(externalToken, 'Transfer').withArgs(depositHandlerAddress, gateway.address, burnAmount);

            await externalToken.transfer(depositHandlerAddress, burnAmount);

            const dataSecondBurn = buildCommandBatch(CHAIN_ID, [getRandomID()], ['burnToken'], [getBurnCommand(externalSymbol, salt)]);

            const secondInput = await getSignedWeightedExecuteInput(
                dataSecondBurn,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(await gateway.execute(secondInput))
                .to.emit(externalToken, 'Transfer')
                .withArgs(depositHandlerAddress, gateway.address, burnAmount);

            expect(await externalToken.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);

            console.log('burnToken external gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should allow the operators to burn the external token multiple times from the same address', async () => {
            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(`${destinationBtcAddress}-${owner.address}-${Date.now()}`);
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));
            const commandIDs = [getRandomID(), getRandomID()];
            const burnAmount = amount / 2;

            await externalToken.transfer(depositHandlerAddress, burnAmount);
            const command = getBurnCommand(externalSymbol, salt);
            const input = await getSignedWeightedExecuteInput(
                buildCommandBatch(CHAIN_ID, commandIDs, ['burnToken', 'burnToken'], [command, command]),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const tx = await gateway.execute(input);
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
                .then(() => externalToken.transfer(depositHandlerAddress, burnAmount))
                .then(async () => {
                    const commandID = getRandomID();
                    const input = await getSignedWeightedExecuteInput(
                        buildCommandBatch(CHAIN_ID, [commandID], ['burnToken'], [getBurnCommand(externalSymbol, salt)]),
                        operators,
                        getWeights(operators),
                        threshold,
                        operators.slice(0, threshold),
                    );

                    const tx = await gateway.execute(input);
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
        it('should allow operators to transfer operatorship', async () => {
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const data = buildCommandBatch(
                CHAIN_ID,
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

            const tx = await gateway.execute(input);

            await expect(tx)
                .to.emit(gateway, 'OperatorshipTransferred')
                .withArgs(getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2));

            console.log('transferOperatorship gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should not allow transferring operatorship to address zero', async () => {
            const newOperators = [ADDRESS_ZERO, '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const data = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(input)).not.to.emit(gateway, 'OperatorshipTransferred');
        });

        it('should allow the previous operators to mint and burn token', async () => {
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const transferOperatorshipData = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(transferOperatorshipInput))
                .to.emit(gateway, 'OperatorshipTransferred')
                .withArgs(getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), 2));

            const name = 'An Awesome Token';
            const symbol = 'AAT';
            const decimals = 18;
            const cap = 1e8;

            const deployData = buildCommandBatch(
                CHAIN_ID,
                [getRandomID()],
                ['deployToken'],
                [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, 0)],
            );

            const deployAndMintInput = await getSignedWeightedExecuteInput(
                deployData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await expect(gateway.execute(deployAndMintInput)).to.emit(gateway, 'TokenDeployed');

            const tokenAddress = await gateway.tokenAddresses(symbol);
            const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

            const amount = getRandomInt(cap);

            const mintData = buildCommandBatch(CHAIN_ID, [getRandomID()], ['mintToken'], [getMintCommand(symbol, owner.address, amount)]);

            const mintInput = await getSignedWeightedExecuteInput(
                mintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(mintInput))
                .to.emit(token, 'Transfer')
                .withArgs(ADDRESS_ZERO, owner.address, amount)
                .and.to.emit(gateway, 'Executed');

            expect(await token.balanceOf(owner.address).then(bigNumberToNumber)).to.eq(amount);

            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(`${destinationBtcAddress}-${owner.address}-${Date.now()}`);
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

            const burnData = buildCommandBatch(CHAIN_ID, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

            await token.transfer(depositHandlerAddress, amount);
            const burnInput = await getSignedWeightedExecuteInput(
                burnData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(burnInput)).to.emit(token, 'Transfer').withArgs(depositHandlerAddress, ADDRESS_ZERO, amount);
        });

        it('should not allow the previous operators to transfer operatorship', async () => {
            let newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const buildTransferData = () =>
                buildCommandBatch(
                    CHAIN_ID,
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newOperators.length)],
                );

            let input = await getSignedWeightedExecuteInput(
                buildTransferData(),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await expect(gateway.execute(input)).to.emit(gateway, 'OperatorshipTransferred');

            newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

            input = await getSignedWeightedExecuteInput(
                buildTransferData(),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input)).not.to.emit(gateway, 'OperatorshipTransferred');
        });

        it('should not allow operatorship transfer to the previous operators', async () => {
            const updatedOperators = getAddresses(operators.slice(0, threshold));

            const buildTransferData = (newOperators, newThreshold = newOperators.length) =>
                buildCommandBatch(
                    CHAIN_ID,
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newThreshold)],
                );

            let input = await getSignedWeightedExecuteInput(
                buildTransferData(updatedOperators),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await expect(gateway.execute(input)).to.emit(gateway, 'OperatorshipTransferred');

            const oldOperators = getAddresses(operators);

            input = await getSignedWeightedExecuteInput(
                buildTransferData(oldOperators, threshold),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(input)).not.to.emit(gateway, 'OperatorshipTransferred');
        });

        it('should not allow multiple operatorship transfers in one batch', async () => {
            const updatedOperators = getAddresses(operators.slice(0, threshold));
            const commandIds = Array(3).fill(null).map(getRandomID);

            const buildTransferData = (newOperators, newThreshold = newOperators.length) =>
                buildCommandBatch(
                    CHAIN_ID,
                    commandIds,
                    commandIds.map(() => 'transferOperatorship'),
                    commandIds.map((x, i) =>
                        getTransferWeightedOperatorshipCommand(newOperators, getWeights(newOperators), newThreshold - i),
                    ),
                );

            const input = await getSignedWeightedExecuteInput(
                buildTransferData(updatedOperators),
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            const result = await gateway.execute(input);

            await expect((await result.wait()).events.filter(({ event }) => event === 'Executed').length).to.be.equal(1);
        });
    });

    describe('sendToken', () => {
        const tokenName = 'Test Token';
        const tokenSymbol = 'TEST';
        const decimals = 18;
        const cap = 1e9;

        it('should burn internal token and emit an event', async () => {
            const deployAndMintData = buildCommandBatch(
                CHAIN_ID,
                [getRandomID(), getRandomID()],
                ['deployToken', 'mintToken'],
                [getDeployCommand(tokenName, tokenSymbol, decimals, cap, ADDRESS_ZERO, 0), getMintCommand(tokenSymbol, owner.address, 1e6)],
            );

            const input = await getSignedWeightedExecuteInput(
                deployAndMintData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await gateway.execute(input);

            const tokenAddress = await gateway.tokenAddresses(tokenSymbol);
            const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

            const issuer = owner.address;
            const spender = gateway.address;
            const amount = 1000;
            const destination = operators[1].address;

            await expect(token.approve(spender, amount)).to.emit(token, 'Approval').withArgs(issuer, spender, amount);

            const tx = await gateway.sendToken('Polygon', destination, tokenSymbol, amount);

            await expect(tx)
                .to.emit(token, 'Transfer')
                .withArgs(issuer, ADDRESS_ZERO, amount)
                .to.emit(gateway, 'TokenSent')
                .withArgs(issuer, 'Polygon', destination, tokenSymbol, amount);

            console.log('sendToken internal gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should lock external token and emit an event', async () => {
            const token = await mintableCappedERC20Factory.deploy(tokenName, tokenSymbol, decimals, cap).then((d) => d.deployed());

            await token.mint(owner.address, 1000000);

            const deployData = buildCommandBatch(
                CHAIN_ID,
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
            await gateway.execute(input);

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
        it('should support external ERC20 token', async () => {
            const name = 'test';
            const symbol = 'test';
            const decimals = 16;
            const capacity = 0;

            const token = await mintableCappedERC20Factory.deploy(name, symbol, decimals, capacity).then((d) => d.deployed());

            const amount = 10000;

            await token.mint(owner.address, amount);

            const deployData = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(deployInput)).to.emit(gateway, 'TokenDeployed').withArgs(symbol, token.address);

            const salt = '0x2b3e73733ff31436169744c5808241dad2ff8921cf7e4cca6405a6e38d4f7b37';
            const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));
            await token.transfer(depositHandlerAddress, amount);

            const burnData = buildCommandBatch(CHAIN_ID, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

            const burnInput = await getSignedWeightedExecuteInput(
                burnData,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );

            await expect(gateway.execute(burnInput)).to.emit(token, 'Transfer').withArgs(depositHandlerAddress, gateway.address, amount);

            const mintData = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(mintInput)).to.emit(token, 'Transfer').withArgs(gateway.address, wallets[1].address, amount);
        });
    });

    describe('batch commands', () => {
        it('should batch execute multiple commands', async () => {
            const name = 'Bitcoin';
            const symbol = 'BTC';
            const decimals = 8;
            const cap = 2100000000;
            const amount1 = 10000;
            const amount2 = 20000;
            const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

            const data = buildCommandBatch(
                CHAIN_ID,
                [getRandomID(), getRandomID(), getRandomID(), getRandomID()],
                ['deployToken', 'mintToken', 'mintToken', 'transferOperatorship'],
                [
                    getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO, 0),
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

            await expect(gateway.execute(input)).to.emit(gateway, 'TokenDeployed').and.to.emit(gateway, 'OperatorshipTransferred');

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
        it('should burn internal token and emit an event', async () => {
            const chain = 'Polygon';
            const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
            const payload = defaultAbiCoder.encode(['address', 'address'], [wallets[1].address, wallets[2].address]);

            const tx = await gateway.connect(owner).callContract(chain, destination, payload);

            await expect(tx).to.emit(gateway, 'ContractCall').withArgs(owner.address, chain, destination, keccak256(payload), payload);

            console.log('callContract gas:', (await tx.wait()).gasUsed.toNumber());
        });
    });

    describe('callContractWithToken', () => {
        const tokenName = 'Test Token';
        const tokenSymbol = 'TEST';
        const decimals = 18;
        const cap = 1e9;

        it('should burn internal token and emit an event', async () => {
            const data = buildCommandBatch(
                CHAIN_ID,
                [getRandomID(), getRandomID()],
                ['deployToken', 'mintToken'],
                [getDeployCommand(tokenName, tokenSymbol, decimals, cap, ADDRESS_ZERO, 0), getMintCommand(tokenSymbol, owner.address, 1e6)],
            );

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                getWeights(operators),
                threshold,
                operators.slice(0, threshold),
            );
            await gateway.execute(input);

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
                .withArgs(issuer, ADDRESS_ZERO, amount)
                .to.emit(gateway, 'ContractCallWithToken')
                .withArgs(issuer, chain, destination, keccak256(payload), payload, tokenSymbol, amount);

            console.log('callContractWithToken internal gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should lock external token and emit an event', async () => {
            const token = await mintableCappedERC20Factory.deploy(tokenName, tokenSymbol, decimals, cap).then((d) => d.deployed());

            await token.mint(owner.address, 1000000);

            const data = buildCommandBatch(
                CHAIN_ID,
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

            await gateway.execute(input);

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
        it('should approve and validate contract call', async () => {
            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const commandId = getRandomID();
            const sourceChain = 'Polygon';
            const sourceAddress = 'address0x123';
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveData = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(approveInput))
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

            await gateway.connect(owner).validateContractCall(commandId, sourceChain, sourceAddress, payloadHash);

            const isApprovedAfter = await gateway.isContractCallApproved(commandId, sourceChain, sourceAddress, owner.address, payloadHash);

            expect(isApprovedAfter).to.be.false;
        });

        it('should approve and validate contract call with token', async () => {
            const nameA = 'testA';
            const symbolA = 'testA';
            const decimals = 16;
            const capacity = 0;

            const tokenA = await mintableCappedERC20Factory.deploy(nameA, symbolA, decimals, capacity).then((d) => d.deployed());

            await tokenA.mint(gateway.address, 1e6);

            const deployTokenData = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(deployTokenInput)).to.emit(gateway, 'TokenDeployed').withArgs(symbolA, tokenA.address);

            const payload = defaultAbiCoder.encode(['address'], [owner.address]);
            const payloadHash = keccak256(payload);
            const amount = 20000;
            const commandId = getRandomID();
            const sourceChain = 'Polygon';
            const sourceAddress = 'address0x123';
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveWithMintData = buildCommandBatch(
                CHAIN_ID,
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

            await expect(gateway.execute(approveWithMintInput))
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

            await gateway.connect(owner).validateContractCallAndMint(commandId, sourceChain, sourceAddress, payloadHash, symbolA, amount);

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
