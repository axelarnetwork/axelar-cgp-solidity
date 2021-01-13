'use strict';

const chai = require('chai');
const {
  Contract,
  utils: { defaultAbiCoder, id, arrayify, keccak256 },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const AxelarGateway = require('../build/AxelarGateway.json');
const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');

const bigNumberToNumber = (bigNumber) => bigNumber.toNumber();

const getSignedExecuteInput = (data, wallet) =>
  wallet
    .signMessage(arrayify(keccak256(data)))
    .then((signature) =>
      defaultAbiCoder.encode(['bytes', 'bytes'], [data, signature]),
    );

describe('AxelarGateway', () => {
  const [ownerWallet, nonOwnerWallet] = new MockProvider().getWallets();
  let contract;

  beforeEach(async () => {
    contract = await deployContract(ownerWallet, AxelarGateway);
  });

  describe('owner', () => {
    it('should get correct owner', () =>
      contract.owner().then((actual) => {
        expect(actual).to.eq(ownerWallet.address);
      }));
  });

  describe('execute', () => {
    it('should fail if data is not signed by owner', async () => {
      const data = arrayify('0x1234');

      return getSignedExecuteInput(data, nonOwnerWallet).then((input) =>
        expect(contract.execute(input)).to.be.revertedWith(
          'AxelarGateway: signer is not owner',
        ),
      );
    });

    it('should fail if chain Id mismatches', () => {
      const data = arrayify(
        defaultAbiCoder.encode(
          ['uint256', 'bytes32', 'string', 'bytes'],
          [CHAIN_ID + 1, id('commandId'), 'command', '0x1234'],
        ),
      );

      return getSignedExecuteInput(data, ownerWallet).then((input) =>
        expect(contract.execute(input)).to.be.revertedWith(
          'AxelarGateway: signed chain ID mismatch',
        ),
      );
    });

    describe('command deployToken', () => {
      it('should should fail if try to deploy the same token twice', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('deployToken-1'),
              'deployToken',
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256'],
                [name, symbol, decimals, cap],
              ),
            ],
          ),
        );
        const secondTxData = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('deployToken-2'),
              'deployToken',
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256'],
                [name, symbol, decimals, cap],
              ),
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input)).to.emit(contract, 'TokenDeployed'),
          )
          .then(() => getSignedExecuteInput(secondTxData, ownerWallet))
          .then((input) =>
            expect(contract.execute(input)).to.be.revertedWith(
              'AxelarGateway: command failed',
            ),
          );
      });

      it('should deploy a new token', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('deployToken'),
              'deployToken',
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256'],
                [name, symbol, decimals, cap],
              ),
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input)).to.emit(contract, 'TokenDeployed'),
          )
          .then(() => contract.tokenAddresses(symbol))
          .then((tokenAddress) => {
            expect(tokenAddress).to.be.properAddress;

            const tokenContract = new Contract(
              tokenAddress,
              BurnableMintableCappedERC20.abi,
              ownerWallet,
            );

            return Promise.all([
              tokenContract.name(),
              tokenContract.symbol(),
              tokenContract.decimals(),
              tokenContract.cap().then(bigNumberToNumber),
            ]);
          })
          .then((actual) => {
            expect(actual).to.deep.eq([name, symbol, decimals, cap]);
          });
      });
    });

    describe('command mintToken', () => {
      const name = 'An Awesome Token';
      const symbol = 'AAT';
      const decimals = 18;
      const cap = 10000;

      beforeEach(() => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('deployToken'),
              'deployToken',
              defaultAbiCoder.encode(
                ['string', 'string', 'uint8', 'uint256'],
                [name, symbol, decimals, cap],
              ),
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet).then((input) =>
          contract.execute(input),
        );
      });

      it('should mint tokens', async () => {
        const addresses = [nonOwnerWallet.address];
        const amount = 9999;
        const amounts = [amount];
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('mintToken'),
              'mintToken',
              defaultAbiCoder.encode(
                ['string', 'address[]', 'uint256[]'],
                [symbol, addresses, amounts],
              ),
            ],
          ),
        );

        const tokenAddress = await contract.tokenAddresses(symbol);
        const tokenContract = new Contract(
          tokenAddress,
          BurnableMintableCappedERC20.abi,
          ownerWallet,
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(ADDRESS_ZERO, nonOwnerWallet.address, amount),
          )
          .then(() =>
            tokenContract
              .balanceOf(nonOwnerWallet.address)
              .then(bigNumberToNumber),
          )
          .then((actual) => {
            expect(actual).to.eq(amount);
          });
      });
    });

    describe('command transferOwnership', () => {
      it('should fail if transfering ownership to address zero', () => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('transferOwnership'),
              'transferOwnership',
              defaultAbiCoder.encode(['address'], [ADDRESS_ZERO]),
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet).then((input) =>
          expect(contract.execute(input)).to.be.revertedWith(
            'AxelarGateway: command failed',
          ),
        );
      });

      it('should transfer ownership if transfering to a valid address', () => {
        const newOwner = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32', 'string', 'bytes'],
            [
              CHAIN_ID,
              id('transferOwnership'),
              'transferOwnership',
              defaultAbiCoder.encode(['address'], [newOwner]),
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'OwnershipTransferred')
              .withArgs(ownerWallet.address, newOwner),
          )
          .then(() => contract.owner())
          .then((actual) => {
            expect(actual).to.eq(newOwner);
          });
      });
    });
  });
});
