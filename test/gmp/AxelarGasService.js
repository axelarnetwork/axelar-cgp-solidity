'use strict';

const chai = require('chai');
const {
    utils: { defaultAbiCoder, keccak256, parseEther },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const MintableCappedERC20 = require('../../artifacts/contracts/MintableCappedERC20.sol/MintableCappedERC20.json');
const GasService = require('../../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');

const ConstAddressDeployer = require('axelar-utils-solidity/dist/ConstAddressDeployer.json');
const { deployUpgradable, upgradeUpgradable } = require('../../scripts/upgradable');

describe('AxelarGasService', () => {
    const [ownerWallet, userWallet] = new MockProvider().getWallets();

    let gasService;
    let testToken;

    beforeEach(async () => {
        const constAddressDeployer = await deployContract(ownerWallet, ConstAddressDeployer);

        gasService = await deployUpgradable(constAddressDeployer.address, ownerWallet, GasService, GasServiceProxy, [ownerWallet.address]);

        const name = 'testToken';
        const symbol = 'testToken';
        const decimals = 16;
        const capacity = 0;

        testToken = await deployContract(ownerWallet, MintableCappedERC20, [name, symbol, decimals, capacity]);

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

            await expect(gasService.connect(userWallet).refund(userWallet.address, ADDRESS_ZERO, nativeGasFeeAmount)).to.be.reverted;

            await expect(
                await gasService.connect(ownerWallet).refund(userWallet.address, ADDRESS_ZERO, nativeGasFeeAmount),
            ).to.changeEtherBalance(userWallet, nativeGasFeeAmount);

            await expect(gasService.connect(userWallet).refund(userWallet.address, testToken.address, gasFeeAmount)).to.be.reverted;

            await expect(await gasService.connect(ownerWallet).refund(userWallet.address, testToken.address, gasFeeAmount))
                .and.to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, userWallet.address, gasFeeAmount);

            await expect(
                gasService
                    .connect(userWallet)
                    .collectFees(ownerWallet.address, [ADDRESS_ZERO, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            ).to.be.reverted;

            await expect(
                await gasService
                    .connect(ownerWallet)
                    .collectFees(ownerWallet.address, [ADDRESS_ZERO, testToken.address], [nativeGasFeeAmount, gasFeeAmount]),
            )
                .to.changeEtherBalance(ownerWallet, nativeGasFeeAmount)
                .and.to.emit(testToken, 'Transfer')
                .withArgs(gasService.address, ownerWallet.address, gasFeeAmount);
        });

        it('should upgrade the gas receiver implementation', async () => {
            const prevImpl = await gasService.implementation();
            await expect(upgradeUpgradable(ownerWallet, gasService.address, GasService, [ownerWallet.address])).to.emit(
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
    });
});
