'use strict';

const chai = require('chai');
const {
  Contract,
  utils: {
    defaultAbiCoder,
    arrayify,
    formatBytes32String,
    keccak256,
    getCreate2Address,
    toUtf8Bytes,
  },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;
const ROLE_OWNER = 1;

const TokenDeployer = require('../build/TokenDeployer.json');
const AxelarGatewayProxy = require('../build/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../build/AxelarGatewaySinglesig.json');
const TestWeth = require('../build/TestWeth.json');
const DepositService = require('../build/AxelarDepositService.json');
const DepositServiceProxy = require('../build/AxelarDepositServiceProxy.json');
const DepositReceiver = require('../build/DepositReceiver.json');

const { getSignedExecuteInput, getRandomID } = require('./utils');

describe('AxelarDepositService', () => {
  const [
    ownerWallet,
    operatorWallet,
    userWallet,
    adminWallet1,
    adminWallet2,
    adminWallet3,
    adminWallet4,
    adminWallet5,
    adminWallet6,
  ] = new MockProvider().getWallets();
  const adminWallets = [
    adminWallet1,
    adminWallet2,
    adminWallet3,
    adminWallet4,
    adminWallet5,
    adminWallet6,
  ];
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
        [
          adminWallets.map(get('address')),
          threshold,
          ownerWallet.address,
          operatorWallet.address,
        ],
      ),
    );
    const tokenDeployer = await deployContract(ownerWallet, TokenDeployer);
    const gatewayImplementation = await deployContract(
      ownerWallet,
      AxelarGatewaySinglesig,
      [tokenDeployer.address],
    );
    const gatewayProxy = await deployContract(ownerWallet, AxelarGatewayProxy, [
      gatewayImplementation.address,
      params,
    ]);
    gateway = new Contract(
      gatewayProxy.address,
      AxelarGatewaySinglesig.abi,
      ownerWallet,
    );

    token = await deployContract(ownerWallet, TestWeth, [
      tokenName,
      tokenSymbol,
      decimals,
      capacity,
    ]);

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

    const depositImplementation = await deployContract(
      ownerWallet,
      DepositService,
    );
    const depositProxy = await deployContract(
      ownerWallet,
      DepositServiceProxy,
      [
        depositImplementation.address,
        arrayify(
          defaultAbiCoder.encode(
            ['address', 'string'],
            [gateway.address, tokenSymbol],
          ),
        ),
      ],
    );
    depositService = new Contract(
      depositProxy.address,
      DepositService.abi,
      ownerWallet,
    );
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
            [
              keccak256(toUtf8Bytes('deposit-send-token')),
              salt,
              destinationChain,
              destinationAddress,
              tokenSymbol,
            ],
          ),
        ),
        keccak256(`0x${DepositReceiver.bytecode}`),
      );

      const depositAddress = await depositService.depositAddressForSendToken(
        salt,
        destinationChain,
        destinationAddress,
        tokenSymbol,
      );

      expect(depositAddress).to.be.equal(expectedDepositAddress);

      await token.connect(ownerWallet).transfer(depositAddress, amount);

      await expect(
        depositService.sendToken(
          salt,
          destinationChain,
          destinationAddress,
          tokenSymbol,
        ),
      )
        .to.emit(gateway, 'TokenSent')
        .withArgs(
          depositAddress,
          destinationChain,
          destinationAddress,
          tokenSymbol,
          amount,
        );
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
                  [
                    keccak256(toUtf8Bytes('deposit-send-native')),
                    salt,
                    destinationChain,
                    destinationAddress,
                  ],
              ),
          ),
          keccak256(`0x${DepositReceiver.bytecode}`),
      );

      const depositAddress = await depositService.depositAddressForSendNative(
        salt,
        destinationChain,
        destinationAddress,
      );

      expect(depositAddress).to.be.equal(expectedDepositAddress);

      await ownerWallet.sendTransaction({
        to: depositAddress,
        value: amount,
      });

      await expect(
        await depositService.sendNative(
          salt,
          destinationChain,
          destinationAddress,
        ),
      )
        .to.emit(gateway, 'TokenSent')
        .withArgs(
          depositAddress,
          destinationChain,
          destinationAddress,
          tokenSymbol,
          amount,
        );
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
                  [
                    keccak256(toUtf8Bytes('deposit-withdraw-native')),
                    salt,
                    recipient
                  ],
              ),
          ),
          keccak256(`0x${DepositReceiver.bytecode}`),
      );

      const depositAddress =
        await depositService.depositAddressForWithdrawNative(salt, recipient);

      expect(depositAddress).to.be.equal(expectedDepositAddress);

      await token.connect(ownerWallet).transfer(depositAddress, amount);

      await expect(
        await depositService.withdrawNative(salt, recipient),
      ).to.changeEtherBalance(userWallet, amount);
    });
  });
});
