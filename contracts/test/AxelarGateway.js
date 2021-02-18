'use strict';

const chai = require('chai');
const {
  Contract,
  ContractFactory,
  utils: { defaultAbiCoder, id, arrayify, keccak256, getCreate2Address },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

const AxelarGateway = require('../build/AxelarGateway.json');
const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');
const Burner = require('../build/Burner.json');

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
          ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
          [CHAIN_ID + 1, [], [], []],
        ),
      );

      return getSignedExecuteInput(data, ownerWallet).then((input) =>
        expect(contract.execute(input)).to.be.revertedWith(
          'AxelarGateway: signed chain ID mismatch',
        ),
      );
    });

    describe('command deployToken', () => {
      it('should not deploy the duplicate token', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('deployToken-1')],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
              ],
            ],
          ),
        );
        const secondTxData = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('deployToken-2')],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input)).to.emit(contract, 'TokenDeployed'),
          )
          .then(() => getSignedExecuteInput(secondTxData, ownerWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.be.revertedWith('AxelarGateway: command failed')
              .and.to.be.revertedWith('AxelarGateway: token already deployed'),
          );
      });

      it('should deploy a new token', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('deployToken')],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
              ],
            ],
          ),
        );

        const tokenFactory = new ContractFactory(
          BurnableMintableCappedERC20.abi,
          BurnableMintableCappedERC20.bytecode,
        );
        const { data: tokenInitCode } = tokenFactory.getDeployTransaction(
          name,
          symbol,
          decimals,
          cap,
        );
        const expectedTokenAddress = getCreate2Address(
          contract.address,
          id(symbol),
          keccak256(tokenInitCode),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input)).to.emit(contract, 'TokenDeployed'),
          )
          .then(() => contract.tokenAddresses(symbol))
          .then((tokenAddress) => {
            expect(tokenAddress).to.be.properAddress;
            expect(tokenAddress).to.eq(expectedTokenAddress);

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
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('deployToken')],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet).then((input) =>
          contract.execute(input),
        );
      });

      it('should mint tokens', async () => {
        const amount = 9999;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('mintToken')],
              ['mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, nonOwnerWallet.address, amount],
                ),
              ],
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

    describe('command burnToken', () => {
      const name = 'An Awesome Token';
      const symbol = 'AAT';
      const decimals = 18;
      const cap = 10000;
      const amount = 10;

      beforeEach(() => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('deployToken'), id('mintToken')],
              ['deployToken', 'mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, ownerWallet.address, amount],
                ),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet).then((input) =>
          contract.execute(input),
        );
      });

      it('should burn tokens', async () => {
        const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
        const salt = id(
          `${destinationBtcAddress}-${ownerWallet.address}-${Date.now()}`,
        );

        const dataFirstBurn = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('burnToken1')],
              ['burnToken'],
              [defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt])],
            ],
          ),
        );
        const dataSecondBurn = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('burnToken2')],
              ['burnToken'],
              [defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt])],
            ],
          ),
        );

        const tokenAddress = await contract.tokenAddresses(symbol);
        const tokenContract = new Contract(
          tokenAddress,
          BurnableMintableCappedERC20.abi,
          ownerWallet,
        );

        const burnerFactory = new ContractFactory(Burner.abi, Burner.bytecode);
        const { data: burnerInitCode } = burnerFactory.getDeployTransaction(
          tokenAddress,
          salt,
        );
        const burnerAddress = getCreate2Address(
          contract.address,
          salt,
          keccak256(burnerInitCode),
        );

        const burnAmount = amount / 2;

        return tokenContract
          .transfer(burnerAddress, burnAmount)
          .then(() => getSignedExecuteInput(dataFirstBurn, ownerWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() => tokenContract.transfer(burnerAddress, burnAmount))
          .then(() => getSignedExecuteInput(dataSecondBurn, ownerWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() =>
            tokenContract.balanceOf(burnerAddress).then(bigNumberToNumber),
          )
          .then((actual) => {
            expect(actual).to.eq(0);
          });
      });
    });

    describe('command transferOwnership', () => {
      it('should not transfering ownership to address zero', () => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('transferOwnership')],
              ['transferOwnership'],
              [defaultAbiCoder.encode(['address'], [ADDRESS_ZERO])],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet).then((input) =>
          expect(contract.execute(input))
            .to.be.revertedWith('AxelarGateway: command failed')
            .and.to.be.revertedWith(
              'AxelarGateway: new owner is the zero address',
            ),
        );
      });

      it('should transfer ownership if transfering to a valid address', () => {
        const newOwner = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('transferOwnership')],
              ['transferOwnership'],
              [defaultAbiCoder.encode(['address'], [newOwner])],
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

    describe('batch commands', () => {
      it('should batch execute multiple commands', () => {
        const name = 'Bitcoin';
        const symbol = 'BTC';
        const decimals = 8;
        const cap = 2100000000;
        const amount1 = 10000;
        const amount2 = 20000;
        const newOwner = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [
                id('deployToken'),
                id('mintToken1'),
                id('mintToken2'),
                id('transferOwnership'),
              ],
              ['deployToken', 'mintToken', 'mintToken', 'transferOwnership'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, ownerWallet.address, amount1],
                ),
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, nonOwnerWallet.address, amount2],
                ),
                defaultAbiCoder.encode(['address'], [newOwner]),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'TokenDeployed')
              .and.to.emit(contract, 'OwnershipTransferred')
              .withArgs(ownerWallet.address, newOwner),
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
              tokenContract
                .balanceOf(ownerWallet.address)
                .then(bigNumberToNumber),
              tokenContract
                .balanceOf(nonOwnerWallet.address)
                .then(bigNumberToNumber),
            ]);
          })
          .then((actual) => {
            expect(actual).to.deep.eq([
              name,
              symbol,
              decimals,
              cap,
              amount1,
              amount2,
            ]);
          })
          .then(() => contract.owner())
          .then((actual) => {
            expect(actual).to.eq(newOwner);
          });
      });
    });
  });
});
