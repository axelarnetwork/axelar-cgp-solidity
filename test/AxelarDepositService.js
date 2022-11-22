'use strict';

const chai = require('chai');
const {
    Contract,
    utils: { defaultAbiCoder, arrayify, solidityPack, formatBytes32String, keccak256, getCreate2Address },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const Auth = require('../artifacts/contracts/auth/AxelarAuthWeighted.sol/AxelarAuthWeighted.json');
const TokenDeployer = require('../artifacts/contracts/TokenDeployer.sol/TokenDeployer.json');
const AxelarGatewayProxy = require('../artifacts/contracts/AxelarGatewayProxy.sol/AxelarGatewayProxy.json');
const AxelarGateway = require('../artifacts/contracts/AxelarGateway.sol/AxelarGateway.json');
const TestWeth = require('../artifacts/contracts/test/TestWeth.sol/TestWeth.json');
const ConstAddressDeployer = require('axelar-utils-solidity/dist/ConstAddressDeployer.json');

const DepositReceiver = require('../artifacts/contracts/deposit-service/DepositReceiver.sol/DepositReceiver.json');
const ReceiverImplementation = require('../artifacts/contracts/deposit-service/ReceiverImplementation.sol/ReceiverImplementation.json');
const DepositService = require('../artifacts/contracts/deposit-service/AxelarDepositService.sol/AxelarDepositService.json');
const DepositServiceProxy = require('../artifacts/contracts/deposit-service/AxelarDepositServiceProxy.sol/AxelarDepositServiceProxy.json');

const { getWeightedAuthDeployParam, getSignedWeightedExecuteInput, getRandomID } = require('./utils');
const { deployUpgradable } = require('../scripts/upgradable');

describe('AxelarDepositService', () => {
    const [ownerWallet, operatorWallet, userWallet, adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6] =
        new MockProvider().getWallets();
    const adminWallets = [adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6];
    const threshold = 3;

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

    beforeEach(async () => {
        const params = arrayify(
            defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [adminWallets.map(get('address')), threshold, '0x']),
        );
        const constAddressDeployer = await deployContract(ownerWallet, ConstAddressDeployer);
        const auth = await deployContract(ownerWallet, Auth, [getWeightedAuthDeployParam([[operatorWallet.address]], [[1]], [1])]);
        const tokenDeployer = await deployContract(ownerWallet, TokenDeployer);
        const gatewayImplementation = await deployContract(ownerWallet, AxelarGateway, [auth.address, tokenDeployer.address]);
        const gatewayProxy = await deployContract(ownerWallet, AxelarGatewayProxy, [gatewayImplementation.address, params]);
        await auth.transferOwnership(gatewayProxy.address);
        gateway = new Contract(gatewayProxy.address, AxelarGateway.abi, ownerWallet);

        token = await deployContract(ownerWallet, TestWeth, [tokenName, tokenSymbol, decimals, capacity]);
        wrongToken = await deployContract(ownerWallet, TestWeth, [wrongTokenName, wrongTokenSymbol, decimals, capacity]);

        await token.deposit({ value: 1e9 });
        await wrongToken.deposit({ value: 1e9 });

        await gateway.execute(
            await getSignedWeightedExecuteInput(
                arrayify(
                    defaultAbiCoder.encode(
                        ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                        [
                            CHAIN_ID,
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
        );

        depositService = await deployUpgradable(constAddressDeployer.address, ownerWallet, DepositService, DepositServiceProxy, [
            gateway.address,
            tokenSymbol,
            ownerWallet.address,
        ]);

        receiverImplementation = new Contract(await depositService.receiverImplementation(), ReceiverImplementation.abi, ownerWallet);
    });

    describe('deposit service', () => {
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

            await token.transfer(depositAddress, amount);

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

            await token.transfer(depositAddress, amount);
            await wrongToken.transfer(depositAddress, amount * 2);

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
            await wrongToken.transfer(depositAddress, amount * 2);

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

            await token.transfer(depositAddress, amount);

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

            await token.transfer(depositAddress, amount);
            await wrongToken.transfer(depositAddress, amount * 2);

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
            const refundAddress = ADDRESS_ZERO;
            const recipient = userWallet.address;
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.addressForNativeUnwrap(salt, refundAddress, recipient);

            await token.transfer(depositAddress, amount);
            await wrongToken.transfer(depositAddress, amount * 2);

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

            await expect(depositService.connect(userWallet).refundLockedAsset(recipient, ADDRESS_ZERO, amount)).to.be.reverted;

            await expect(
                await depositService.connect(ownerWallet).refundLockedAsset(recipient, ADDRESS_ZERO, amount),
            ).to.changeEtherBalance(userWallet, amount);
        });
    });
});
