'use strict';

const chai = require('chai');
const {
  Contract,
  utils: { defaultAbiCoder, arrayify, keccak256, parseEther },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const MintableCappedERC20 = require('../../build/MintableCappedERC20.json');
const GasReceiver = require('../../build/AxelarGasReceiver.json');
const GasReceiverProxy = require('../../build/AxelarGasReceiverProxy.json');

describe('AxelarGasReceiver', () => {
  const [ownerWallet, userWallet] = new MockProvider().getWallets();

  let gasReceiver;
  let testToken;

  beforeEach(async () => {
    const receiverImplementation = await deployContract(
      ownerWallet,
      GasReceiver,
    );
    const receiverProxy = await deployContract(ownerWallet, GasReceiverProxy, [
      receiverImplementation.address,
      arrayify(defaultAbiCoder.encode(['address'], [ownerWallet.address])),
    ]);

    gasReceiver = new Contract(
      receiverProxy.address,
      GasReceiver.abi,
      userWallet,
    );

    const name = 'testToken';
    const symbol = 'testToken';
    const decimals = 16;
    const capacity = 0;

    testToken = await deployContract(ownerWallet, MintableCappedERC20, [
      name,
      symbol,
      decimals,
      capacity,
    ]);

    await testToken.mint(userWallet.address, 1e9);
  });

  describe('gas receiver', () => {
    it('should emit events when receives gas payment', async () => {
      const destinationChain = 'ethereum';
      const destinationAddress = ownerWallet.address;
      const payload = defaultAbiCoder.encode(
        ['address', 'address'],
        [ownerWallet.address, userWallet.address],
      );
      const payloadHash = keccak256(payload);
      const symbol = 'USDC';
      const amount = 100000;
      const gasToken = testToken.address;
      const gasFeeAmount = 1000;
      const nativeGasFeeAmount = parseEther('1.0');

      await testToken.connect(userWallet).approve(gasReceiver.address, 1e6);

      await expect(
        gasReceiver
          .connect(userWallet)
          .payGasForContractCall(
            userWallet.address,
            destinationChain,
            destinationAddress,
            payload,
            gasToken,
            gasFeeAmount,
          ),
      )
        .to.emit(gasReceiver, 'GasPaidForContractCall')
        .withArgs(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payloadHash,
          gasToken,
          gasFeeAmount,
        )
        .and.to.emit(testToken, 'Transfer')
        .withArgs(userWallet.address, gasReceiver.address, gasFeeAmount);

      await expect(
        gasReceiver
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
          ),
      )
        .to.emit(gasReceiver, 'GasPaidForContractCallWithToken')
        .withArgs(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payloadHash,
          symbol,
          amount,
          gasToken,
          gasFeeAmount,
        )
        .and.to.emit(testToken, 'Transfer')
        .withArgs(userWallet.address, gasReceiver.address, gasFeeAmount);

      await expect(
        await gasReceiver
          .connect(userWallet)
          .payNativeGasForContractCall(
            userWallet.address,
            destinationChain,
            destinationAddress,
            payload,
            { value: nativeGasFeeAmount },
          ),
      )
        .to.emit(gasReceiver, 'NativeGasPaidForContractCall')
        .withArgs(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payloadHash,
          nativeGasFeeAmount,
        )
        .and.to.changeEtherBalance(gasReceiver, nativeGasFeeAmount);

      await expect(
        await gasReceiver
          .connect(userWallet)
          .payNativeGasForContractCallWithToken(
            userWallet.address,
            destinationChain,
            destinationAddress,
            payload,
            symbol,
            amount,
            { value: nativeGasFeeAmount },
          ),
      )
        .to.emit(gasReceiver, 'NativeGasPaidForContractCallWithToken')
        .withArgs(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payloadHash,
          symbol,
          amount,
          nativeGasFeeAmount,
        )
        .and.to.changeEtherBalance(gasReceiver, nativeGasFeeAmount);
    });

    it('should allow to collect accumulated payments', async () => {
      const destinationChain = 'ethereum';
      const destinationAddress = ownerWallet.address;
      const payload = defaultAbiCoder.encode(
        ['address', 'address'],
        [ownerWallet.address, userWallet.address],
      );
      const symbol = 'USDC';
      const amount = 100000;
      const gasToken = testToken.address;
      const gasFeeAmount = 1000;
      const nativeGasFeeAmount = parseEther('1.0');

      await testToken.connect(userWallet).approve(gasReceiver.address, 1e6);

      await gasReceiver
        .connect(userWallet)
        .payGasForContractCall(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payload,
          gasToken,
          gasFeeAmount,
        );

      await gasReceiver
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
        );

      await gasReceiver
        .connect(userWallet)
        .payNativeGasForContractCall(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payload,
          { value: nativeGasFeeAmount },
        );

      await gasReceiver
        .connect(userWallet)
        .payNativeGasForContractCall(
          userWallet.address,
          destinationChain,
          destinationAddress,
          payload,
          { value: nativeGasFeeAmount },
        );

      await expect(
        gasReceiver
          .connect(userWallet)
          .collectFees(ownerWallet.address, [ADDRESS_ZERO, testToken.address]),
      ).to.be.reverted;

      await expect(
        await gasReceiver
          .connect(ownerWallet)
          .collectFees(ownerWallet.address, [ADDRESS_ZERO, testToken.address]),
      )
        .to.changeEtherBalance(ownerWallet, nativeGasFeeAmount.mul(2))
        .and.to.emit(testToken, 'Transfer')
        .withArgs(gasReceiver.address, ownerWallet.address, gasFeeAmount * 2);
    });

    it('should upgrade the gas receiver implementation', async () => {
      const receiverImplementation = await deployContract(
        ownerWallet,
        GasReceiver,
      );
      const newImplementationCode =
        await receiverImplementation.provider.getCode(
          receiverImplementation.address,
        );
      const newImplementationCodeHash = keccak256(newImplementationCode);

      await expect(await gasReceiver.owner()).to.be.equal(ownerWallet.address);

      await expect(
        gasReceiver
          .connect(ownerWallet)
          .upgrade(
            receiverImplementation.address,
            newImplementationCodeHash,
            arrayify(defaultAbiCoder.encode(['address'], [userWallet.address])),
          ),
      )
        .to.emit(gasReceiver, 'Upgraded')
        .withArgs(receiverImplementation.address)
        .and.to.emit(gasReceiver, 'OwnershipTransferred')
        .withArgs(userWallet.address);

      await expect(await gasReceiver.owner()).to.be.equal(userWallet.address);
    });
  });
});
