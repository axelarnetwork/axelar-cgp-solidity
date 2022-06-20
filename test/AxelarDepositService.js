'use strict';

const chai = require('chai');
const {
    Contract,
    utils: { defaultAbiCoder, arrayify, formatBytes32String, keccak256, getCreate2Address, toUtf8Bytes },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;
const ROLE_OWNER = 1;

const Auth = require('../artifacts/contracts/AxelarAuthMultisig.sol/AxelarAuthMultisig.json');
const TokenDeployer = require('../artifacts/contracts/TokenDeployer.sol/TokenDeployer.json');
const AxelarGatewayProxy = require('../artifacts/contracts/AxelarGatewayProxy.sol/AxelarGatewayProxy.json');
const AxelarGateway = require('../artifacts/contracts/AxelarGateway.sol/AxelarGateway.json');
const TestWeth = require('../artifacts/contracts/test/TestWeth.sol/TestWeth.json');
const DepositService = require('../artifacts/contracts/deposit-service/AxelarDepositService.sol/AxelarDepositService.json');
const DepositServiceProxy = require('../artifacts/contracts/deposit-service/AxelarDepositServiceProxy.sol/AxelarDepositServiceProxy.json');
const ConstAddressDeployer = require('axelar-utils-solidity/dist/ConstAddressDeployer.json');

const { deployAndInitContractConstant } = require('axelar-utils-solidity');
const DepositReceiver = require('../artifacts/contracts/deposit-service/DepositReceiver.sol/DepositReceiver.json');

const { getAuthDeployParam, getSignedMultisigExecuteInput, getRandomID } = require('./utils');

describe('AxelarDepositService', () => {
    const [ownerWallet, operatorWallet, userWallet, adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6] =
        new MockProvider().getWallets();
    const adminWallets = [adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6];
    const threshold = 3;

    let gateway;
    let token;
    let depositService;

    const destinationChain = 'chain A';
    const tokenName = 'Wrapped Eth';
    const tokenSymbol = 'WETH';
    const decimals = 16;
    const capacity = 0;

    beforeEach(async () => {
        const params = arrayify(
            defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [adminWallets.map(get('address')), threshold, '0x']),
        );
        const constAddressDeployer = await deployContract(ownerWallet, ConstAddressDeployer);
        const auth = await deployContract(ownerWallet, Auth, [getAuthDeployParam([[operatorWallet.address]], [1])]);
        const tokenDeployer = await deployContract(ownerWallet, TokenDeployer);
        const gatewayImplementation = await deployContract(ownerWallet, AxelarGateway, [auth.address, tokenDeployer.address]);
        const gatewayProxy = await deployContract(ownerWallet, AxelarGatewayProxy, [gatewayImplementation.address, params]);
        await auth.transferOwnership(gatewayProxy.address);
        gateway = new Contract(gatewayProxy.address, AxelarGateway.abi, ownerWallet);

        token = await deployContract(ownerWallet, TestWeth, [tokenName, tokenSymbol, decimals, capacity]);

        await token.connect(ownerWallet).deposit({ value: 1e9 });

        await gateway.execute(
            await getSignedMultisigExecuteInput(
                arrayify(
                    defaultAbiCoder.encode(
                        ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                        [
                            CHAIN_ID,
                            ROLE_OWNER,
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
                [operatorWallet],
            ),
        );

        const depositImplementation = await deployContract(ownerWallet, DepositService);
        const setupParams = arrayify(
            defaultAbiCoder.encode(['address', 'address', 'string'], [ownerWallet.address, gateway.address, tokenSymbol]),
        );

        const depositProxy = await deployAndInitContractConstant(
            constAddressDeployer.address,
            ownerWallet,
            DepositServiceProxy,
            'deposit-service',
            [],
            [depositImplementation.address, setupParams],
        );
        depositService = new Contract(depositProxy.address, DepositService.abi, ownerWallet);
    });

    describe('deposit service', () => {
        it('should handle and send ERC20 token', async () => {
            const destinationAddress = userWallet.address.toString();
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const expectedDepositAddress = getCreate2Address(
                depositService.address,
                keccak256(
                    defaultAbiCoder.encode(
                        ['bytes32', 'bytes32', 'string', 'string', 'string'],
                        [keccak256(toUtf8Bytes('deposit-send-token')), salt, destinationChain, destinationAddress, tokenSymbol],
                    ),
                ),
                keccak256(DepositReceiver.bytecode),
            );

            const depositAddress = await depositService.depositAddressForSendToken(salt, destinationChain, destinationAddress, tokenSymbol);

            expect(depositAddress).to.be.equal(expectedDepositAddress);

            await token.connect(ownerWallet).transfer(depositAddress, amount);

            await expect(depositService.sendToken(salt, destinationChain, destinationAddress, tokenSymbol))
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositAddress, destinationChain, destinationAddress, tokenSymbol, amount);
        });

        it('should wrap and send native currency', async () => {
            const destinationAddress = userWallet.address.toString();
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const expectedDepositAddress = getCreate2Address(
                depositService.address,
                keccak256(
                    defaultAbiCoder.encode(
                        ['bytes32', 'bytes32', 'string', 'string'],
                        [keccak256(toUtf8Bytes('deposit-send-native')), salt, destinationChain, destinationAddress],
                    ),
                ),
                keccak256(DepositReceiver.bytecode),
            );

            const depositAddress = await depositService.depositAddressForSendNative(salt, destinationChain, destinationAddress);

            expect(depositAddress).to.be.equal(expectedDepositAddress);

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });

            await expect(await depositService.sendNative(salt, destinationChain, destinationAddress))
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositAddress, destinationChain, destinationAddress, tokenSymbol, amount);
        });

        it('should unwrap native currency', async () => {
            const recipient = userWallet.address;
            const salt = formatBytes32String(1);
            const amount = 1e6;

            const expectedDepositAddress = getCreate2Address(
                depositService.address,
                keccak256(
                    defaultAbiCoder.encode(
                        ['bytes32', 'bytes32', 'address'],
                        [keccak256(toUtf8Bytes('deposit-withdraw-native')), salt, recipient],
                    ),
                ),
                keccak256(DepositReceiver.bytecode),
            );

            const depositAddress = await depositService.depositAddressForWithdrawNative(salt, recipient);

            expect(depositAddress).to.be.equal(expectedDepositAddress);

            await token.connect(ownerWallet).transfer(depositAddress, amount);

            await expect(await depositService.withdrawNative(salt, recipient)).to.changeEtherBalance(userWallet, amount);
        });
    });
});
