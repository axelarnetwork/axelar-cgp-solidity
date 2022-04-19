'use strict';

const chai = require('chai');
const {
  Contract,
  utils: { defaultAbiCoder, arrayify, keccak256 },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ROLE_OWNER = 1;

const TokenDeployer = require('../../build/TokenDeployer.json');
const AxelarGatewayProxy = require('../../build/AxelarGatewayProxy.json');
const AxelarGatewaySinglesig = require('../../build/AxelarGatewaySinglesig.json');
const MintableCappedERC20 = require('../../build/MintableCappedERC20.json');
const GasReceiver = require('../../build/AxelarGasReceiver.json');
const GasReceiverProxy = require('../../build/AxelarGasReceiverProxy.json');
const ChainASwapCaller = require('../../build/ChainASwapCaller.json');
const ChainBSwapExecutable = require('../../build/ChainBSwapExecutable.json');
const ChainBTokenSwapper = require('../../build/ChainBTokenSwapper.json');
const { getSignedExecuteInput, getRandomID } = require('../utils');

describe('GeneralMessagePassing', () => {
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

  let chainAGateway;
  let chainBGateway;
  let chainAGasReceiver;
  let chainASwapCaller;
  let chainBSwapExecutable;
  let chainBTokenSwapper;
  let tokenX;
  let tokenY;

  const sourceChain = 'chainA';
  const destinationChain = 'chainB';
  const nameX = 'testTokenX';
  const symbolX = 'testTokenX';
  const nameY = 'testTokenY';
  const symbolY = 'testTokenY';
  const decimals = 16;
  const capacity = 0;

  const getMintData = (symbol, address, amount) =>
    arrayify(
      defaultAbiCoder.encode(
        ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
        [
          CHAIN_ID,
          ROLE_OWNER,
          [getRandomID()],
          ['mintToken'],
          [
            defaultAbiCoder.encode(
              ['string', 'address', 'uint256'],
              [symbol, address, amount],
            ),
          ],
        ],
      ),
    );

  beforeEach(async () => {
    const deployGateway = async () => {
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
      const gateway = await deployContract(
        ownerWallet,
        AxelarGatewaySinglesig,
        [tokenDeployer.address],
      );
      const proxy = await deployContract(ownerWallet, AxelarGatewayProxy, [
        gateway.address,
        params,
      ]);
      return new Contract(
        proxy.address,
        AxelarGatewaySinglesig.abi,
        ownerWallet,
      );
    };

    const getTokenDeployData = (withAddress) =>
      arrayify(
        defaultAbiCoder.encode(
          ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
          [
            CHAIN_ID,
            ROLE_OWNER,
            [getRandomID(), getRandomID()],
            ['deployToken', 'deployToken'],
            [
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256', 'address'],
                [
                  nameX,
                  symbolX,
                  decimals,
                  capacity,
                  withAddress ? tokenX.address : ADDRESS_ZERO,
                ],
              ),
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256', 'address'],
                [
                  nameY,
                  symbolY,
                  decimals,
                  capacity,
                  withAddress ? tokenY.address : ADDRESS_ZERO,
                ],
              ),
            ],
          ],
        ),
      );

    chainAGateway = await deployGateway();
    chainBGateway = await deployGateway();

    const receiverImplementation = await deployContract(
      ownerWallet,
      GasReceiver,
    );
    const receiverProxy = await deployContract(ownerWallet, GasReceiverProxy, [
      receiverImplementation.address,
      arrayify(defaultAbiCoder.encode(['address'], [ownerWallet.address])),
    ]);
    chainAGasReceiver = new Contract(
      receiverProxy.address,
      GasReceiver.abi,
      ownerWallet,
    );

    tokenX = await deployContract(ownerWallet, MintableCappedERC20, [
      nameX,
      symbolX,
      decimals,
      capacity,
    ]);

    tokenY = await deployContract(ownerWallet, MintableCappedERC20, [
      nameY,
      symbolY,
      decimals,
      capacity,
    ]);

    await chainAGateway.execute(
      await getSignedExecuteInput(getTokenDeployData(false), ownerWallet),
    );
    await chainBGateway.execute(
      await getSignedExecuteInput(getTokenDeployData(true), ownerWallet),
    );

    chainBTokenSwapper = await deployContract(ownerWallet, ChainBTokenSwapper, [
      tokenX.address,
      tokenY.address,
    ]);

    chainBSwapExecutable = await deployContract(
      ownerWallet,
      ChainBSwapExecutable,
      [chainBGateway.address, chainBTokenSwapper.address],
    );

    chainASwapCaller = await deployContract(ownerWallet, ChainASwapCaller, [
      chainAGateway.address,
      chainAGasReceiver.address,
      destinationChain,
      chainBSwapExecutable.address.toString(),
    ]);

    await tokenX.mint(chainBGateway.address, 1e9);
    await tokenY.mint(chainBTokenSwapper.address, 1e9);

    await chainAGateway.execute(
      await getSignedExecuteInput(
        getMintData(symbolX, userWallet.address, 1e9),
        ownerWallet,
      ),
    );
  });

  describe('general message passing', () => {
    it('should swap tokens on remote chain', async () => {
      const swapAmount = 1e6;
      const gasFeeAmount = 1e3;
      const convertedAmount = 2 * swapAmount;
      const payload = defaultAbiCoder.encode(
        ['string', 'string'],
        [symbolY, userWallet.address.toString()],
      );
      const payloadHash = keccak256(payload);

      const chainATokenX = new Contract(
        await chainAGateway.tokenAddresses(symbolX),
        MintableCappedERC20.abi,
        userWallet,
      );
      await chainATokenX.approve(
        chainASwapCaller.address,
        swapAmount + gasFeeAmount,
      );

      await expect(
        chainASwapCaller
          .connect(userWallet)
          .swapToken(
            symbolX,
            symbolY,
            swapAmount,
            userWallet.address.toString(),
            gasFeeAmount,
          ),
      )
        .to.emit(chainAGasReceiver, 'GasPaidForContractCallWithToken')
        .withArgs(
          chainASwapCaller.address,
          destinationChain,
          chainBSwapExecutable.address.toString(),
          payloadHash,
          symbolX,
          swapAmount,
          chainATokenX.address,
          gasFeeAmount,
        )
        .and.to.emit(chainAGateway, 'ContractCallWithToken')
        .withArgs(
          chainASwapCaller.address.toString(),
          destinationChain,
          chainBSwapExecutable.address.toString(),
          payloadHash,
          payload,
          symbolX,
          swapAmount,
        );

      const approveCommandId = getRandomID();
      const sourceTxHash = keccak256('0x123abc123abc');
      const sourceEventIndex = 17;

      const approveWithMintData = arrayify(
        defaultAbiCoder.encode(
          ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
          [
            CHAIN_ID,
            ROLE_OWNER,
            [approveCommandId],
            ['approveContractCallWithMint'],
            [
              defaultAbiCoder.encode(
                [
                  'string',
                  'string',
                  'address',
                  'bytes32',
                  'string',
                  'uint256',
                  'bytes32',
                  'uint256',
                ],
                [
                  sourceChain,
                  chainASwapCaller.address.toString(),
                  chainBSwapExecutable.address,
                  payloadHash,
                  symbolX,
                  swapAmount,
                  sourceTxHash,
                  sourceEventIndex,
                ],
              ),
            ],
          ],
        ),
      );

      const approveExecute = await chainBGateway.execute(
        await getSignedExecuteInput(approveWithMintData, ownerWallet),
      );

      await expect(approveExecute)
        .to.emit(chainBGateway, 'ContractCallApprovedWithMint')
        .withArgs(
          approveCommandId,
          sourceChain,
          chainASwapCaller.address.toString(),
          chainBSwapExecutable.address,
          payloadHash,
          symbolX,
          swapAmount,
          sourceTxHash,
          sourceEventIndex,
        );

      const swap = await chainBSwapExecutable.executeWithToken(
        approveCommandId,
        sourceChain,
        chainASwapCaller.address.toString(),
        payload,
        symbolX,
        swapAmount,
      );

      await expect(swap)
        .to.emit(tokenX, 'Transfer')
        .withArgs(
          chainBGateway.address,
          chainBSwapExecutable.address,
          swapAmount,
        )
        .and.to.emit(tokenY, 'Transfer')
        .withArgs(
          chainBTokenSwapper.address,
          chainBSwapExecutable.address,
          convertedAmount,
        )
        .and.to.emit(tokenY, 'Transfer')
        .withArgs(
          chainBSwapExecutable.address,
          chainBGateway.address,
          convertedAmount,
        )
        .and.to.emit(chainBGateway, 'TokenSent')
        .withArgs(
          chainBSwapExecutable.address,
          sourceChain,
          userWallet.address.toString(),
          symbolY,
          convertedAmount,
        );
    });
  });
});
