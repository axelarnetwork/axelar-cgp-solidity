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
const { get } = require('lodash/fp');

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

const getRandomInt = (max) => {
  return Math.floor(Math.random() * max);
};

const getRandomID = () => id(getRandomInt(1e10).toString());

describe('AxelarGateway', () => {
  const [
    ownerWallet,
    operatorWallet,
    nonOwnerWallet,
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

  let contract;

  beforeEach(async () => {
    contract = await deployContract(ownerWallet, AxelarGateway, [
      adminWallets.map(get('address')),
      threshold,
      ownerWallet.address,
      operatorWallet.address,
    ]);
  });

  describe('owner', () => {
    it('should get correct owner', () =>
      contract.owner().then((actual) => {
        expect(actual).to.eq(ownerWallet.address);
      }));
  });

  describe('operator', () => {
    it('should get correct operator', () =>
      contract.operator().then((actual) => {
        expect(actual).to.eq(operatorWallet.address);
      }));
  });

  describe('setTokenDailyMintLimit', () => {
    it('should set token daily mint limit after passing threshold', () => {
      const symbol = 'test-token';
      const limit = getRandomInt(1e8);

      return expect(
        contract.connect(adminWallet1).setTokenDailyMintLimit(symbol, limit),
      )
        .to.not.emit(contract, 'TokenDailyMintLimitUpdated')
        .then(() =>
          expect(
            contract
              .connect(adminWallet2)
              .setTokenDailyMintLimit(symbol, limit),
          ).to.not.emit(contract, 'TokenDailyMintLimitUpdated'),
        )
        .then(() =>
          expect(
            contract
              .connect(adminWallet3)
              .setTokenDailyMintLimit(symbol, limit),
          )
            .to.emit(contract, 'TokenDailyMintLimitUpdated')
            .withArgs(symbol, limit),
        );
    });
  });

  describe('token transfer', () => {
    const name = 'An Awesome Token';
    const symbol = 'AAT';
    const decimals = 18;
    const cap = 1e8;
    const amount = 9999;

    let tokenContract;

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

      return getSignedExecuteInput(data, ownerWallet)
        .then((input) => contract.execute(input))
        .then(async () => {
          const tokenAddress = await contract.tokenAddresses(symbol);
          tokenContract = new Contract(
            tokenAddress,
            BurnableMintableCappedERC20.abi,
            nonOwnerWallet,
          );
        })
        .then(() => {
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

          return getSignedExecuteInput(data, ownerWallet).then((input) =>
            contract.execute(input),
          );
        });
    });

    describe('freezeToken and unfreezeToken', () => {
      it('should freeze token after passing threshold', () => {
        return expect(contract.connect(adminWallet1).freezeToken(symbol))
          .to.not.emit(contract, 'TokenFrozen')
          .then(() =>
            expect(
              contract.connect(adminWallet2).freezeToken(symbol),
            ).to.not.emit(contract, 'TokenFrozen'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).freezeToken(symbol))
              .to.emit(contract, 'TokenFrozen')
              .withArgs(symbol),
          )
          .then(() =>
            expect(
              tokenContract.transfer(ownerWallet.address, 1),
            ).to.be.revertedWith(
              'BurnableMintableCappedERC20: token is frozen',
            ),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet1).unfreezeToken(symbol),
            ).to.not.emit(contract, 'TokenUnfrozen'),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet2).unfreezeToken(symbol),
            ).to.not.emit(contract, 'TokenUnfrozen'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).unfreezeToken(symbol))
              .to.emit(contract, 'TokenUnfrozen')
              .withArgs(symbol),
          )
          .then(() =>
            expect(tokenContract.transfer(ownerWallet.address, amount))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(nonOwnerWallet.address, ownerWallet.address, amount),
          );
      });
    });

    describe('freezeAllTokens and unfreezeAllTokens', () => {
      it('should freeze all tokens after passing threshold', () => {
        return expect(contract.connect(adminWallet1).freezeAllTokens())
          .to.not.emit(contract, 'AllTokensFrozen')
          .then(() =>
            expect(
              contract.connect(adminWallet2).freezeAllTokens(),
            ).to.not.emit(contract, 'AllTokensFrozen'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).freezeAllTokens())
              .to.emit(contract, 'AllTokensFrozen')
              .withArgs(),
          )
          .then(() =>
            expect(
              tokenContract.transfer(ownerWallet.address, amount),
            ).to.be.revertedWith(
              'BurnableMintableCappedERC20: all tokens are frozen',
            ),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet1).unfreezeAllTokens(),
            ).to.not.emit(contract, 'AllTokensUnfrozen'),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet2).unfreezeAllTokens(),
            ).to.not.emit(contract, 'AllTokensUnfrozen'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).unfreezeAllTokens())
              .to.emit(contract, 'AllTokensUnfrozen')
              .withArgs(),
          )
          .then(() =>
            expect(tokenContract.transfer(ownerWallet.address, amount))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(nonOwnerWallet.address, ownerWallet.address, amount),
          );
      });
    });

    describe('blacklistAccount and whitelistAccount', () => {
      it('should blacklist the account for receiving after passing threshold', () => {
        const account = ownerWallet.address;

        return expect(contract.connect(adminWallet1).blacklistAccount(account))
          .to.not.emit(contract, 'AccountBlacklisted')
          .then(() =>
            expect(
              contract.connect(adminWallet2).blacklistAccount(account),
            ).to.not.emit(contract, 'AccountBlacklisted'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).blacklistAccount(account))
              .to.emit(contract, 'AccountBlacklisted')
              .withArgs(account),
          )
          .then(() =>
            expect(
              tokenContract.transfer(ownerWallet.address, amount),
            ).to.be.revertedWith(
              'BurnableMintableCappedERC20: to account is blacklisted',
            ),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet1).whitelistAccount(account),
            ).to.not.emit(contract, 'AccountWhitelisted'),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet2).whitelistAccount(account),
            ).to.not.emit(contract, 'AccountWhitelisted'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).whitelistAccount(account))
              .to.emit(contract, 'AccountWhitelisted')
              .withArgs(account),
          )
          .then(() =>
            expect(tokenContract.transfer(ownerWallet.address, amount))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(nonOwnerWallet.address, ownerWallet.address, amount),
          );
      });

      it('should blacklist the account for sending after passing threshold', () => {
        const account = nonOwnerWallet.address;

        return expect(contract.connect(adminWallet1).blacklistAccount(account))
          .to.not.emit(contract, 'AccountBlacklisted')
          .then(() =>
            expect(
              contract.connect(adminWallet2).blacklistAccount(account),
            ).to.not.emit(contract, 'AccountBlacklisted'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).blacklistAccount(account))
              .to.emit(contract, 'AccountBlacklisted')
              .withArgs(account),
          )
          .then(() =>
            expect(
              tokenContract.transfer(ownerWallet.address, 1),
            ).to.be.revertedWith(
              'BurnableMintableCappedERC20: from account is blacklisted',
            ),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet1).whitelistAccount(account),
            ).to.not.emit(contract, 'AccountWhitelisted'),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet2).whitelistAccount(account),
            ).to.not.emit(contract, 'AccountWhitelisted'),
          )
          .then(() =>
            expect(contract.connect(adminWallet3).whitelistAccount(account))
              .to.emit(contract, 'AccountWhitelisted')
              .withArgs(account),
          )
          .then(() =>
            expect(tokenContract.transfer(ownerWallet.address, amount))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(nonOwnerWallet.address, ownerWallet.address, amount),
          );
      });
    });
  });

  describe('proposeUpdate and update', () => {
    it('should update to the next version after passing threshold and owner approval', async () => {
      const newVersion = await deployContract(ownerWallet, AxelarGateway, [
        adminWallets.map(get('address')),
        threshold,
        ownerWallet.address,
        operatorWallet.address,
      ]);
      const account = ownerWallet.address;

      return expect(
        contract.connect(adminWallet1).proposeUpdate(newVersion.address),
      )
        .to.not.emit(contract, 'UpdateProposed')
        .then(() =>
          expect(
            contract.connect(adminWallet2).proposeUpdate(newVersion.address),
          ).to.not.emit(contract, 'UpdateProposed'),
        )
        .then(() =>
          expect(
            contract.connect(adminWallet3).proposeUpdate(newVersion.address),
          )
            .to.emit(contract, 'UpdateProposed')
            .withArgs(contract.address, newVersion.address),
        )
        .then(() => {
          const data = arrayify(
            defaultAbiCoder.encode(
              ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
              [
                CHAIN_ID,
                [getRandomID()],
                ['update'],
                [defaultAbiCoder.encode(['address'], [newVersion.address])],
              ],
            ),
          );

          return getSignedExecuteInput(data, ownerWallet).then((input) =>
            expect(contract.execute(input)).to.emit(contract, 'Updated'),
          );
        })
        .then(() =>
          expect(
            newVersion.connect(adminWallet4).whitelistAccount(account),
          ).to.not.emit(newVersion, 'AccountWhitelisted'),
        )
        .then(() =>
          expect(
            newVersion.connect(adminWallet5).whitelistAccount(account),
          ).to.not.emit(newVersion, 'AccountWhitelisted'),
        )
        .then(() =>
          expect(newVersion.connect(adminWallet6).whitelistAccount(account))
            .to.emit(newVersion, 'AccountWhitelisted')
            .withArgs(account),
        );
    });
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
            expect(contract.execute(input)).to.not.emit(
              contract,
              'TokenDeployed',
            ),
          );
      });

      it('should not allow the operator to deploy a token', () => {
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

        return getSignedExecuteInput(data, operatorWallet).then((input) =>
          expect(contract.execute(input)).to.not.emit(
            contract,
            'TokenDeployed',
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
      const cap = 1e8;

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

      it('should not allow tokens to be minted anymore after passing daily limit', async () => {
        const limit = Math.floor(cap / 3);
        const tokenAddress = await contract.tokenAddresses(symbol);
        const tokenContract = new Contract(
          tokenAddress,
          BurnableMintableCappedERC20.abi,
          ownerWallet,
        );

        return contract
          .connect(adminWallet1)
          .setTokenDailyMintLimit(symbol, limit)
          .then(() =>
            contract
              .connect(adminWallet2)
              .setTokenDailyMintLimit(symbol, limit),
          )
          .then(() =>
            expect(
              contract
                .connect(adminWallet3)
                .setTokenDailyMintLimit(symbol, limit),
            )
              .to.emit(contract, 'TokenDailyMintLimitUpdated')
              .withArgs(symbol, limit),
          )
          .then(() => {
            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [id('mintToken-1')],
                  ['mintToken'],
                  [
                    defaultAbiCoder.encode(
                      ['string', 'address', 'uint256'],
                      [symbol, nonOwnerWallet.address, limit],
                    ),
                  ],
                ],
              ),
            );

            return getSignedExecuteInput(data, ownerWallet).then((input) =>
              expect(contract.execute(input, { gasLimit: 2000000 }))
                .to.emit(tokenContract, 'Transfer')
                .withArgs(ADDRESS_ZERO, nonOwnerWallet.address, limit),
            );
          })
          .then(() => {
            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [id('mintToken-2')],
                  ['mintToken'],
                  [
                    defaultAbiCoder.encode(
                      ['string', 'address', 'uint256'],
                      [symbol, nonOwnerWallet.address, limit],
                    ),
                  ],
                ],
              ),
            );

            return getSignedExecuteInput(data, ownerWallet).then((input) =>
              expect(
                contract.execute(input, { gasLimit: 2000000 }),
              ).to.not.emit(tokenContract, 'Transfer'),
            );
          });
      });

      it('should allow the owner to mint tokens', async () => {
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

      it('should allow the operator to mint tokens', async () => {
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

        return getSignedExecuteInput(data, operatorWallet)
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

      it('should allow the owner to burn tokens', async () => {
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

      it('should allow the operator to burn tokens', async () => {
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
          .then(() => getSignedExecuteInput(dataFirstBurn, operatorWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() => tokenContract.transfer(burnerAddress, burnAmount))
          .then(() => getSignedExecuteInput(dataSecondBurn, operatorWallet))
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
          expect(contract.execute(input)).to.not.emit(
            contract,
            'OwnershipTransferred',
          ),
        );
      });

      it('should not allow the operator to transfer ownership', () => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('transferOwnership')],
              ['transferOwnership'],
              [defaultAbiCoder.encode(['address'], [operatorWallet.address])],
            ],
          ),
        );

        return getSignedExecuteInput(data, operatorWallet).then((input) =>
          expect(contract.execute(input)).to.not.emit(
            contract,
            'OwnershipTransferred',
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
          })
          .then(() => contract.prevOwner())
          .then((actual) => {
            expect(actual).to.eq(ownerWallet.address);
          });
      });

      it('should allow the previous owner to deploy token', () => {
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
          .then(() => {
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

            return getSignedExecuteInput(data, ownerWallet);
          })
          .then((input) =>
            expect(contract.execute(input)).to.emit(contract, 'TokenDeployed'),
          );
      });

      it('should not allow the previous owner to transfer ownership', () => {
        const newOwner = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('transferOwnership1')],
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
          .then(() => {
            const newOwner = '0x2e531e213004433c2f92592ABEf79228AACaedFa';
            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [id('transferOwnership2')],
                  ['transferOwnership'],
                  [defaultAbiCoder.encode(['address'], [newOwner])],
                ],
              ),
            );

            return getSignedExecuteInput(data, ownerWallet);
          })
          .then((input) =>
            expect(contract.execute(input)).to.not.emit(
              contract,
              'OwnershipTransferred',
            ),
          );
      });
    });

    describe('command transferOperatorship', () => {
      it('should not allow the operator to transfer operatorship', () => {
        const newOperator = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('transferOperatorship')],
              ['transferOperatorship'],
              [defaultAbiCoder.encode(['address'], [newOperator])],
            ],
          ),
        );

        return getSignedExecuteInput(data, operatorWallet).then((input) =>
          expect(contract.execute(input)).to.not.emit(
            contract,
            'OwnershipTransferred',
          ),
        );
      });

      it('should allow the owner to transfer operatorship', () => {
        const newOperator = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [id('transferOperatorship')],
              ['transferOperatorship'],
              [defaultAbiCoder.encode(['address'], [newOperator])],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet)
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'OperatorshipTransferred')
              .withArgs(operatorWallet.address, newOperator),
          )
          .then(() => contract.operator())
          .then((actual) => {
            expect(actual).to.eq(newOperator);
          })
          .then(() => contract.prevOperator())
          .then((actual) => {
            expect(actual).to.eq(operatorWallet.address);
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
