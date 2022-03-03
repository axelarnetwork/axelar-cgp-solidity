'use strict';

const chai = require('chai');
const {
  Contract,
  ContractFactory,
  utils: {
    defaultAbiCoder,
    id,
    arrayify,
    keccak256,
    getCreate2Address,
    randomBytes,
  },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ROLE_OWNER = 1;
const ROLE_OPERATOR = 2;

const AxelarGatewayProxySinglesig = require('../build/AxelarGatewayProxySinglesig.json');
const AxelarGatewaySinglesig = require('../build/AxelarGatewaySinglesig.json');
const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');
const MintableCappedERC20 = require('../build/MintableCappedERC20.json');
const DepositHandler = require('../build/DepositHandler.json');
const ExternalExecutor = require('../build/ExternalExecutor.json');
const TokenSwapper = require('../build/TokenSwapper.json');
const {
  bigNumberToNumber,
  getSignedExecuteInput,
  getRandomID,
} = require('./utils');
const { it } = require('mocha');

describe('AxelarGatewaySingleSig', () => {
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
    const proxy = await deployContract(
      ownerWallet,
      AxelarGatewayProxySinglesig,
      [params],
    );
    contract = new Contract(
      proxy.address,
      AxelarGatewaySinglesig.abi,
      ownerWallet,
    );
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

  describe('token transfer', () => {
    const name = 'An Awesome Token';
    const symbol = 'AAT';
    const decimals = 18;
    const cap = 1e8;
    const amount = 10000;

    let tokenContract;

    beforeEach(() => {
      const data = arrayify(
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
                [name, symbol, decimals, cap, ADDRESS_ZERO],
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
              ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
              [
                CHAIN_ID,
                ROLE_OWNER,
                [getRandomID()],
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
            ).to.be.revertedWith('IS_FROZEN'),
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
              tokenContract.transfer(ownerWallet.address, amount / 2),
            ).to.be.revertedWith('IS_FROZEN'),
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
            expect(tokenContract.transfer(ownerWallet.address, amount / 2))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(
                nonOwnerWallet.address,
                ownerWallet.address,
                amount / 2,
              ),
          )
          .then(() =>
            expect(
              contract.connect(adminWallet1).freezeAllTokens(),
            ).to.not.emit(contract, 'AllTokensFrozen'),
          )
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
              tokenContract.transfer(ownerWallet.address, amount / 2),
            ).to.be.revertedWith('IS_FROZEN'),
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
            expect(tokenContract.transfer(ownerWallet.address, amount / 2))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(
                nonOwnerWallet.address,
                ownerWallet.address,
                amount / 2,
              ),
          );
      });
    });
  });

  describe('upgrade', () => {
    it('should not allow admins to upgrade to a wrong implementation', async () => {
      const newImplementation = await deployContract(
        ownerWallet,
        AxelarGatewaySinglesig,
        [],
      );
      const wrongImplementationCodeHash = keccak256(
        `0x${AxelarGatewaySinglesig.bytecode}`,
      );
      const params = defaultAbiCoder.encode(
        ['address[]', 'uint8', 'address', 'address'],
        [
          [ownerWallet.address, operatorWallet.address],
          1,
          ownerWallet.address,
          operatorWallet.address,
        ],
      );

      return expect(
        contract
          .connect(adminWallet1)
          .upgrade(
            newImplementation.address,
            wrongImplementationCodeHash,
            params,
          ),
      )
        .to.not.emit(contract, 'Upgraded')
        .then(() =>
          expect(
            contract
              .connect(adminWallet2)
              .upgrade(
                newImplementation.address,
                wrongImplementationCodeHash,
                params,
              ),
          ).to.not.emit(contract, 'Upgraded'),
        )
        .then(() =>
          expect(
            contract
              .connect(adminWallet3)
              .upgrade(
                newImplementation.address,
                wrongImplementationCodeHash,
                params,
              ),
          ).to.be.revertedWith('INV_CODEHASH'),
        );
    });

    it('should allow admins to upgrade to the correct implementation', async () => {
      const newImplementation = await deployContract(
        ownerWallet,
        AxelarGatewaySinglesig,
        [],
      );
      const newImplementationCode = await newImplementation.provider.getCode(
        newImplementation.address,
      );
      const newImplementationCodeHash = keccak256(newImplementationCode);
      const params = defaultAbiCoder.encode(
        ['address[]', 'uint8', 'address', 'address'],
        [
          [ownerWallet.address, operatorWallet.address],
          1,
          ownerWallet.address,
          operatorWallet.address,
        ],
      );

      return expect(
        contract
          .connect(adminWallet1)
          .upgrade(
            newImplementation.address,
            newImplementationCodeHash,
            params,
          ),
      )
        .to.not.emit(contract, 'Upgraded')
        .then(() =>
          expect(
            contract
              .connect(adminWallet2)
              .upgrade(
                newImplementation.address,
                newImplementationCodeHash,
                params,
              ),
          ).to.not.emit(contract, 'Upgraded'),
        )
        .then(() =>
          expect(
            contract
              .connect(adminWallet3)
              .upgrade(
                newImplementation.address,
                newImplementationCodeHash,
                params,
              ),
          )
            .to.emit(contract, 'Upgraded')
            .withArgs(newImplementation.address),
        );
    });
  });

  describe('execute', () => {
    it('should fail if chain Id mismatches', () => {
      const data = arrayify(
        defaultAbiCoder.encode(
          ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
          [CHAIN_ID + 1, ROLE_OWNER, [], [], []],
        ),
      );

      return getSignedExecuteInput(data, ownerWallet).then((input) =>
        expect(contract.execute(input)).to.be.revertedWith('INV_CHAIN'),
      );
    });

    describe('command deployToken', () => {
      const name = 'An Awesome Token';
      const symbol = 'AAT';
      const decimals = 18;
      const cap = 10000;

      it('should not deploy the duplicate token', () => {
        const data = arrayify(
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
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
                ),
              ],
            ],
          ),
        );
        const secondTxData = arrayify(
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
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
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
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OPERATOR,
              [getRandomID()],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256', 'address'],
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
                ),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, operatorWallet).then((input) =>
          expect(contract.execute(input))
            .to.not.emit(contract, 'TokenDeployed')
            .and.to.not.emit(contract, 'Executed'),
        );
      });

      it('should deploy a new token', () => {
        const commandID = getRandomID();
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [commandID],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256', 'address'],
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
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
            expect(contract.execute(input))
              .to.emit(contract, 'TokenDeployed')
              .and.to.emit(contract, 'Executed')
              .withArgs(commandID),
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
              ['deployToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256', 'address'],
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
                ),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, ownerWallet).then((input) =>
          contract.execute(input),
        );
      });

      it('should not mint tokens if signer role is incorrect', async () => {
        const amount = 9999;
        const data = arrayify(
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
                  [symbol, nonOwnerWallet.address, amount],
                ),
              ],
            ],
          ),
        );

        return getSignedExecuteInput(data, operatorWallet)
          .then((input) =>
            expect(contract.execute(input)).to.not.emit(contract, 'Executed'),
          )
          .then(() => {
            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  ROLE_OPERATOR,
                  [getRandomID()],
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

            return getSignedExecuteInput(data, ownerWallet);
          })
          .then((input) =>
            expect(contract.execute(input)).to.not.emit(contract, 'Executed'),
          );
      });

      it('should allow the owner to mint tokens', async () => {
        const amount = 9999;
        const data = arrayify(
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
              .withArgs(ADDRESS_ZERO, nonOwnerWallet.address, amount)
              .and.to.emit(contract, 'Executed'),
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OPERATOR,
              [getRandomID()],
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
              .withArgs(ADDRESS_ZERO, nonOwnerWallet.address, amount)
              .and.to.emit(contract, 'Executed'),
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID(), getRandomID()],
              ['deployToken', 'mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256', 'address'],
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
              ['burnToken'],
              [defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt])],
            ],
          ),
        );
        const dataSecondBurn = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
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

        const depositHandlerAddress = getCreate2Address(
          contract.address,
          salt,
          keccak256(`0x${DepositHandler.bytecode}`),
        );

        const burnAmount = amount / 2;

        return tokenContract
          .transfer(depositHandlerAddress, burnAmount)
          .then(() => getSignedExecuteInput(dataFirstBurn, ownerWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() => tokenContract.transfer(depositHandlerAddress, burnAmount))
          .then(() => getSignedExecuteInput(dataSecondBurn, ownerWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() =>
            tokenContract
              .balanceOf(depositHandlerAddress)
              .then(bigNumberToNumber),
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OPERATOR,
              [getRandomID()],
              ['burnToken'],
              [defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt])],
            ],
          ),
        );
        const dataSecondBurn = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OPERATOR,
              [getRandomID()],
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

        const depositHandlerAddress = getCreate2Address(
          contract.address,
          salt,
          keccak256(`0x${DepositHandler.bytecode}`),
        );

        const burnAmount = amount / 2;

        return tokenContract
          .transfer(depositHandlerAddress, burnAmount)
          .then(() => getSignedExecuteInput(dataFirstBurn, operatorWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() => tokenContract.transfer(depositHandlerAddress, burnAmount))
          .then(() => getSignedExecuteInput(dataSecondBurn, operatorWallet))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(depositHandlerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() =>
            tokenContract
              .balanceOf(depositHandlerAddress)
              .then(bigNumberToNumber),
          )
          .then((actual) => {
            expect(actual).to.eq(0);
          });
      });
    });

    describe('command transferOwnership', () => {
      it('should not transferring ownership to address zero', () => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OPERATOR,
              [getRandomID()],
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

      it('should transfer ownership if transferring to a valid address', () => {
        const newOwner = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
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

      it('should allow the previous owner to deploy token', () => {
        const newOwner = '0xb7900E8Ec64A1D1315B6D4017d4b1dcd36E6Ea88';
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
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
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  ROLE_OWNER,
                  [getRandomID()],
                  ['deployToken'],
                  [
                    defaultAbiCoder.encode(
                      ['string', 'string', 'uint8', 'uint256', 'address'],
                      [name, symbol, decimals, cap, ADDRESS_ZERO],
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
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
                ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  ROLE_OWNER,
                  [getRandomID()],
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OPERATOR,
              [getRandomID()],
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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID()],
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
          });
      });
    });

    describe('batch commands', () => {
      it('should support external ERC20 token', () => {
        const name = 'test';
        const symbol = 'test';
        const decimals = 16;
        const capacity = 0;

        return deployContract(ownerWallet, MintableCappedERC20, [
          name,
          symbol,
          decimals,
          capacity,
        ]).then(async (token) => {
          const amount = 10000;
          await token.mint(nonOwnerWallet.address, amount);

          const deployTokenData = arrayify(
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
                    [name, symbol, decimals, capacity, token.address],
                  ),
                ],
              ],
            ),
          );
          await getSignedExecuteInput(deployTokenData, ownerWallet).then(
            (input) =>
              expect(contract.execute(input))
                .to.emit(contract, 'TokenDeployed')
                .withArgs(symbol, token.address),
          );

          const salt = randomBytes(32);
          const depositHandlerAddress = getCreate2Address(
            contract.address,
            salt,
            keccak256(`0x${DepositHandler.bytecode}`),
          );
          await token
            .connect(nonOwnerWallet)
            .transfer(depositHandlerAddress, amount);

          const burnTokenData = arrayify(
            defaultAbiCoder.encode(
              ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
              [
                CHAIN_ID,
                ROLE_OWNER,
                [getRandomID()],
                ['burnToken'],
                [defaultAbiCoder.encode(['string', 'bytes32'], [symbol, salt])],
              ],
            ),
          );
          await getSignedExecuteInput(burnTokenData, ownerWallet).then(
            (input) =>
              expect(contract.execute(input))
                .to.emit(token, 'Transfer')
                .withArgs(depositHandlerAddress, contract.address, amount),
          );

          const mintTokenData = arrayify(
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
                    [symbol, ownerWallet.address, amount],
                  ),
                ],
              ],
            ),
          );
          await getSignedExecuteInput(mintTokenData, ownerWallet).then(
            (input) =>
              expect(contract.execute(input))
                .to.emit(token, 'Transfer')
                .withArgs(contract.address, ownerWallet.address, amount),
          );
        });
      });

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
            ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              ROLE_OWNER,
              [getRandomID(), getRandomID(), getRandomID(), getRandomID()],
              ['deployToken', 'mintToken', 'mintToken', 'transferOwnership'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256', 'address'],
                  [name, symbol, decimals, cap, ADDRESS_ZERO],
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

  describe('external contract execution', () => {
    it('should approve to call external TokenSwapper contract', async () => {
      const nameA = 'testA';
      const symbolA = 'testA';
      const nameB = 'testB';
      const symbolB = 'testB';
      const decimals = 16;
      const capacity = 0;

      const tokenA = await deployContract(ownerWallet, MintableCappedERC20, [
        nameA,
        symbolA,
        decimals,
        capacity,
      ]);

      const tokenB = await deployContract(ownerWallet, MintableCappedERC20, [
        nameB,
        symbolB,
        decimals,
        capacity,
      ]);

      const swapper = await deployContract(ownerWallet, TokenSwapper, [
        tokenA.address,
        tokenB.address,
      ]);

      const executor = await deployContract(ownerWallet, ExternalExecutor, [
        contract.address,
        swapper.address,
      ]);

      await tokenA.mint(contract.address, 1e6);
      await tokenB.mint(swapper.address, 1e6);

      const deployTokenData = arrayify(
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
                [nameA, symbolA, decimals, capacity, tokenA.address],
              ),
            ],
          ],
        ),
      );

      await getSignedExecuteInput(deployTokenData, ownerWallet).then((input) =>
        expect(contract.execute(input))
          .to.emit(contract, 'TokenDeployed')
          .withArgs(symbolA, tokenA.address),
      );

      const payload = [tokenB.address, nonOwnerWallet.address, 1];
      const payloadHash = keccak256(
        defaultAbiCoder.encode(['address', 'address', 'uint256'], payload),
      );
      const swapAmount = 20000;

      const mintAndApproveData = arrayify(
        defaultAbiCoder.encode(
          ['uint256', 'uint256', 'bytes32[]', 'string[]', 'bytes[]'],
          [
            CHAIN_ID,
            ROLE_OWNER,
            [getRandomID()],
            ['mintTokenAndApproveContractCall'],
            [
              defaultAbiCoder.encode(
                ['string', 'address', 'uint256', 'bytes32'],
                [symbolA, executor.address, swapAmount, payloadHash],
              ),
            ],
          ],
        ),
      );

      const approveExecute = await contract.execute(
        await getSignedExecuteInput(mintAndApproveData, ownerWallet),
      );

      await expect(approveExecute)
        .to.emit(tokenA, 'Transfer')
        .withArgs(contract.address, executor.address, swapAmount);

      await expect(approveExecute)
        .to.emit(contract, 'ContractCallApprovedWithMint')
        .withArgs(executor.address, payloadHash, tokenA.address, 20000);

      const swap = await executor.swapToken(
        tokenA.address,
        swapAmount,
        ...payload,
      );

      await expect(swap)
        .to.emit(tokenB, 'Transfer')
        .withArgs(swapper.address, nonOwnerWallet.address, swapAmount * 2);
    });
  });
});
