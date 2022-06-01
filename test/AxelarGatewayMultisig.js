const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { id, keccak256, getCreate2Address, defaultAbiCoder },
} = ethers;
const { expect } = chai;

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;

const {
    bigNumberToNumber,
    getSignedMultisigExecuteInput,
    getRandomInt,
    getRandomID,
    getMultisigProxyDeployParams,
    getDeployCommand,
    getMintCommand,
    getBurnCommand,
    getTransferMultiOwnershipCommand,
    getTransferMultiOperatorshipCommand,
    buildCommandBatch,
    getAddresses,
} = require('./utils');

describe('AxelarGatewayMultisig', () => {
    const threshold = 3;

    let wallets;
    let owners;
    let operators;
    let admins;

    let gatewayFactory;
    let tokenDeployerFactory;
    let gatewayProxyFactory;
    let burnableMintableCappedERC20Factory;
    let depositHandlerFactory;
    let mintableCappedERC20Factory;

    let tokenDeployer;
    let gateway;

    before(async () => {
        wallets = await ethers.getSigners();
        admins = wallets.slice(0, 3);
        owners = wallets.slice(0, 6);
        operators = wallets.slice(6, 9);

        gatewayFactory = await ethers.getContractFactory('AxelarGatewayMultisig', wallets[0]);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', wallets[0]);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', wallets[0]);
        burnableMintableCappedERC20Factory = await ethers.getContractFactory('BurnableMintableCappedERC20', wallets[0]);
        depositHandlerFactory = await ethers.getContractFactory('DepositHandler', wallets[0]);
        mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', wallets[0]);
    });

    beforeEach(async () => {
        const adminAddresses = getAddresses(admins);
        const ownerAddresses = getAddresses(owners);
        const operatorAddresses = getAddresses(operators);

        const params = getMultisigProxyDeployParams(adminAddresses, threshold, ownerAddresses, threshold, operatorAddresses, threshold);

        tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
        const gatewayImplementation = await gatewayFactory.deploy(tokenDeployer.address).then((d) => d.deployed());
        const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());

        gateway = gatewayFactory.attach(proxy.address);
    });

    describe('owners', () => {
        it('should get the correct owners', async () => {
            expect(await gateway.owners(1)).to.deep.eq(getAddresses(owners));
        });
    });

    describe('operators', () => {
        it('should get the correct operators', async () => {
            expect(await gateway.operators(1)).to.deep.eq(getAddresses(operators));
        });
    });

    describe('admins', () => {
        it('should get the correct admins', async () => {
            expect(await gateway.admins(1)).to.deep.eq(getAddresses(admins));
        });
    });

    describe('upgrade', () => {
        it('should allow the admins to upgrade to the correct implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(tokenDeployer.address).then((d) => d.deployed());
            const newGatewayImplementationCode = await newGatewayImplementation.provider.getCode(newGatewayImplementation.address);
            const newGatewayImplementationCodeHash = keccak256(newGatewayImplementationCode);

            const newAdminAddresses = getAddresses(admins.slice(0, 2));
            const newOwnerAddresses = getAddresses(owners.slice(0, 2));
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getMultisigProxyDeployParams(newAdminAddresses, 2, newOwnerAddresses, 2, newOperatorAddresses, 2);

            for (let i = 0; i < threshold - 1; ++i) {
                await expect(
                    gateway.connect(admins[i]).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params),
                ).to.not.emit(gateway, 'Upgraded');
            }

            await expect(
                gateway.connect(admins[threshold - 1]).upgrade(newGatewayImplementation.address, newGatewayImplementationCodeHash, params),
            )
                .to.emit(gateway, 'Upgraded')
                .withArgs(newGatewayImplementation.address);
        });

        it('should not allow the admins to upgrade to a wrong implementation', async () => {
            const newGatewayImplementation = await gatewayFactory.deploy(tokenDeployer.address).then((d) => d.deployed());
            const wrongImplementationCodeHash = keccak256(`0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`);

            const newAdminAddresses = getAddresses(admins.slice(0, 2));
            const newOwnerAddresses = getAddresses(owners.slice(0, 2));
            const newOperatorAddresses = getAddresses(operators.slice(0, 2));

            const params = getMultisigProxyDeployParams(newAdminAddresses, 2, newOwnerAddresses, 2, newOperatorAddresses, 2);

            for (let i = 0; i < threshold - 1; ++i) {
                await expect(
                    gateway.connect(admins[i]).upgrade(newGatewayImplementation.address, wrongImplementationCodeHash, params),
                ).to.not.emit(gateway, 'Upgraded');
            }

            await expect(
                gateway.connect(admins[threshold - 1]).upgrade(newGatewayImplementation.address, wrongImplementationCodeHash, params),
            ).to.be.reverted;
        });
    });

    describe('execute', () => {
        it('should fail if chain id mismatches', async () => {
            const data = buildCommandBatch(
                CHAIN_ID + 1,
                ROLE_OWNER,
                [getRandomID()],
                ['transferOwnership'],
                [
                    getTransferMultiOperatorshipCommand(
                        ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'],
                        2,
                    ),
                ],
            );

            const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

            await expect(gateway.execute(input)).to.be.reverted;
        });

        describe('command deployToken', () => {
            const name = 'An Awesome Token';
            const symbol = 'AAT';
            const decimals = 18;
            const cap = 10000;

            it('should allow the owners to deploy a new token', async () => {
                const commandID = getRandomID();

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [commandID],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const { data: tokenInitCode } = burnableMintableCappedERC20Factory.getDeployTransaction(name, symbol, decimals, cap);
                const expectedTokenAddress = getCreate2Address(gateway.address, id(symbol), keccak256(tokenInitCode));

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));
                await expect(gateway.execute(input)).to.emit(gateway, 'TokenDeployed').and.to.emit(gateway, 'Executed').withArgs(commandID);

                const tokenAddress = await gateway.tokenAddresses(symbol);

                expect(tokenAddress).to.be.properAddress;
                expect(tokenAddress).to.eq(expectedTokenAddress);

                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const actualValues = await Promise.all([
                    token.name(),
                    token.symbol(),
                    token.decimals(),
                    token.cap().then(bigNumberToNumber),
                ]);

                expect(actualValues).to.deep.eq([name, symbol, decimals, cap]);
            });

            it('should not allow the operators to deploy a new token', async () => {
                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const input = await getSignedMultisigExecuteInput(data, operators.slice(0, threshold));
                await expect(gateway.execute(input)).to.not.emit(gateway, 'TokenDeployed');
            });

            it('should not deploy a duplicate token', async () => {
                const firstCommandID = getRandomID();

                const firstData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [firstCommandID],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const firstInput = await getSignedMultisigExecuteInput(firstData, owners.slice(0, threshold));
                await expect(gateway.execute(firstInput))
                    .to.emit(gateway, 'TokenDeployed')
                    .and.to.emit(gateway, 'Executed')
                    .withArgs(firstCommandID);

                const secondCommandID = getRandomID();

                const secondData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [secondCommandID],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const secondInput = await getSignedMultisigExecuteInput(secondData, owners.slice(0, threshold));
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
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners);
                await gateway.execute(input);

                const tokenAddress = await gateway.tokenAddresses(symbol);
                token = burnableMintableCappedERC20Factory.attach(tokenAddress);
            });

            it('should not mint tokens if the signer role is incorrect', async () => {
                const amount = 9999;

                const firstMintData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[0].address, amount)],
                );

                const firstMintInput = await getSignedMultisigExecuteInput(firstMintData, operators.slice(0, threshold));
                await expect(gateway.execute(firstMintInput)).to.not.emit(gateway, 'Executed');

                const secondMintData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OPERATOR,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[0].address, amount)],
                );

                const secondMintInput = getSignedMultisigExecuteInput(secondMintData, owners.slice(0, threshold));

                await expect(gateway.execute(secondMintInput)).to.not.emit(gateway, 'Executed');
            });

            it('should allow the owners to mint tokens', async () => {
                const amount = getRandomInt(cap);

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[0].address, amount)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

                await expect(gateway.execute(input))
                    .to.emit(token, 'Transfer')
                    .withArgs(ADDRESS_ZERO, wallets[0].address, amount)
                    .and.to.emit(gateway, 'Executed');

                expect(await token.balanceOf(wallets[0].address).then(bigNumberToNumber)).to.eq(amount);
            });

            it('should allow the operators to mint tokens', async () => {
                const amount = getRandomInt(cap);

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OPERATOR,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[0].address, amount)],
                );

                const input = await getSignedMultisigExecuteInput(data, operators.slice(0, threshold));

                await expect(gateway.execute(input))
                    .to.emit(token, 'Transfer')
                    .withArgs(ADDRESS_ZERO, wallets[0].address, amount)
                    .and.to.emit(gateway, 'Executed');

                expect(await token.balanceOf(wallets[0].address).then(bigNumberToNumber)).to.eq(amount);
            });
        });

        describe('command burnToken', () => {
            const name = 'An Awesome Token';
            const symbol = 'AAT';
            const decimals = 18;
            const cap = 1e8;
            const amount = 100;

            let token;

            beforeEach(async () => {
                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID(), getRandomID()],
                    ['deployToken', 'mintToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO), getMintCommand(symbol, wallets[0].address, amount)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));
                await gateway.execute(input);

                const tokenAddress = await gateway.tokenAddresses(symbol);
                token = burnableMintableCappedERC20Factory.attach(tokenAddress);
            });

            it('should allow the owners to burn tokens', async () => {
                const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
                const salt = id(`${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnAmount = amount / 2;
                await token.transfer(depositHandlerAddress, burnAmount);

                const dataFirstBurn = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(symbol, salt)],
                );

                const firstInput = await getSignedMultisigExecuteInput(dataFirstBurn, owners.slice(0, threshold));

                await expect(gateway.execute(firstInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount);

                await token.transfer(depositHandlerAddress, burnAmount);

                const dataSecondBurn = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(symbol, salt)],
                );

                const secondInput = await getSignedMultisigExecuteInput(dataSecondBurn, owners.slice(0, threshold));

                await expect(gateway.execute(secondInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount);

                expect(await token.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);
            });

            it('should allow the operators to burn tokens', async () => {
                const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
                const salt = id(`${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnAmount = amount / 2;
                await token.transfer(depositHandlerAddress, burnAmount);

                const dataFirstBurn = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OPERATOR,
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(symbol, salt)],
                );

                const firstInput = await getSignedMultisigExecuteInput(dataFirstBurn, operators.slice(0, threshold));

                await expect(gateway.execute(firstInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount);

                await token.transfer(depositHandlerAddress, burnAmount);

                const dataSecondBurn = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OPERATOR,
                    [getRandomID()],
                    ['burnToken'],
                    [getBurnCommand(symbol, salt)],
                );

                const secondInput = await getSignedMultisigExecuteInput(dataSecondBurn, operators.slice(0, threshold));

                await expect(gateway.execute(secondInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount);

                expect(await token.balanceOf(depositHandlerAddress).then(bigNumberToNumber)).to.eq(0);
            });
        });

        describe('command transferOwnership', () => {
            it('should allow the owners to transfer ownership to valid addresses', async () => {
                const newOwners = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOwnership'],
                    [getTransferMultiOwnershipCommand(newOwners, 2)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

                await expect(gateway.execute(input))
                    .to.emit(gateway, 'OwnershipTransferred')
                    .withArgs(getAddresses(owners), threshold, newOwners, 2);

                expect(await gateway.owners(2)).to.deep.eq(newOwners);
            });

            it('should not allow transferring ownership to address zero', async () => {
                const newOwners = [ADDRESS_ZERO, '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOwnership'],
                    [getTransferMultiOwnershipCommand(newOwners, 2)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

                await expect(gateway.execute(input)).to.not.emit(gateway, 'OwnershipTransferred');
            });

            it('should not allow the operators to transfer ownership', async () => {
                const newOwners = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOwnership'],
                    [getTransferMultiOwnershipCommand(newOwners, 2)],
                );

                const input = await getSignedMultisigExecuteInput(data, operators.slice(0, threshold));

                await expect(gateway.execute(input)).to.not.emit(gateway, 'OwnershipTransferred');
            });

            it('should allow the previous owners to deploy, mint, and burn token', async () => {
                const newOwners = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const transferOwnershipData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOwnership'],
                    [getTransferMultiOwnershipCommand(newOwners, 2)],
                );

                const transferOwnershipInput = await getSignedMultisigExecuteInput(transferOwnershipData, owners.slice(0, threshold));

                await expect(gateway.execute(transferOwnershipInput))
                    .to.emit(gateway, 'OwnershipTransferred')
                    .withArgs(getAddresses(owners), threshold, newOwners, 2);

                expect(await gateway.owners(2)).to.deep.eq(newOwners);

                const name = 'An Awesome Token';
                const symbol = 'AAT';
                const decimals = 18;
                const cap = 1e8;

                const deployData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const deployAndMintInput = await getSignedMultisigExecuteInput(deployData, owners.slice(0, threshold));
                await expect(gateway.execute(deployAndMintInput)).to.emit(gateway, 'TokenDeployed');

                const tokenAddress = await gateway.tokenAddresses(symbol);
                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const amount = getRandomInt(cap);

                const mintData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[0].address, amount)],
                );

                const mintInput = await getSignedMultisigExecuteInput(mintData, owners.slice(0, threshold));

                await expect(gateway.execute(mintInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(ADDRESS_ZERO, wallets[0].address, amount)
                    .and.to.emit(gateway, 'Executed');

                expect(await token.balanceOf(wallets[0].address).then(bigNumberToNumber)).to.eq(amount);

                const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
                const salt = id(`${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnData = buildCommandBatch(CHAIN_ID, ROLE_OWNER, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

                await token.transfer(depositHandlerAddress, amount);
                const burnInput = await getSignedMultisigExecuteInput(burnData, owners.slice(0, threshold));

                await expect(gateway.execute(burnInput)).to.emit(token, 'Transfer').withArgs(depositHandlerAddress, ADDRESS_ZERO, amount);
            });

            it('should not allow the previous owner to transfer ownership', async () => {
                const newOwners1 = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const firstData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOwnership'],
                    [getTransferMultiOwnershipCommand(newOwners1, 2)],
                );

                const firstInput = await getSignedMultisigExecuteInput(firstData, owners.slice(0, threshold));

                await expect(gateway.execute(firstInput))
                    .to.emit(gateway, 'OwnershipTransferred')
                    .withArgs(getAddresses(owners), threshold, newOwners1, 2);

                const newOwners2 = ['0x5b6d4017D4b1dCd36e6ea88b7900E8eC64a1D131', '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88'];

                const secondData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOwnership'],
                    [getTransferMultiOwnershipCommand(newOwners2, 2)],
                );

                const secondInput = await getSignedMultisigExecuteInput(secondData, owners.slice(0, threshold));

                await expect(gateway.execute(secondInput)).to.not.emit(gateway, 'OwnershipTransferred');
            });
        });

        describe('command transferOperatorship', () => {
            it('should owners to transfer operatorship', async () => {
                const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferMultiOperatorshipCommand(newOperators, 2)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

                await expect(gateway.execute(input))
                    .to.emit(gateway, 'OperatorshipTransferred')
                    .withArgs(getAddresses(operators), threshold, newOperators, 2);

                expect(await gateway.operators(2)).to.deep.eq(newOperators);
            });

            it('should allow the previous operators to mint and burn token', async () => {
                const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const transferOwnershipData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferMultiOperatorshipCommand(newOperators, 2)],
                );

                const transferOwnershipInput = await getSignedMultisigExecuteInput(transferOwnershipData, owners.slice(0, threshold));

                await expect(gateway.execute(transferOwnershipInput))
                    .to.emit(gateway, 'OperatorshipTransferred')
                    .withArgs(getAddresses(operators), threshold, newOperators, 2);

                expect(await gateway.operators(2)).to.deep.eq(newOperators);

                const name = 'An Awesome Token';
                const symbol = 'AAT';
                const decimals = 18;
                const cap = 1e8;

                const deployData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO)],
                );

                const deployAndMintInput = await getSignedMultisigExecuteInput(deployData, owners.slice(0, threshold));
                await expect(gateway.execute(deployAndMintInput)).to.emit(gateway, 'TokenDeployed');

                const tokenAddress = await gateway.tokenAddresses(symbol);
                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const amount = getRandomInt(cap);

                const mintData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OPERATOR,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[0].address, amount)],
                );

                const mintInput = await getSignedMultisigExecuteInput(mintData, operators.slice(0, threshold));

                await expect(gateway.execute(mintInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(ADDRESS_ZERO, wallets[0].address, amount)
                    .and.to.emit(gateway, 'Executed');

                expect(await token.balanceOf(wallets[0].address).then(bigNumberToNumber)).to.eq(amount);

                const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
                const salt = id(`${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`);
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

                const burnData = buildCommandBatch(CHAIN_ID, ROLE_OPERATOR, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

                await token.transfer(depositHandlerAddress, amount);
                const burnInput = await getSignedMultisigExecuteInput(burnData, operators.slice(0, threshold));

                await expect(gateway.execute(burnInput)).to.emit(token, 'Transfer').withArgs(depositHandlerAddress, ADDRESS_ZERO, amount);
            });

            it('should not allow the operators to transfer operatorship', async () => {
                const newOperators = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['transferOperatorship'],
                    [getTransferMultiOperatorshipCommand(newOperators, 2)],
                );

                const input = await getSignedMultisigExecuteInput(data, operators.slice(0, threshold));

                await expect(gateway.execute(input)).to.not.emit(gateway, 'OperatorshipTransferred');
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
                    ROLE_OWNER,
                    [getRandomID(), getRandomID()],
                    ['deployToken', 'mintToken'],
                    [
                        getDeployCommand(tokenName, tokenSymbol, decimals, cap, ADDRESS_ZERO),
                        getMintCommand(tokenSymbol, owners[0].address, 1e6),
                    ],
                );

                const input = await getSignedMultisigExecuteInput(deployAndMintData, owners.slice(0, threshold));
                await gateway.execute(input);

                const tokenAddress = await gateway.tokenAddresses(tokenSymbol);
                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const issuer = owners[0].address;
                const spender = gateway.address;
                const amount = 1000;
                const destination = operators[1].address.toString().replace('0x', '');

                await expect(token.approve(spender, amount)).to.emit(token, 'Approval').withArgs(issuer, spender, amount);

                await expect(gateway.sendToken('polygon', destination, tokenSymbol, amount))
                    .to.emit(token, 'Transfer')
                    .withArgs(issuer, ADDRESS_ZERO, amount)
                    .to.emit(gateway, 'TokenSent')
                    .withArgs(issuer, 'polygon', destination, tokenSymbol, amount);
            });

            it('should lock external token and emit an event', async () => {
                const token = await mintableCappedERC20Factory.deploy(tokenName, tokenSymbol, decimals, cap).then((d) => d.deployed());

                await token.mint(owners[0].address, 1000000);

                const deployData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(tokenName, tokenSymbol, decimals, cap, token.address)],
                );

                const input = await getSignedMultisigExecuteInput(deployData, owners.slice(0, threshold));
                await gateway.execute(input);

                const issuer = owners[0].address;
                const locker = gateway.address;
                const amount = 1000;
                const destination = operators[1].address.toString().replace('0x', '');

                await expect(token.approve(locker, amount)).to.emit(token, 'Approval').withArgs(issuer, locker, amount);

                await expect(gateway.sendToken('polygon', destination, tokenSymbol, amount))
                    .to.emit(token, 'Transfer')
                    .withArgs(issuer, locker, amount)
                    .to.emit(gateway, 'TokenSent')
                    .withArgs(issuer, 'polygon', destination, tokenSymbol, amount);
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

                await token.mint(wallets[0].address, amount);

                const deployData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(name, symbol, decimals, capacity, token.address)],
                );

                const deployInput = await getSignedMultisigExecuteInput(deployData, owners.slice(0, threshold));

                await expect(gateway.execute(deployInput)).to.emit(gateway, 'TokenDeployed').withArgs(symbol, token.address);

                const salt = '0x2b3e73733ff31436169744c5808241dad2ff8921cf7e4cca6405a6e38d4f7b37';
                const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));
                await token.transfer(depositHandlerAddress, amount);

                const burnData = buildCommandBatch(CHAIN_ID, ROLE_OWNER, [getRandomID()], ['burnToken'], [getBurnCommand(symbol, salt)]);

                const burnInput = await getSignedMultisigExecuteInput(burnData, owners.slice(0, threshold));

                await expect(gateway.execute(burnInput))
                    .to.emit(token, 'Transfer')
                    .withArgs(depositHandlerAddress, gateway.address, amount);

                const mintData = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['mintToken'],
                    [getMintCommand(symbol, wallets[1].address, amount)],
                );

                const mintInput = await getSignedMultisigExecuteInput(mintData, owners.slice(0, threshold));

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
                const newOwners = ['0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88', '0x6D4017D4b1DCd36e6EA88b7900e8eC64A1D1315b'];

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID(), getRandomID(), getRandomID(), getRandomID()],
                    ['deployToken', 'mintToken', 'mintToken', 'transferOwnership'],
                    [
                        getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO),
                        getMintCommand(symbol, wallets[0].address, amount1),
                        getMintCommand(symbol, wallets[1].address, amount2),
                        getTransferMultiOwnershipCommand(newOwners, 2),
                    ],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

                await expect(gateway.execute(input))
                    .to.emit(gateway, 'TokenDeployed')
                    .and.to.emit(gateway, 'OwnershipTransferred')
                    .withArgs(getAddresses(owners), threshold, newOwners, 2);

                expect(await gateway.owners(2)).to.deep.eq(newOwners);

                const tokenAddress = await gateway.tokenAddresses(symbol);

                expect(tokenAddress).to.be.properAddress;

                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const values = await Promise.all([
                    token.name(),
                    token.symbol(),
                    token.decimals(),
                    token.cap().then(bigNumberToNumber),
                    token.balanceOf(wallets[0].address).then(bigNumberToNumber),
                    token.balanceOf(wallets[1].address).then(bigNumberToNumber),
                ]);

                expect(values).to.deep.eq([name, symbol, decimals, cap, amount1, amount2]);
            });
        });

        describe('freeze and unfreeze', () => {
            const name = 'An Awesome Token';
            const symbol = 'AAT';
            const decimals = 18;
            const cap = 1e8;
            const amount = 10000;

            let token;

            describe('internal tokens', () => {
                beforeEach(async () => {
                    const data = buildCommandBatch(
                        CHAIN_ID,
                        ROLE_OWNER,
                        [getRandomID(), getRandomID()],
                        ['deployToken', 'mintToken'],
                        [getDeployCommand(name, symbol, decimals, cap, ADDRESS_ZERO), getMintCommand(symbol, wallets[0].address, amount)],
                    );

                    const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));
                    await gateway.execute(input);

                    const tokenAddress = await gateway.tokenAddresses(symbol);
                    token = burnableMintableCappedERC20Factory.attach(tokenAddress);
                });

                it('should freeze internal token transfers after passing threshold', async () => {
                    await expect(gateway.connect(admins[0]).freezeToken(symbol)).to.not.emit(gateway, 'TokenFrozen');
                    await expect(gateway.connect(admins[1]).freezeToken(symbol)).to.not.emit(gateway, 'TokenFrozen');
                    await expect(gateway.connect(admins[2]).freezeToken(symbol)).to.emit(gateway, 'TokenFrozen').withArgs(symbol);

                    await expect(token.transfer(wallets[1].address, 1)).to.be.revertedWith('IsFrozen()');

                    await expect(gateway.connect(admins[0]).unfreezeToken(symbol)).to.not.emit(gateway, 'TokenUnfrozen');
                    await expect(gateway.connect(admins[1]).unfreezeToken(symbol)).to.not.emit(gateway, 'TokenUnfrozen');
                    await expect(gateway.connect(admins[2]).unfreezeToken(symbol)).to.emit(gateway, 'TokenUnfrozen').withArgs(symbol);

                    await expect(token.transfer(wallets[1].address, amount))
                        .to.emit(token, 'Transfer')
                        .withArgs(wallets[0].address, wallets[1].address, amount);
                });

                it('should freeze all internal token transfers after passing threshold', async () => {
                    await expect(gateway.connect(admins[0]).freezeAllTokens()).to.not.emit(gateway, 'AllTokensFrozen');
                    await expect(gateway.connect(admins[1]).freezeAllTokens()).to.not.emit(gateway, 'AllTokensFrozen');
                    await expect(gateway.connect(admins[2]).freezeAllTokens()).to.emit(gateway, 'AllTokensFrozen').withArgs();

                    await expect(token.transfer(wallets[1].address, amount)).to.be.revertedWith('IsFrozen()');

                    await expect(gateway.connect(admins[0]).unfreezeAllTokens()).to.not.emit(gateway, 'AllTokensUnfrozen');
                    await expect(gateway.connect(admins[1]).unfreezeAllTokens()).to.not.emit(gateway, 'AllTokensUnfrozen');
                    await expect(gateway.connect(admins[2]).unfreezeAllTokens()).to.emit(gateway, 'AllTokensUnfrozen').withArgs();

                    await expect(token.transfer(wallets[1].address, amount))
                        .to.emit(token, 'Transfer')
                        .withArgs(wallets[0].address, wallets[1].address, amount);
                });
            });

            describe('external tokens', () => {
                beforeEach(async () => {
                    token = await mintableCappedERC20Factory.deploy(name, symbol, decimals, cap).then((d) => d.deployed());

                    const data = buildCommandBatch(
                        CHAIN_ID,
                        ROLE_OWNER,
                        [getRandomID()],
                        ['deployToken'],
                        [getDeployCommand(name, symbol, decimals, cap, token.address)],
                    );

                    const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));
                    await gateway.execute(input);

                    await token.mint(wallets[0].address, amount);
                });

                it('should freeze external token sends after passing threshold', async () => {
                    const destination = 'destination';

                    await expect(token.approve(gateway.address, amount))
                        .to.emit(token, 'Approval')
                        .withArgs(wallets[0].address, gateway.address, amount);

                    await expect(gateway.connect(admins[0]).freezeToken(symbol)).to.not.emit(gateway, 'TokenFrozen');
                    await expect(gateway.connect(admins[1]).freezeToken(symbol)).to.not.emit(gateway, 'TokenFrozen');
                    await expect(gateway.connect(admins[2]).freezeToken(symbol)).to.emit(gateway, 'TokenFrozen').withArgs(symbol);

                    await expect(gateway.sendToken('polygon', destination, symbol, amount)).to.be.revertedWith(
                        `TokenIsFrozen("${symbol}")`,
                    );

                    await expect(gateway.connect(admins[0]).unfreezeToken(symbol)).to.not.emit(gateway, 'TokenUnfrozen');
                    await expect(gateway.connect(admins[1]).unfreezeToken(symbol)).to.not.emit(gateway, 'TokenUnfrozen');
                    await expect(gateway.connect(admins[2]).unfreezeToken(symbol)).to.emit(gateway, 'TokenUnfrozen').withArgs(symbol);

                    await expect(gateway.sendToken('polygon', destination, symbol, amount))
                        .to.emit(token, 'Transfer')
                        .withArgs(wallets[0].address, gateway.address, amount)
                        .to.emit(gateway, 'TokenSent')
                        .withArgs(wallets[0].address, 'polygon', destination, symbol, amount);
                });

                it('should freeze all external token sends after passing threshold', async () => {
                    const destination = 'destination';

                    await expect(token.approve(gateway.address, amount))
                        .to.emit(token, 'Approval')
                        .withArgs(wallets[0].address, gateway.address, amount);

                    await expect(gateway.connect(admins[0]).freezeAllTokens()).to.not.emit(gateway, 'AllTokensFrozen');
                    await expect(gateway.connect(admins[1]).freezeAllTokens()).to.not.emit(gateway, 'AllTokensFrozen');
                    await expect(gateway.connect(admins[2]).freezeAllTokens()).to.emit(gateway, 'AllTokensFrozen').withArgs();

                    await expect(gateway.sendToken('polygon', destination, symbol, amount)).to.be.revertedWith(
                        `TokenIsFrozen("${symbol}")`,
                    );

                    await expect(gateway.connect(admins[0]).unfreezeAllTokens()).to.not.emit(gateway, 'AllTokensUnfrozen');
                    await expect(gateway.connect(admins[1]).unfreezeAllTokens()).to.not.emit(gateway, 'AllTokensUnfrozen');
                    await expect(gateway.connect(admins[2]).unfreezeAllTokens()).to.emit(gateway, 'AllTokensUnfrozen').withArgs();

                    await expect(gateway.sendToken('polygon', destination, symbol, amount))
                        .to.emit(token, 'Transfer')
                        .withArgs(wallets[0].address, gateway.address, amount)
                        .to.emit(gateway, 'TokenSent')
                        .withArgs(wallets[0].address, 'polygon', destination, symbol, amount);
                });
            });
        });

        describe('callContract', () => {
            it('should burn internal token and emit an event', async () => {
                const chain = 'polygon';
                const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
                const payload = defaultAbiCoder.encode(['address', 'address'], [wallets[1].address, wallets[2].address]);

                await expect(gateway.connect(wallets[0]).callContract(chain, destination, payload))
                    .to.emit(gateway, 'ContractCall')
                    .withArgs(wallets[0].address, chain, destination, keccak256(payload), payload);
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
                    ROLE_OWNER,
                    [getRandomID(), getRandomID()],
                    ['deployToken', 'mintToken'],
                    [
                        getDeployCommand(tokenName, tokenSymbol, decimals, cap, ADDRESS_ZERO),
                        getMintCommand(tokenSymbol, wallets[0].address, 1e6),
                    ],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));
                await gateway.execute(input);

                const tokenAddress = await gateway.tokenAddresses(tokenSymbol);
                const token = burnableMintableCappedERC20Factory.attach(tokenAddress);

                const issuer = wallets[0].address;
                const spender = gateway.address;
                const amount = 1000;
                const chain = 'polygon';
                const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
                const payload = defaultAbiCoder.encode(['address', 'address'], [wallets[0].address, destination]);

                await expect(token.approve(spender, amount)).to.emit(token, 'Approval').withArgs(issuer, spender, amount);

                await expect(gateway.callContractWithToken(chain, destination, payload, tokenSymbol, amount))
                    .to.emit(token, 'Transfer')
                    .withArgs(issuer, ADDRESS_ZERO, amount)
                    .to.emit(gateway, 'ContractCallWithToken')
                    .withArgs(issuer, chain, destination, keccak256(payload), payload, tokenSymbol, amount);
            });

            it('should lock external token and emit an event', async () => {
                const token = await mintableCappedERC20Factory.deploy(tokenName, tokenSymbol, decimals, cap).then((d) => d.deployed());

                await token.mint(wallets[0].address, 1000000);

                const data = buildCommandBatch(
                    CHAIN_ID,
                    ROLE_OWNER,
                    [getRandomID()],
                    ['deployToken'],
                    [getDeployCommand(tokenName, tokenSymbol, decimals, cap, token.address)],
                );

                const input = await getSignedMultisigExecuteInput(data, owners.slice(0, threshold));

                await gateway.execute(input);

                const issuer = wallets[0].address;
                const locker = gateway.address;
                const amount = 1000;
                const chain = 'polygon';
                const destination = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
                const payload = defaultAbiCoder.encode(['address', 'address'], [wallets[0].address, destination]);

                await expect(await token.approve(locker, amount))
                    .to.emit(token, 'Approval')
                    .withArgs(issuer, locker, amount);

                await expect(await gateway.callContractWithToken(chain, destination, payload, tokenSymbol, amount))
                    .to.emit(token, 'Transfer')
                    .withArgs(issuer, locker, amount)
                    .to.emit(gateway, 'ContractCallWithToken')
                    .withArgs(issuer, chain, destination, keccak256(payload), payload, tokenSymbol, amount);
            });
        });
    });
});
