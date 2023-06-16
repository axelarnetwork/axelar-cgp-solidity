'use strict';

const chai = require('chai');
const { ethers, config } = require('hardhat');
const {
    utils: { defaultAbiCoder, keccak256, parseEther, id },
    constants: { AddressZero, HashZero },
} = ethers;
const { expect } = chai;

const EVM_VERSION = config.solidity.compilers[0].settings.evmVersion;
const GasService = require('../../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');

const ConstAddressDeployer = require('@axelar-network/axelar-gmp-sdk-solidity/dist/ConstAddressDeployer.json');
const { deployUpgradable, upgradeUpgradable } = require('@axelar-network/axelar-gmp-sdk-solidity');

describe('AxelarGasService', () => {
    let constAddressDeployerFactory;
    let testTokenFactory;

    let constAddressDeployer;
    let gasService;
    let testToken;

    let ownerWallet;
    let userWallet;

    before(async () => {
        [ownerWallet, userWallet] = await ethers.getSigners();

        constAddressDeployerFactory = await ethers.getContractFactory(ConstAddressDeployer.abi, ConstAddressDeployer.bytecode, ownerWallet);
        testTokenFactory = await ethers.getContractFactory('MintableCappedERC20', ownerWallet);
    });

    beforeEach(async () => {
        constAddressDeployer = await constAddressDeployerFactory.deploy().then((d) => d.deployed());

        gasService = await deployUpgradable(constAddressDeployer.address, ownerWallet, GasService, GasServiceProxy, [ownerWallet.address]);

        const name = 'testToken';
        const symbol = 'testToken';
        const decimals = 16;
        const capacity = 0;

        testToken = await testTokenFactory.deploy(name, symbol, decimals, capacity).then((d) => d.deployed());

        await testToken.mint(userWallet.address, 1e9);
    });

    describe('gas receiver', () => {
        it('should emit events when receives gas payment', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const payloadHash = keccak256(payload);
            const symbol = 'USDC';
            const amount = 100000;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;
            const nativeGasFeeAmount = parseEther('1.0');

            await testToken.connect(userWallet).approve(gasService.address, 1e6);

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

            await expect(
                await gasService
                    .connect(userWallet)
                    .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                        value: nativeGasFeeAmount,
                    }),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCall')
                .withArgs(userWallet.address, destinationChain, destinationAddress, payloadHash, nativeGasFeeAmount, userWallet.address)
                .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

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
                )
                .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);

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
                )
                .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);
        });

        it('should revert when no ether is sent with native gas payment calls', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const symbol = 'USDC';
            const amount = 100000;

            await testToken.connect(userWallet).approve(gasService.address, 1e6);

            await expect(
                gasService
                    .connect(userWallet)
                    .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address),
            ).to.be.revertedWithCustomError(gasService, 'NothingReceived');

            await expect(
                gasService
                    .connect(userWallet)
                    .payNativeGasForContractCallWithToken(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        symbol,
                        amount,
                        userWallet.address,
                    ),
            ).to.be.revertedWithCustomError(gasService, 'NothingReceived');

            await expect(
                gasService
                    .connect(userWallet)
                    .payNativeGasForExpressCallWithToken(
                        userWallet.address,
                        destinationChain,
                        destinationAddress,
                        payload,
                        symbol,
                        amount,
                        userWallet.address,
                    ),
            ).to.be.revertedWithCustomError(gasService, 'NothingReceived');
        });

        it('should allow to collect accumulated payments and refund', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const symbol = 'USDC';
            const amount = 100000;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;
            const nativeGasFeeAmount = parseEther('1.0');

            await testToken.connect(userWallet).approve(gasService.address, 1e6);

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
                );

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
                );

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                });

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                });

            await expect(
                gasService
                    .connect(userWallet)
                    .functions['refund(address,address,uint256)'](userWallet.address, AddressZero, nativeGasFeeAmount),
            ).to.be.reverted;

            await expect(
                gasService
                    .connect(ownerWallet)
                    .functions['refund(address,address,uint256)'](userWallet.address, AddressZero, nativeGasFeeAmount),
            )
                .to.changeEtherBalance(userWallet, nativeGasFeeAmount)
                .and.to.emit(gasService, 'Refunded')
                .withArgs(HashZero, 0, userWallet.address, AddressZero, nativeGasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .functions['refund(address,address,uint256)'](userWallet.address, testToken.address, gasFeeAmount),
            ).to.be.reverted;

            await expect(
                gasService
                    .connect(ownerWallet)
                    .functions['refund(address,address,uint256)'](userWallet.address, testToken.address, gasFeeAmount),
            )
                .and.to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, userWallet.address, gasFeeAmount)
                .and.to.emit(gasService, 'Refunded')
                .withArgs(HashZero, 0, userWallet.address, testToken.address, gasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            ).to.be.reverted;

            await expect(
                gasService
                    .connect(ownerWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            )
                .to.changeEtherBalance(ownerWallet, nativeGasFeeAmount)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, ownerWallet.address, gasFeeAmount);
        });

        it('should allow to collect accumulated payments and refund with the new method', async () => {
            const destinationChain = 'ethereum';
            const destinationAddress = ownerWallet.address;
            const payload = defaultAbiCoder.encode(['address', 'address'], [ownerWallet.address, userWallet.address]);
            const symbol = 'USDC';
            const amount = 100000;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;
            const nativeGasFeeAmount = parseEther('1.0');

            await testToken.connect(userWallet).approve(gasService.address, 1e6);

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
                );

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
                );

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                });

            await gasService
                .connect(userWallet)
                .payNativeGasForContractCall(userWallet.address, destinationChain, destinationAddress, payload, userWallet.address, {
                    value: nativeGasFeeAmount,
                });

            const txHash = id('txHash');
            const logIndex = 256;

            await expect(
                gasService
                    .connect(userWallet)
                    .functions['refund(bytes32,uint256,address,address,uint256)'](
                        txHash,
                        logIndex,
                        userWallet.address,
                        AddressZero,
                        nativeGasFeeAmount,
                    ),
            ).to.be.reverted;

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
                .to.changeEtherBalance(userWallet, nativeGasFeeAmount)
                .and.to.emit(gasService, 'Refunded')
                .withArgs(txHash, logIndex, userWallet.address, AddressZero, nativeGasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .functions['refund(bytes32,uint256,address,address,uint256)'](
                        txHash,
                        logIndex,
                        userWallet.address,
                        testToken.address,
                        gasFeeAmount,
                    ),
            ).to.be.reverted;

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

            await expect(
                gasService
                    .connect(userWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            ).to.be.reverted;

            await expect(
                gasService
                    .connect(ownerWallet)
                    .collectFees(ownerWallet.address, [AddressZero, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            )
                .to.changeEtherBalance(ownerWallet, nativeGasFeeAmount)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, ownerWallet.address, gasFeeAmount);
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

            await expect(await gasService.owner()).to.be.equal(userWallet.address);
        });

        it('should emit events when gas is added', async () => {
            const txHash = keccak256(defaultAbiCoder.encode(['string'], ['random tx hash']));
            const logIndex = 13;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;
            const nativeGasFeeAmount = parseEther('1.0');

            await testToken.connect(userWallet).approve(gasService.address, 1e6);

            await expect(gasService.connect(userWallet).addGas(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address))
                .to.emit(gasService, 'GasAdded')
                .withArgs(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            await expect(
                await gasService.connect(userWallet).addNativeGas(txHash, logIndex, userWallet.address, { value: nativeGasFeeAmount }),
            )
                .to.emit(gasService, 'NativeGasAdded')
                .withArgs(txHash, logIndex, nativeGasFeeAmount, userWallet.address)
                .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);
        });

        it('should emit events when gas is added for express calls', async () => {
            const txHash = keccak256(defaultAbiCoder.encode(['string'], ['random tx hash']));
            const logIndex = 13;
            const gasToken = testToken.address;
            const gasFeeAmount = 1000;
            const nativeGasFeeAmount = parseEther('1.0');

            await testToken.connect(userWallet).approve(gasService.address, 1e6);

            await expect(gasService.connect(userWallet).addExpressGas(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address))
                .to.emit(gasService, 'ExpressGasAdded')
                .withArgs(txHash, logIndex, gasToken, gasFeeAmount, userWallet.address)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(userWallet.address, gasService.address, gasFeeAmount);

            await expect(
                await gasService
                    .connect(userWallet)
                    .addNativeExpressGas(txHash, logIndex, userWallet.address, { value: nativeGasFeeAmount }),
            )
                .to.emit(gasService, 'NativeExpressGasAdded')
                .withArgs(txHash, logIndex, nativeGasFeeAmount, userWallet.address)
                .and.to.changeEtherBalance(gasService, nativeGasFeeAmount);
        });

        it('should revert if no ether is sent with add native gas calls both normal and express', async () => {
            const txHash = keccak256(defaultAbiCoder.encode(['string'], ['random tx hash']));
            const logIndex = 13;

            await expect(
                gasService.connect(userWallet).addNativeGas(txHash, logIndex, userWallet.address, { gasLimit: 250000 }),
            ).to.be.revertedWithCustomError(gasService, 'NothingReceived');

            await expect(
                gasService.connect(userWallet).addNativeExpressGas(txHash, logIndex, userWallet.address, { gasLimit: 250000 }),
            ).to.be.revertedWithCustomError(gasService, 'NothingReceived');
        });

        it('should have the same proxy bytecode preserved for each EVM', async () => {
            const proxyBytecode = GasServiceProxy.bytecode;
            const proxyBytecodeHash = keccak256(proxyBytecode);
            const expected = {
                istanbul: '0x885390e8cdbd59403e862821e2cde97b65b8e0ff145ef131b7d1bb7b49ae575c',
                berlin: '0x102a9449688476eff53daa30db95211709f2b78555415593d9bf4a2deb2ee92c',
                london: '0x844ca3b3e4439c8473ba73c11d5c9b9bb69b6b528f8485a794797094724a4dbf',
            }[EVM_VERSION];

            expect(proxyBytecodeHash).to.be.equal(expected);
        });
    });
});
