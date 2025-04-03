'use strict';

const chai = require('chai');
const { ethers, network, config } = require('hardhat');
const {
    utils: { defaultAbiCoder, keccak256, parseUnits, id },
    constants: { AddressZero, HashZero },
} = ethers;
const { expect } = chai;
const { expectRevert } = require('../utils');
const EVM_VERSION = config.solidity.compilers[0].settings.evmVersion;
const GasService = require('../../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');
const { upgradeUpgradable } = require('@axelar-network/axelar-gmp-sdk-solidity');

describe('AxelarGasService', () => {
    let testTokenFactory;

    let gasService;
    let testToken;

    let ownerWallet;
    let userWallet;

    const nativeGasFeeAmount = parseUnits('1000', 'wei');

    before(async () => {
        [ownerWallet, userWallet] = await ethers.getSigners();

        testTokenFactory = await ethers.getContractFactory('MintableCappedERC20', ownerWallet);
    });

    before(async () => {
        const gasServiceFactory = await ethers.getContractFactory('AxelarGasService', ownerWallet);
        const implementation = await gasServiceFactory.deploy(ownerWallet.address);
        await implementation.deployTransaction.wait(network.config.confirmations);

        const gasServiceProxyFactory = await ethers.getContractFactory('AxelarGasServiceProxy', ownerWallet);
        gasService = await gasServiceProxyFactory.deploy();
        await gasService.deployTransaction.wait(network.config.confirmations);

        await gasService.init(implementation.address, ownerWallet.address, '0x').then((tx) => tx.wait());
        gasService = gasServiceFactory.attach(gasService.address);

        const name = 'testToken';
        const symbol = 'testToken';
        const decimals = 16;
        const capacity = 0;

        testToken = await testTokenFactory.deploy(name, symbol, decimals, capacity);
        await testToken.deployTransaction.wait(network.config.confirmations);

        await testToken.mint(userWallet.address, 1e9).then((tx) => tx.wait());
    });

    describe('AxelarGasService', () => {
        it('should emit events when receives gas payment', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const payloadHash = keccak256(payload);
            const symbol = 'USDC';
            const amount = 100000;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;

            await testToken
                .connect(userWallet)
                .approve(gasService.address, 1e6)
                .then((tx) => tx.wait());

            await expect(
                gasService
                    .connect(userWallet)
                    .payGasForContractCall(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        gasToken,
                        gasFeeAmount,
                        userWallet.address,
                    ),
            )
                .to.emit(gasService, 'GasPaidForContractCall')
                .withArgs(userWallet.address, destinationChain, destinationAddress, payloadHash, gasToken, gasFeeAmount, userWallet.address)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .payGasForContractCallWithToken(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        symbol,
                        amount,
                        gasToken,
                        gasFeeAmount,
                        userWallet.address,
                    ),
            )
                .to.emit(gasService, 'GasPaidForContractCallWithToken')
                .withArgs(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payloadHash,
                    symbol,
                    amount,
                    gasToken,
                    gasFeeAmount,
                    userWallet.address,
                )
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            ////
            const balanceBefore1 = await ethers.provider.getBalance(gasService.address);

            await expect(
                await gasService
                    .connect(userWallet)
                    .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                        value: nativeGasFeeAmount,
                    }),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCall')
                .withArgs(userWallet.address, destinationChain, destinationAddress, payloadHash, nativeGasFeeAmount, userWallet.address);
            // .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

            ////
            const balanceAfter1 = await ethers.provider.getBalance(gasService.address);
            expect(balanceAfter1.sub(balanceBefore1)).to.equal(nativeGasFeeAmount);

            ////
            const balanceBefore2 = await ethers.provider.getBalance(gasService.address);

            await expect(
                await gasService
                    .connect(userWallet)
                    .payNativeGasForContractCallWithToken(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        symbol,
                        amount,
                        userWallet.address,
                        { value: nativeGasFeeAmount },
                    ),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCallWithToken')
                .withArgs(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payloadHash,
                    symbol,
                    amount,
                    nativeGasFeeAmount,
                    userWallet.address,
                );
            // .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

            ////
            const balanceAfter2 = await ethers.provider.getBalance(gasService.address);
            expect(balanceAfter2.sub(balanceBefore2)).to.equal(nativeGasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .payGasForExpressCall(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        gasToken,
                        gasFeeAmount,
                        userWallet.address,
                    ),
            )
                .to.emit(gasService, 'GasPaidForExpressCall')
                .withArgs(userWallet.address, destinationChain, destinationAddress, payloadHash, gasToken, gasFeeAmount, userWallet.address)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .payGasForExpressCallWithToken(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        symbol,
                        amount,
                        gasToken,
                        gasFeeAmount,
                        userWallet.address,
                    ),
            )
                .to.emit(gasService, 'GasPaidForExpressCallWithToken')
                .withArgs(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payloadHash,
                    symbol,
                    amount,
                    gasToken,
                    gasFeeAmount,
                    userWallet.address,
                )
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            ////
            const balanceBefore3 = await ethers.provider.getBalance(gasService.address);

            await expect(
                await gasService
                    .connect(userWallet)
                    .payNativeGasForExpressCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                        value: nativeGasFeeAmount,
                    }),
            )
                .to.emit(gasService, 'NativeGasPaidForExpressCall')
                .withArgs(userWallet.address, destinationChain, destinationAddress, payloadHash, nativeGasFeeAmount, userWallet.address);
            // .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

            ////
            const balanceAfter3 = await ethers.provider.getBalance(gasService.address);
            expect(balanceAfter3.sub(balanceBefore3)).to.equal(nativeGasFeeAmount);

            ////
            const balanceBefore4 = await ethers.provider.getBalance(gasService.address);

            await expect(
                await gasService
                    .connect(userWallet)
                    .payNativeGasForExpressCallWithToken(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        symbol,
                        amount,
                        userWallet.address,
                        { value: nativeGasFeeAmount },
                    ),
            )
                .to.emit(gasService, 'NativeGasPaidForExpressCallWithToken')
                .withArgs(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payloadHash,
                    symbol,
                    amount,
                    nativeGasFeeAmount,
                    userWallet.address,
                );
            // .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);
            ////
            const balanceAfter4 = await ethers.provider.getBalance(gasService.address);
            expect(balanceAfter4.sub(balanceBefore4)).to.equal(nativeGasFeeAmount);
        });

        it('should allow to collect accumulated payments and refund', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const symbol = 'USDC';
            const amount = 100000;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;

            await testToken
                .connect(userWallet)
                .approve(gasService.address, 1e6)
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payGasForContractCall(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payload,
                    gasToken,
                    gasFeeAmount,
                    userWallet.address,
                )
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payGasForContractCallWithToken(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payload,
                    symbol,
                    amount,
                    gasToken,
                    gasFeeAmount,
                    userWallet.address,
                )
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                })
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                })
                .then((tx) => tx.wait());

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(userWallet)
                        .functions['refund(address,address,uint256)'](userWallet.address, AddressZero, nativeGasFeeAmount, gasOptions),
                gasService,
                'NotCollector',
            );

            ////
            const userBalanceBefore = await ethers.provider.getBalance(userWallet.address);

            await expect(
                gasService
                    .connect(ownerWallet)
                    .functions['refund(address,address,uint256)'](userWallet.address, AddressZero, nativeGasFeeAmount),
            )
                .to.emit(gasService, 'Refunded')
                .withArgs(HashZero, 0, userWallet.address, AddressZero, nativeGasFeeAmount);
            // .to.changeEtherBalance(userWallet, nativeGasFeeAmount)

            ////
            const userBalanceAfter = await ethers.provider.getBalance(userWallet.address);
            expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(nativeGasFeeAmount);

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(userWallet)
                        .functions['refund(address,address,uint256)'](userWallet.address, testToken.address, gasFeeAmount, gasOptions),
                gasService,
                'NotCollector',
            );

            await expect(
                gasService
                    .connect(ownerWallet)
                    .functions['refund(address,address,uint256)'](userWallet.address, testToken.address, gasFeeAmount),
            )
                .and.to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, userWallet.address, gasFeeAmount)
                .and.to.emit(gasService, 'Refunded')
                .withArgs(HashZero, 0, userWallet.address, testToken.address, gasFeeAmount);

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(userWallet)
                        .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount], gasOptions),
                gasService,
                'NotCollector',
            );

            ////
            const gasServiceNativeBefore = await ethers.provider.getBalance(gasService.address);
            const ownerTokenBalanceBefore = await testToken.balanceOf(ownerWallet.address);

            await expect(
                gasService
                    .connect(ownerWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            )
                .to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, ownerWallet.address, gasFeeAmount);
            // .to.changeEtherBalance(ownerWallet, nativeGasFeeAmount)

            ////
            const gasServiceNativeAfter = await ethers.provider.getBalance(gasService.address);
            const ownerTokenBalanceAfter = await testToken.balanceOf(ownerWallet.address);

            expect(ownerTokenBalanceAfter.sub(ownerTokenBalanceBefore)).to.equal(gasFeeAmount);
            expect(gasServiceNativeBefore.sub(gasServiceNativeAfter)).to.equal(nativeGasFeeAmount);
        });

        it('should allow to collect accumulated payments and refund with the new method', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const symbol = 'USDC';
            const amount = 100000;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;

            await testToken
                .connect(userWallet)
                .approve(gasService.address, 1e6)
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payGasForContractCall(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payload,
                    gasToken,
                    gasFeeAmount,
                    userWallet.address,
                )
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payGasForContractCallWithToken(
                    userWallet.address,
                    destinationChain,
                    destinationAddress,
                    payload,
                    symbol,
                    amount,
                    gasToken,
                    gasFeeAmount,
                    userWallet.address,
                )
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                })
                .then((tx) => tx.wait());

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                })
                .then((tx) => tx.wait());

            const txHash = id('txHash');
            const logIndex = 256;

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(userWallet)
                        .functions['refund(bytes32,uint256,address,address,uint256)'](
                            txHash,
                            logIndex,
                            userWallet.address,
                            AddressZero,
                            nativeGasFeeAmount,
                            gasOptions,
                        ),
                gasService,
                'NotCollector',
            );

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(ownerWallet)
                        .functions['refund(bytes32,uint256,address,address,uint256)'](
                            txHash,
                            logIndex,
                            AddressZero,
                            AddressZero,
                            nativeGasFeeAmount,
                            gasOptions,
                        ),
                gasService,
                'InvalidAddress',
            );

            ////
            const userBalanceBefore = await ethers.provider.getBalance(userWallet.address);

            await expect(
                gasService
                    .connect(ownerWallet)
                    .functions['refund(bytes32,uint256,address,address,uint256)'](
                        txHash,
                        logIndex,
                        userWallet.address,
                        AddressZero,
                        nativeGasFeeAmount,
                    ),
            )
                .to.emit(gasService, 'Refunded')
                .withArgs(txHash, logIndex, userWallet.address, AddressZero, nativeGasFeeAmount);
            // .to.changeEtherBalance(userWallet, nativeGasFeeAmount)

            ////
            const userBalanceAfter = await ethers.provider.getBalance(userWallet.address);
            expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(nativeGasFeeAmount);

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(userWallet)
                        .functions['refund(bytes32,uint256,address,address,uint256)'](
                            txHash,
                            logIndex,
                            userWallet.address,
                            testToken.address,
                            gasFeeAmount,
                            gasOptions,
                        ),
                gasService,
                'NotCollector',
            );

            await expect(
                gasService
                    .connect(ownerWallet)
                    .functions['refund(bytes32,uint256,address,address,uint256)'](
                        txHash,
                        logIndex,
                        userWallet.address,
                        testToken.address,
                        gasFeeAmount,
                    ),
            )
                .to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, userWallet.address, gasFeeAmount)
                .and.to.emit(gasService, 'Refunded')
                .withArgs(txHash, logIndex, userWallet.address, testToken.address, gasFeeAmount);

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(userWallet)
                        .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount], gasOptions),
                gasService,
                'NotCollector',
            );

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(ownerWallet)
                        .collectFees(AddressZero, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount], gasOptions),
                gasService,
                'InvalidAddress',
            );

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(ownerWallet)
                        .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount], gasOptions),
                gasService,
                'InvalidAmounts',
            );

            await expectRevert(
                (gasOptions) =>
                    gasService
                        .connect(ownerWallet)
                        .collectFees(ownerWallet.address, [AddressZero, testToken.address], [0, gasFeeAmount], gasOptions),
                gasService,
                'InvalidAmounts',
            );

            const balance = await testToken.balanceOf(gasService.address);

            ////
            const gasServiceBalanceBefore = await ethers.provider.getBalance(gasService.address);
            const ownerTokenBalanceBefore = await testToken.balanceOf(ownerWallet.address);

            await expect(
                gasService
                    .connect(ownerWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount + 1, balance + 1]),
            ).not.to.emit(testToken, 'Transfer');
            // .not.to.changeEtherBalance(ownerWallet, nativeGasFeeAmount)

            ////
            const gasServiceBalanceAfter = await ethers.provider.getBalance(gasService.address);
            const ownerTokenBalanceAfter = await testToken.balanceOf(ownerWallet.address);

            // Verify balances didn't change as expected
            expect(gasServiceBalanceAfter).to.equal(gasServiceBalanceBefore); // No ETH transferred
            expect(ownerTokenBalanceAfter).to.equal(ownerTokenBalanceBefore); // No tokens transferred

            ////
            const gasServiceNativeBefore = await ethers.provider.getBalance(gasService.address);
            const ownerTokenBalanceBefore2 = await testToken.balanceOf(ownerWallet.address);

            await expect(
                gasService
                    .connect(ownerWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            )
                .to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, ownerWallet.address, gasFeeAmount);
            // .to.changeEtherBalance(ownerWallet, nativeGasFeeAmount)

            ////
            const gasServiceNativeAfter = await ethers.provider.getBalance(gasService.address);
            const ownerTokenBalanceAfter2 = await testToken.balanceOf(ownerWallet.address);

            expect(ownerTokenBalanceAfter2.sub(ownerTokenBalanceBefore2)).to.equal(gasFeeAmount);
            expect(gasServiceNativeBefore.sub(gasServiceNativeAfter)).to.equal(nativeGasFeeAmount);
        });

        it('should upgrade the gas receiver implementation', async () => {
            const prevImpl = await gasService.implementation();
            await expect(upgradeUpgradable(gasService.address, ownerWallet, GasService, [ownerWallet.address])).to.emit(
                gasService,
                'Upgraded',
            );

            const newImpl = await gasService.implementation();
            expect(await gasService.owner()).to.be.equal(ownerWallet.address);
            expect(prevImpl).to.not.equal(newImpl);

            await expect(gasService.connect(ownerWallet).transferOwnership(userWallet.address))
                .and.to.emit(gasService, 'OwnershipTransferred')
                .withArgs(userWallet.address);

            expect(await gasService.owner()).to.be.equal(userWallet.address);
        });

        it('should emit events when gas is added', async () => {
            const txHash = keccak256(defaultAbiCoder.encode(['string'], ['random tx hash']));
            const logIndex = 13;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;

            await testToken
                .connect(userWallet)
                .approve(gasService.address, 1e6)
                .then((tx) => tx.wait());

            await expect(gasService.connect(userWallet).addGas(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address))
                .to.emit(gasService, 'GasAdded')
                .withArgs(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            ////
            const gasServiceBalanceBefore = await ethers.provider.getBalance(gasService.address);

            await expect(gasService.connect(userWallet).addNativeGas(txHash, logIndex, userWallet.address, { value: nativeGasFeeAmount }))
                .to.emit(gasService, 'NativeGasAdded')
                .withArgs(txHash, logIndex, nativeGasFeeAmount, userWallet.address);
            // .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

            ////
            const gasServiceBalanceAfter = await ethers.provider.getBalance(gasService.address);
            expect(gasServiceBalanceAfter.sub(gasServiceBalanceBefore)).to.equal(nativeGasFeeAmount);
        });

        it('should emit events when gas is added for express calls', async () => {
            const txHash = keccak256(defaultAbiCoder.encode(['string'], ['random tx hash']));
            const logIndex = 13;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;

            await testToken
                .connect(userWallet)
                .approve(gasService.address, 1e6)
                .then((tx) => tx.wait());

            await expect(gasService.connect(userWallet).addExpressGas(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address))
                .to.emit(gasService, 'ExpressGasAdded')
                .withArgs(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            ////
            const gasServiceBalanceBefore = await ethers.provider.getBalance(gasService.address);

            await expect(
                gasService.connect(userWallet).addNativeExpressGas(txHash, logIndex, userWallet.address, { value: nativeGasFeeAmount }),
            )
                .to.emit(gasService, 'NativeExpressGasAdded')
                .withArgs(txHash, logIndex, nativeGasFeeAmount, userWallet.address);
            // .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

            ////
            const gasServiceBalanceAfter = await ethers.provider.getBalance(gasService.address);
            expect(gasServiceBalanceAfter.sub(gasServiceBalanceBefore)).to.equal(nativeGasFeeAmount);
        });

        it('should preserve the bytecode [ @skip-on-coverage ]', async () => {
            const proxyBytecode = GasServiceProxy.bytecode;
            const proxyBytecodeHash = keccak256(proxyBytecode);
            const expected = {
                istanbul: '0x885390e8cdbd59403e862821e2cde97b65b8e0ff145ef131b7d1bb7b49ae575c',
                berlin: '0x102a9449688476eff53daa30db95211709f2b78555415593d9bf4a2deb2ee92c',
                london: '0x844ca3b3e4439c8473ba73c11d5c9b9bb69b6b528f8485a794797094724a4dbf',
            }[EVM_VERSION];

            expect(proxyBytecodeHash).to.be.equal(expected);
        });

        describe('Gas Estimation', () => {
            const chains = ['ethereum', 'optimism', 'arbitrum'];
            const gasUpdates = [
                {
                    gasEstimationType: 0,
                    l1FeeScalar: 0,
                    axelarBaseFee: 90000000000,
                    relativeGasPrice: 50000000000,
                    relativeBlobBaseFee: 1,
                    expressFee: 190000000000,
                },
                {
                    gasEstimationType: 1,
                    l1FeeScalar: 1500,
                    axelarBaseFee: 90000,
                    relativeGasPrice: 5000,
                    relativeBlobBaseFee: 0,
                    expressFee: 190000,
                },
                {
                    gasEstimationType: 3,
                    l1FeeScalar: 0,
                    axelarBaseFee: 90000,
                    relativeGasPrice: 5000,
                    relativeBlobBaseFee: 0,
                    expressFee: 190000,
                },
            ];

            it('should allow the collector to update gas info', async () => {
                await expectRevert(
                    (gasOptions) => gasService.connect(userWallet).updateGasInfo(chains, gasUpdates, gasOptions),
                    gasService,
                    'NotCollector',
                );

                await expectRevert(
                    (gasOptions) => gasService.connect(ownerWallet).updateGasInfo(chains, gasUpdates.slice(0, 2), gasOptions),
                    gasService,
                    'InvalidGasUpdates',
                );

                await expect(gasService.connect(ownerWallet).updateGasInfo(chains, gasUpdates))
                    .to.emit(gasService, 'GasInfoUpdated')
                    .withArgs(chains[0], Object.values(gasUpdates[0]));

                for (let i = 0; i < chains.length; i++) {
                    const chain = chains[i];
                    const gasInfo = gasUpdates[i];

                    let result = await gasService.getGasInfo(chain);
                    result = Array.from(result).map((x) => (x.toNumber ? x.toNumber().toString() : x));
                    expect(result).to.be.deep.equal(Object.values(gasInfo));
                }
            });

            it('should allow paying gas without on-chain gas estimation using payGas', async () => {
                const destinationChain = 'optimism';
                const destinationAddress = ownerWallet.address;
                const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
                const executionGasLimit = 1000000;
                const estimateOnChain = false;
                const refundAddress = userWallet.address;
                const params = '0x';
                const gasEstimate = 100;

                await expect(
                    gasService
                        .connect(userWallet)
                        .payGas(
                            userWallet.address,
                            destinationChain,
                            destinationAddress,
                            payload,
                            executionGasLimit,
                            estimateOnChain,
                            refundAddress,
                            params,
                            { value: gasEstimate },
                        ),
                )
                    .to.emit(gasService, 'NativeGasPaidForContractCall')
                    .withArgs(userWallet.address, destinationChain, destinationAddress, keccak256(payload), gasEstimate, refundAddress);
            });

            it('should allow paying gas with on-chain estimation', async () => {
                const destinationChain = 'optimism';
                const destinationAddress = ownerWallet.address;
                const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
                const executionGasLimit = 1000000;
                const estimateOnChain = true;
                const refundAddress = userWallet.address;
                const params = '0x';

                // Set up the gas info for the destination chain
                await gasService.connect(ownerWallet).updateGasInfo(chains, gasUpdates);

                // Estimate the gas fee
                const gasEstimate = await gasService.estimateGasFee(
                    destinationChain,
                    destinationAddress,
                    payload,
                    executionGasLimit,
                    params,
                );

                expect(gasEstimate).to.be.equal(374600090277);

                await expectRevert(
                    (gasOptions) =>
                        gasService
                            .connect(userWallet)
                            .payGas(
                                userWallet.address,
                                destinationChain,
                                destinationAddress,
                                payload,
                                executionGasLimit,
                                estimateOnChain,
                                refundAddress,
                                params,
                                { ...gasOptions, value: gasEstimate - 1 },
                            ),
                    gasService,
                    'InsufficientGasPayment',
                );

                await expectRevert(
                    (gasOptions) =>
                        gasService
                            .connect(userWallet)
                            .payGas(
                                userWallet.address,
                                destinationChain,
                                destinationAddress,
                                payload,
                                executionGasLimit,
                                estimateOnChain,
                                refundAddress,
                                '0x11',
                                { ...gasOptions, value: gasEstimate },
                            ),
                    gasService,
                    'InvalidParams',
                );

                await expect(
                    gasService
                        .connect(userWallet)
                        .payGas(
                            userWallet.address,
                            destinationChain,
                            destinationAddress,
                            payload,
                            executionGasLimit,
                            estimateOnChain,
                            refundAddress,
                            params,
                            { value: gasEstimate },
                        ),
                )
                    .to.emit(gasService, 'NativeGasPaidForContractCall')
                    .withArgs(userWallet.address, destinationChain, destinationAddress, keccak256(payload), gasEstimate, refundAddress);
            });
        });
    });
});
