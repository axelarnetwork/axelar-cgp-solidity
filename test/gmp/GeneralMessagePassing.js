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
const GasService = require('../../build/AxelarGasService.json');
const GasServiceProxy = require('../../build/AxelarGasServiceProxy.json');
const SourceChainSwapCaller = require('../../build/SourceChainSwapCaller.json');
const DestinationChainSwapExecutable = require('../../build/DestinationChainSwapExecutable.json');
const DestinationChainTokenSwapper = require('../../build/DestinationChainTokenSwapper.json');
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

  let sourceChainGateway;
  let destinationChainGateway;
  let sourceChainGasService;
  let sourceChainSwapCaller;
  let destinationChainSwapExecutable;
  let destinationChainTokenSwapper;
  let tokenA;
  let tokenB;

  const sourceChain = 'chainA';
  const destinationChain = 'chainB';
  const nameA = 'testTokenX';
  const symbolA = 'testTokenX';
  const nameB = 'testTokenY';
  const symbolB = 'testTokenY';
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
                  nameA,
                  symbolA,
                  decimals,
                  capacity,
                  withAddress ? tokenA.address : ADDRESS_ZERO,
                ],
              ),
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256', 'address'],
                [
                  nameB,
                  symbolB,
                  decimals,
                  capacity,
                  withAddress ? tokenB.address : ADDRESS_ZERO,
                ],
              ),
            ],
          ],
        ),
      );

    sourceChainGateway = await deployGateway();
    destinationChainGateway = await deployGateway();

    const gasImplementation = await deployContract(ownerWallet, GasService);
    const gasProxy = await deployContract(ownerWallet, GasServiceProxy, [
      gasImplementation.address,
      arrayify([]),
    ]);
    sourceChainGasService = new Contract(
      gasProxy.address,
      GasService.abi,
      ownerWallet,
    );

    tokenA = await deployContract(ownerWallet, MintableCappedERC20, [
      nameA,
      symbolA,
      decimals,
      capacity,
    ]);

    tokenB = await deployContract(ownerWallet, MintableCappedERC20, [
      nameB,
      symbolB,
      decimals,
      capacity,
    ]);

    await sourceChainGateway.execute(
      await getSignedExecuteInput(getTokenDeployData(false), ownerWallet),
    );
    await destinationChainGateway.execute(
      await getSignedExecuteInput(getTokenDeployData(true), ownerWallet),
    );

    destinationChainTokenSwapper = await deployContract(
      ownerWallet,
      DestinationChainTokenSwapper,
      [tokenA.address, tokenB.address],
    );

    destinationChainSwapExecutable = await deployContract(
      ownerWallet,
      DestinationChainSwapExecutable,
      [destinationChainGateway.address, destinationChainTokenSwapper.address],
    );

    sourceChainSwapCaller = await deployContract(
      ownerWallet,
      SourceChainSwapCaller,
      [
        sourceChainGateway.address,
        sourceChainGasService.address,
        destinationChain,
        destinationChainSwapExecutable.address.toString(),
      ],
    );

    await tokenA.mint(destinationChainGateway.address, 1e9);
    await tokenB.mint(destinationChainTokenSwapper.address, 1e9);

    await sourceChainGateway.execute(
      await getSignedExecuteInput(
        getMintData(symbolA, userWallet.address, 1e9),
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
        [symbolB, userWallet.address.toString()],
      );
      const payloadHash = keccak256(payload);

      const sourceChainTokenA = new Contract(
        await sourceChainGateway.tokenAddresses(symbolA),
        MintableCappedERC20.abi,
        userWallet,
      );
      await sourceChainTokenA.approve(
        sourceChainSwapCaller.address,
        swapAmount + gasFeeAmount,
      );

      await expect(
        sourceChainSwapCaller
          .connect(userWallet)
          .swapToken(
            symbolA,
            symbolB,
            swapAmount,
            userWallet.address.toString(),
            gasFeeAmount,
          ),
      )
        .to.emit(sourceChainGasService, 'GasPaidForContractCallWithToken')
        .withArgs(
          sourceChainSwapCaller.address,
          destinationChain,
          destinationChainSwapExecutable.address.toString(),
          payloadHash,
          symbolA,
          swapAmount,
          sourceChainTokenA.address,
          gasFeeAmount,
          userWallet.address,
        )
        .and.to.emit(sourceChainGateway, 'ContractCallWithToken')
        .withArgs(
          sourceChainSwapCaller.address.toString(),
          destinationChain,
          destinationChainSwapExecutable.address.toString(),
          payloadHash,
          payload,
          symbolA,
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
                  sourceChainSwapCaller.address.toString(),
                  destinationChainSwapExecutable.address,
                  payloadHash,
                  symbolA,
                  swapAmount,
                  sourceTxHash,
                  sourceEventIndex,
                ],
              ),
            ],
          ],
        ),
      );

      const approveExecute = await destinationChainGateway.execute(
        await getSignedExecuteInput(approveWithMintData, ownerWallet),
      );

      await expect(approveExecute)
        .to.emit(destinationChainGateway, 'ContractCallApprovedWithMint')
        .withArgs(
          approveCommandId,
          sourceChain,
          sourceChainSwapCaller.address.toString(),
          destinationChainSwapExecutable.address,
          payloadHash,
          symbolA,
          swapAmount,
          sourceTxHash,
          sourceEventIndex,
        );

      const swap = await destinationChainSwapExecutable.executeWithToken(
        approveCommandId,
        sourceChain,
        sourceChainSwapCaller.address.toString(),
        payload,
        symbolA,
        swapAmount,
      );

      await expect(swap)
        .to.emit(tokenA, 'Transfer')
        .withArgs(
          destinationChainGateway.address,
          destinationChainSwapExecutable.address,
          swapAmount,
        )
        .and.to.emit(tokenB, 'Transfer')
        .withArgs(
          destinationChainTokenSwapper.address,
          destinationChainSwapExecutable.address,
          convertedAmount,
        )
        .and.to.emit(tokenB, 'Transfer')
        .withArgs(
          destinationChainSwapExecutable.address,
          destinationChainGateway.address,
          convertedAmount,
        )
        .and.to.emit(destinationChainGateway, 'TokenSent')
        .withArgs(
          destinationChainSwapExecutable.address,
          sourceChain,
          userWallet.address.toString(),
          symbolB,
          convertedAmount,
        );
    });
  });
});
