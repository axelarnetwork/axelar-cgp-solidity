'use strict';

const chai = require('chai');
const {
    Contract,
    utils: { defaultAbiCoder, arrayify, formatBytes32String },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;
const ROLE_OWNER = 1;

const TokenDeployer = require('../artifacts/contracts/TokenDeployer.sol/TokenDeployer.json');
const AxelarGatewayProxy = require('../artifacts/contracts/AxelarGatewayProxy.sol/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../artifacts/contracts/AxelarGatewaySinglesig.sol/AxelarGatewaySinglesig.json');
const TestWeth = require('../artifacts/contracts/test/TestWeth.sol/TestWeth.json');
const DepositService = require('../artifacts/contracts/deposit-service/AxelarDepositService.sol/AxelarDepositService.json');
const DepositServiceProxy = require('../artifacts/contracts/deposit-service/AxelarDepositServiceProxy.sol/AxelarDepositServiceProxy.json');

const { getSignedExecuteInput, getRandomID } = require('./utils');

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
            defaultAbiCoder.encode(
                ['address[]', 'uint8', 'address', 'address'],
                [adminWallets.map(get('address')), threshold, ownerWallet.address, operatorWallet.address],
            ),
        );
        const tokenDeployer = await deployContract(ownerWallet, TokenDeployer);
        const gatewayImplementation = await deployContract(ownerWallet, AxelarGatewaySinglesig, [tokenDeployer.address]);
        const gatewayProxy = await deployContract(ownerWallet, AxelarGatewayProxy, [gatewayImplementation.address, params]);
        gateway = new Contract(gatewayProxy.address, AxelarGatewaySinglesig.abi, ownerWallet);

        token = await deployContract(ownerWallet, TestWeth, [tokenName, tokenSymbol, decimals, capacity]);

        await token.connect(ownerWallet).deposit({ value: 1e9 });

        await gateway.execute(
            await getSignedExecuteInput(
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
                                    ['string', 'string', 'uint8', 'uint256', 'address'],
                                    [tokenName, tokenSymbol, decimals, capacity, token.address],
                                ),
                            ],
                        ],
                    ),
                ),
                ownerWallet,
            ),
        );

        const depositImplementation = await deployContract(ownerWallet, DepositService);
        const depositProxy = await deployContract(ownerWallet, DepositServiceProxy, [
            depositImplementation.address,
            arrayify(defaultAbiCoder.encode(['address', 'string'], [gateway.address, tokenSymbol])),
        ]);
        depositService = new Contract(depositProxy.address, DepositService.abi, ownerWallet);
    });

    describe('deposit service', () => {
        it('should handle and send ERC20 token', async () => {
            const destinationAddress = userWallet.address.toString();
            const nonce = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.depositAddressForSendToken(
                nonce,
                destinationChain,
                destinationAddress,
                tokenSymbol,
            );

            await token.connect(ownerWallet).transfer(depositAddress, amount);

            await expect(depositService.sendToken(nonce, destinationChain, destinationAddress, tokenSymbol))
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositAddress, destinationChain, destinationAddress, tokenSymbol, amount);
        });

        it('should wrap and send native currency', async () => {
            const destinationAddress = userWallet.address.toString();
            const nonce = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.depositAddressForSendNative(nonce, destinationChain, destinationAddress);

            await ownerWallet.sendTransaction({
                to: depositAddress,
                value: amount,
            });

            await expect(depositService.sendNative(nonce, destinationChain, destinationAddress))
                .to.emit(gateway, 'TokenSent')
                .withArgs(depositAddress, destinationChain, destinationAddress, tokenSymbol, amount);
        });

        it('should unwrap native currency', async () => {
            const recipient = userWallet.address;
            const nonce = formatBytes32String(1);
            const amount = 1e6;

            const depositAddress = await depositService.depositAddressForWithdrawNative(nonce, recipient);

            await token.connect(ownerWallet).transfer(depositAddress, amount);

            await expect(await depositService.withdrawNative(nonce, recipient)).to.changeEtherBalance(userWallet, amount);
        });
    });
});
