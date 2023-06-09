'use strict';

const chai = require('chai');
const { expect } = chai;
const { ethers } = require('hardhat');
const {
    Contract,
    utils: { defaultAbiCoder, arrayify, solidityPack, formatBytes32String, keccak256, getCreate2Address },
} = ethers;
const { get } = require('lodash/fp');
const { getChainId, getEVMVersion, getGasOptions } = require('./utils');

const DepositReceiver = require('../artifacts/contracts/deposit-service/DepositReceiver.sol/DepositReceiver.json');
const DepositService = require('../artifacts/contracts/deposit-service/AxelarDepositService.sol/AxelarDepositService.json');
const DepositServiceProxy = require('../artifacts/contracts/deposit-service/AxelarDepositServiceProxy.sol/AxelarDepositServiceProxy.json');

const { getWeightedAuthDeployParam, getSignedWeightedExecuteInput, getRandomID } = require('./utils');

describe('AxelarDepositService', () => {
    let ownerWallet, operatorWallet, userWallet, adminWallet1, adminWallet2;
    let adminWallets;
    const threshold = 2;

    let authFactory;
    let tokenDeployerFactory;
    let gatewayImplementationFactory;
    let gatewayProxyFactory;
    let tokenFactory;
    let receiverImplementationFactory;

    let auth;
    let tokenDeployer;
    let gatewayImplementation;
    let gatewayProxy;
    let gateway;
    let token;
    let wrongToken;
    let depositService;
    let receiverImplementation;

    const destinationChain = 'chain A';
    const tokenName = 'Wrapped Eth';
    const tokenSymbol = 'WETH';
    const wrongTokenName = 'Wrapped Eth';
    const wrongTokenSymbol = 'WETH';
    const decimals = 16;
    const capacity = 0;

    const getDepositAddress = (salt, functionData, refundAddress) =>
        getCreate2Address(
            depositService.address,
            salt,
            keccak256(
                solidityPack(
                    ['bytes', 'bytes'],
                    [DepositReceiver.bytecode, defaultAbiCoder.encode(['bytes', 'address'], [functionData, refundAddress])],
                ),
            ),
        );

    before(async () => {
        [adminWallet1, adminWallet2] = await ethers.getSigners();
        adminWallets = [adminWallet1, adminWallet2];
        operatorWallet = adminWallet2;
        ownerWallet = adminWallet1;
        userWallet = adminWallet2;

        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', ownerWallet);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', ownerWallet);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', ownerWallet);
        tokenFactory = await ethers.getContractFactory('TestWeth', ownerWallet);
        gatewayImplementationFactory = await ethers.getContractFactory('AxelarGateway', ownerWallet);
        receiverImplementationFactory = await ethers.getContractFactory('ReceiverImplementation', ownerWallet);

        tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
    });

    describe('deposit service', () => {
        beforeEach(async () => {
            const params = arrayify(
                defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [adminWallets.map(get('address')), threshold, '0x']),
            );

            auth = await authFactory.deploy(getWeightedAuthDeployParam([[operatorWallet.address]], [[1]], [1])).then((d) => d.deployed());
            gatewayImplementation = await gatewayImplementationFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
            gatewayProxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());
            await auth.transferOwnership(gatewayProxy.address).then((tx) => tx.wait());
            gateway = await gatewayImplementationFactory.attach(gatewayProxy.address);

            token = await tokenFactory.deploy(tokenName, tokenSymbol, decimals, capacity).then((d) => d.deployed());
            wrongToken = await tokenFactory.deploy(wrongTokenName, wrongTokenSymbol, decimals, capacity).then((d) => d.deployed());

            await token.deposit({ value: 1e9 }).then((tx) => tx.wait());
            await wrongToken.deposit({ value: 1e9 }).then((tx) => tx.wait());

            await gateway.execute(
                await getSignedWeightedExecuteInput(
                    arrayify(
                        defaultAbiCoder.encode(
                            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                            [
                                await getChainId(),
                                [getRandomID()],
                                ['deployToken'],
                                [
                                    defaultAbiCoder.encode(
                                        ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
                                        [tokenName, tokenSymbol, decimals, capacity, token.address, 0],
                                    ),
                                ],
                            ],
                        ),
                    ),
                    [operatorWallet],
                    [1],
                    1,
                    [operatorWallet],
                ),
                getGasOptions(),
            ).then((tx) => tx.wait());

            const depositServiceFactory = await ethers.getContractFactory(DepositService.abi, DepositService.bytecode, ownerWallet);
            const implementation = await depositServiceFactory.deploy(gateway.address, tokenSymbol, ownerWallet.address).then((d) => d.deployed());

            const depositServiceProxyFactory = await ethers.getContractFactory(DepositServiceProxy.abi, DepositServiceProxy.bytecode, ownerWallet);
            depositService = await depositServiceProxyFactory.deploy();
            await depositService.deployed();

            await depositService.init(implementation.address, ownerWallet.address, '0x').then((tx) => tx.wait());

            depositService = new Contract(depositService.address, DepositService.abi, ownerWallet);

            receiverImplementation = await receiverImplementationFactory.attach(await depositService.receiverImplementation());
        });

        it('should send native token', async () => {
            const destinationAddress = userWallet.address.toString();
            const amount = 1e6;

            const tx = await depositService.sendNative(destinationChain, destinationAddress, { value: amount });
            await expect(tx)
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositService.address, destinationChain, destinationAddress, tokenSymbol, amount);

            console.log('sendNative gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should handle and transfer ERC20 token', async () => {
            const refundAddress = ownerWallet.address;
            const destinationAddress = userWallet.address.toString();
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const expectedDepositAddress = getDepositAddress(
                salt,
                receiverImplementation.interface.encodeFunctionData('receiveAndSendToken', [
                    refundAddress,
                    destinationChain,
                    destinationAddress,
                    tokenSymbol,
                ]),
                refundAddress,
            );

            const depositAddress = await depositService.addressForTokenDeposit(
                salt,
                refundAddress,
                destinationChain,
                destinationAddress,
                tokenSymbol,
            );

            expect(depositAddress).to.be.equal(expectedDepositAddress);

            await token.transfer(depositAddress, amount).then((tx) => tx.wait());

            const tx = await depositService.sendTokenDeposit(salt, refundAddress, destinationChain, destinationAddress, tokenSymbol);
            await expect(tx)
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositAddress, destinationChain, destinationAddress, tokenSymbol, amount);

            console.log('sendTokenDeposit gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should refund from transfer token address', async () => {
            const refundAddress = ownerWallet.address;
            const destinationAddress = userWallet.address.toString();
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.addressForTokenDeposit(
                salt,
                refundAddress,
                destinationChain,
                destinationAddress,
                tokenSymbol,
            );

            await token.transfer(depositAddress, amount).then((tx) => tx.wait());
            await wrongToken.transfer(depositAddress, amount * 2).then((tx) => tx.wait());

            await expect(
                depositService
                    .connect(userWallet)
                    .refundTokenDeposit(salt, refundAddress, destinationChain, destinationAddress, tokenSymbol, [token.address]),
            ).not.to.emit(token, 'Transfer');

            await expect(
                depositService
                    .connect(ownerWallet)
                    .refundTokenDeposit(salt, refundAddress, destinationChain, destinationAddress, tokenSymbol, [token.address]),
            ).to.emit(token, 'Transfer');

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });

            await expect(
                await depositService.refundTokenDeposit(salt, refundAddress, destinationChain, destinationAddress, tokenSymbol, [
                    wrongToken.address,
                ]),
            )
                .to.emit(wrongToken, 'Transfer')
                .withArgs(depositAddress, refundAddress, amount * 2)
                .to.changeEtherBalance(ownerWallet, amount);
        });

        it('should wrap and transfer native currency', async () => {
            const refundAddress = ownerWallet.address;
            const destinationAddress = userWallet.address.toString();
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const expectedDepositAddress = getDepositAddress(
                salt,
                receiverImplementation.interface.encodeFunctionData('receiveAndSendNative', [
                    refundAddress,
                    destinationChain,
                    destinationAddress,
                ]),
                refundAddress,
            );

            const depositAddress = await depositService.addressForNativeDeposit(salt, refundAddress, destinationChain, destinationAddress);

            expect(depositAddress).to.be.equal(expectedDepositAddress);

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });

            const tx = await depositService.sendNativeDeposit(salt, refundAddress, destinationChain, destinationAddress);

            await expect(tx)
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositAddress, destinationChain, destinationAddress, tokenSymbol, amount);

            console.log('sendNativeDeposit gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should refund from transfer native address', async () => {
            const refundAddress = ownerWallet.address;
            const destinationAddress = userWallet.address.toString();
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.addressForNativeDeposit(salt, refundAddress, destinationChain, destinationAddress);

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });
            await wrongToken.transfer(depositAddress, amount * 2).then((tx) => tx.wait());

            await expect(
                depositService.refundNativeDeposit(salt, refundAddress, destinationChain, destinationAddress, [wrongToken.address]),
            )
                .to.emit(wrongToken, 'Transfer')
                .withArgs(depositAddress, refundAddress, amount * 2);
        });

        it('should unwrap native currency', async () => {
            const refundAddress = ownerWallet.address;
            const recipient = userWallet.address;
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const expectedDepositAddress = getDepositAddress(
                salt,
                receiverImplementation.interface.encodeFunctionData('receiveAndUnwrapNative', [refundAddress, recipient]),
                refundAddress,
            );

            const depositAddress = await depositService.addressForNativeUnwrap(salt, refundAddress, recipient);

            expect(depositAddress).to.be.equal(expectedDepositAddress);

            await token.transfer(depositAddress, amount).then((tx) => tx.wait());

            const tx = await depositService.nativeUnwrap(salt, refundAddress, recipient);

            await expect(tx).to.changeEtherBalance(userWallet, amount);

            console.log('nativeUnwrap gas:', (await tx.wait()).gasUsed.toNumber());
        });

        it('should refund from unwrap native address', async () => {
            const refundAddress = ownerWallet.address;
            const recipient = userWallet.address;
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.addressForNativeUnwrap(salt, refundAddress, recipient);

            await token.transfer(depositAddress, amount).then((tx) => tx.wait());
            await wrongToken.transfer(depositAddress, amount * 2).then((tx) => tx.wait());

            await expect(
                depositService.connect(userWallet).refundNativeUnwrap(salt, refundAddress, recipient, [token.address]),
            ).not.to.emit(token, 'Transfer');

            await expect(depositService.connect(ownerWallet).refundNativeUnwrap(salt, refundAddress, recipient, [token.address])).to.emit(
                token,
                'Transfer',
            );

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });

            await expect(await depositService.refundNativeUnwrap(salt, refundAddress, recipient, [wrongToken.address]))
                .to.emit(wrongToken, 'Transfer')
                .withArgs(depositAddress, refundAddress, amount * 2)
                .to.changeEtherBalance(ownerWallet, amount);
        });

        it('should refund to the service when refundAddress is 0x0', async () => {
            const refundAddress = ethers.constants.AddressZero;
            const recipient = userWallet.address;
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.addressForNativeUnwrap(salt, refundAddress, recipient);

            await token.transfer(depositAddress, amount).then((tx) => tx.wait());
            await wrongToken.transfer(depositAddress, amount * 2).then((tx) => tx.wait());

            await expect(
                depositService.connect(ownerWallet).refundNativeUnwrap(salt, refundAddress, recipient, [token.address]),
            ).not.to.emit(token, 'Transfer');

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });

            await expect(await depositService.refundNativeUnwrap(salt, refundAddress, recipient, [wrongToken.address]))
                .to.emit(wrongToken, 'Transfer')
                .withArgs(depositAddress, depositService.address, amount * 2)
                .to.changeEtherBalance(depositService, amount);

            await expect(depositService.connect(userWallet).refundLockedAsset(recipient, wrongToken.address, amount * 2)).to.be.reverted;

            await expect(depositService.connect(ownerWallet).refundLockedAsset(recipient, wrongToken.address, amount * 2))
                .to.emit(wrongToken, 'Transfer')
                .withArgs(depositService.address, recipient, amount * 2);

            await expect(depositService.connect(userWallet).refundLockedAsset(recipient, ethers.constants.AddressZero, amount)).to.be
                .reverted;

            await expect(
                await depositService.connect(ownerWallet).refundLockedAsset(recipient, ethers.constants.AddressZero, amount),
            ).to.changeEtherBalance(userWallet, amount);
        });

    });

    describe('deposit service bytecode check', () => {
        it('should have the same receiver bytecode preserved for each EVM', async () => {
            const expected = {
                istanbul: '0xc0fd88839756e97f51ab0395ce8e6164a5f924bd73a3342204340a14ad306fe1',
                berlin: '0xc0fd88839756e97f51ab0395ce8e6164a5f924bd73a3342204340a14ad306fe1',
                london: '0xc0fd88839756e97f51ab0395ce8e6164a5f924bd73a3342204340a14ad306fe1',
            }[getEVMVersion()];

            await expect(keccak256(DepositReceiver.bytecode)).to.be.equal(expected);
        });

        it('should have the same proxy bytecode preserved for each EVM', async () => {
            const proxyBytecode = DepositServiceProxy.bytecode;
            const proxyBytecodeHash = keccak256(proxyBytecode);

            const expected = {
                istanbul: '0x1eaf54a0dcc8ed839ba94f1ab33a4c9f63f6bf73959eb0cdd61627e699972aef',
                berlin: '0x1d1dc288313dec7af9b83310f782bd9f24ab02030e6c7f67f6f510ee07a6d75b',
                london: '0xdec34d6bd2779b58de66dc79f2d80353e8cebb178d9afac4225bc3f652360aaa',
            }[getEVMVersion()];

            expect(proxyBytecodeHash).to.be.equal(expected);
        });
    });
});
