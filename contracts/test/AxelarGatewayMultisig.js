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

const AxelarGatewayProxyMultisig = require('../build/AxelarGatewayProxyMultisig.json');
const AxelarGatewayMultisig = require('../build/AxelarGatewayMultisig.json');
const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');
const Burner = require('../build/Burner.json');
const {
  bigNumberToNumber,
  getSignedMultisigExecuteInput,
  getRandomInt,
  getRandomID,
} = require('./utils');

describe('AxelarGatewayMultisig', () => {
  const wallets = new MockProvider().getWallets();
  const owners = wallets.slice(0, 3);
  const operators = wallets.slice(3, 6);
  const admins = wallets.slice(6, 9);
  const threshold = 2;

  let contract;

  beforeEach(async () => {
    const params = arrayify(
      defaultAbiCoder.encode(
        ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
        [
          admins.map(get('address')),
          threshold,
          owners.map(get('address')),
          threshold,
          operators.map(get('address')),
          threshold,
        ],
      ),
    );
    const proxy = await deployContract(wallets[0], AxelarGatewayProxyMultisig, [
      params,
    ]);
    contract = new Contract(
      proxy.address,
      AxelarGatewayMultisig.abi,
      wallets[0],
    );
  });

  describe('owners', () => {
    it('should get correct owners', () =>
      contract.owners().then((actual) => {
        expect(actual).to.deep.eq(owners.map(get('address')));
      }));
  });

  describe('operators', () => {
    it('should get correct operators', () =>
      contract.operators().then((actual) => {
        expect(actual).to.deep.eq(operators.map(get('address')));
      }));
  });

  describe('upgrade', () => {
    it('should allow admins to upgrade implementation', async () => {
      const newImplementation = await deployContract(
        wallets[0],
        AxelarGatewayMultisig,
        [],
      );
      const params = arrayify(
        defaultAbiCoder.encode(
          ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
          [
            owners.map(get('address')),
            threshold,
            owners.slice(0, 2).map(get('address')),
            threshold,
            operators.slice(0, 2).map(get('address')),
            threshold,
          ],
        ),
      );

      return expect(
        contract.connect(admins[0]).upgrade(newImplementation.address, params),
      )
        .to.not.emit(contract, 'Upgraded')
        .then(() =>
          expect(
            contract
              .connect(admins[2])
              .upgrade(newImplementation.address, params),
          )
            .to.emit(contract, 'Upgraded')
            .withArgs(newImplementation.address),
        );
    });
  });

  describe('execute', () => {
    describe('command deployToken', () => {
      it('should allow owners to deploy a new token', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
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

        return getSignedMultisigExecuteInput(data, owners.slice(1, 3))
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
              wallets[0],
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

      it('should not allow operators to deploy a new token', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 10000;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
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

        return getSignedMultisigExecuteInput(
          data,
          operators.slice(1, 3),
        ).then((input) =>
          expect(contract.execute(input)).to.not.emit(
            contract,
            'TokenDeployed',
          ),
        );
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
              [getRandomID()],
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

        return getSignedMultisigExecuteInput(
          data,
          owners.slice(1, 3),
        ).then((input) => contract.execute(input));
      });

      it('should allow the owners to mint tokens', async () => {
        const amount = getRandomInt(cap);
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
              ['mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, wallets[0].address, amount],
                ),
              ],
            ],
          ),
        );

        const tokenAddress = await contract.tokenAddresses(symbol);
        const tokenContract = new Contract(
          tokenAddress,
          BurnableMintableCappedERC20.abi,
          wallets[0],
        );

        return getSignedMultisigExecuteInput(data, wallets.slice(0, 2))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(ADDRESS_ZERO, wallets[0].address, amount),
          )
          .then(() =>
            tokenContract.balanceOf(wallets[0].address).then(bigNumberToNumber),
          )
          .then((actual) => {
            expect(actual).to.eq(amount);
          });
      });

      it('should allow the operators to mint tokens', async () => {
        const amount = getRandomInt(cap);
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
              ['mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, wallets[0].address, amount],
                ),
              ],
            ],
          ),
        );

        const tokenAddress = await contract.tokenAddresses(symbol);
        const tokenContract = new Contract(
          tokenAddress,
          BurnableMintableCappedERC20.abi,
          wallets[0],
        );

        return getSignedMultisigExecuteInput(data, operators.slice(1, 3))
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(ADDRESS_ZERO, wallets[0].address, amount),
          )
          .then(() =>
            tokenContract.balanceOf(wallets[0].address).then(bigNumberToNumber),
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
      const cap = 1e8;
      const amount = 100;

      beforeEach(() => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID(), getRandomID()],
              ['deployToken', 'mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, wallets[0].address, amount],
                ),
              ],
            ],
          ),
        );

        return getSignedMultisigExecuteInput(
          data,
          owners.slice(1, 3),
        ).then((input) => contract.execute(input));
      });

      it('should allow the owners to burn tokens', async () => {
        const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
        const salt = id(
          `${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`,
        );

        const dataFirstBurn = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
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
          wallets[0],
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

        // This is simpler.
        // const burnerAddress = await tokenContract.depositAddress(salt);

        const burnAmount = amount / 2;

        return tokenContract
          .transfer(burnerAddress, burnAmount)
          .then(() =>
            getSignedMultisigExecuteInput(dataFirstBurn, owners.slice(0, 2)),
          )
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() => tokenContract.transfer(burnerAddress, burnAmount))
          .then(() =>
            getSignedMultisigExecuteInput(dataSecondBurn, owners.slice(1, 3)),
          )
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

      it('should allow the operators to burn tokens', async () => {
        const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
        const salt = id(
          `${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`,
        );

        const dataFirstBurn = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
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
          wallets[0],
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

        // This is simpler.
        // const burnerAddress = await tokenContract.depositAddress(salt);

        const burnAmount = amount / 2;

        return tokenContract
          .transfer(burnerAddress, burnAmount)
          .then(() =>
            getSignedMultisigExecuteInput(dataFirstBurn, operators.slice(0, 2)),
          )
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, burnAmount),
          )
          .then(() => tokenContract.transfer(burnerAddress, burnAmount))
          .then(() =>
            getSignedMultisigExecuteInput(
              dataSecondBurn,
              operators.slice(1, 3),
            ),
          )
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
      it('should owners to transfer ownership', () => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
              ['transferOwnership'],
              [
                defaultAbiCoder.encode(
                  ['address[]', 'uint8'],
                  [operators.map(get('address')), threshold],
                ),
              ],
            ],
          ),
        );

        return getSignedMultisigExecuteInput(data, owners)
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'OwnershipTransferred')
              .withArgs(
                owners.map(get('address')),
                threshold,
                operators.map(get('address')),
                threshold,
              ),
          )
          .then(() => contract.owners())
          .then((actual) => {
            expect(actual).to.deep.eq(operators.map(get('address')));
          });
      });

      it('should allow previous owners to burn tokens', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 1e8;
        const amount = 100;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID(), getRandomID()],
              ['deployToken', 'mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, wallets[0].address, amount],
                ),
              ],
            ],
          ),
        );

        return getSignedMultisigExecuteInput(data, owners.slice(1, 3))
          .then((input) => contract.execute(input))
          .then(() => {
            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [getRandomID()],
                  ['transferOwnership'],
                  [
                    defaultAbiCoder.encode(
                      ['address[]', 'uint8'],
                      [operators.map(get('address')), threshold],
                    ),
                  ],
                ],
              ),
            );

            return getSignedMultisigExecuteInput(data, owners);
          })
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'OwnershipTransferred')
              .withArgs(
                owners.map(get('address')),
                threshold,
                operators.map(get('address')),
                threshold,
              ),
          )
          .then(() => contract.owners())
          .then((actual) => {
            expect(actual).to.deep.eq(operators.map(get('address')));
          })
          .then(async () => {
            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(
              `${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`,
            );

            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [getRandomID()],
                  ['burnToken'],
                  [
                    defaultAbiCoder.encode(
                      ['string', 'bytes32'],
                      [symbol, salt],
                    ),
                  ],
                ],
              ),
            );

            const tokenAddress = await contract.tokenAddresses(symbol);
            const tokenContract = new Contract(
              tokenAddress,
              BurnableMintableCappedERC20.abi,
              wallets[0],
            );

            const burnerFactory = new ContractFactory(
              Burner.abi,
              Burner.bytecode,
            );
            const { data: burnerInitCode } = burnerFactory.getDeployTransaction(
              tokenAddress,
              salt,
            );
            const burnerAddress = getCreate2Address(
              contract.address,
              salt,
              keccak256(burnerInitCode),
            );

            // This is simpler.
            // const burnerAddress = await tokenContract.depositAddress(salt);

            await tokenContract.transfer(burnerAddress, amount);
            const input = await getSignedMultisigExecuteInput(
              data,
              owners.slice(0, 2),
            );

            await expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, amount);
          });
      });
    });

    describe('command transferOperatorship', () => {
      it('should owners to transfer operatorship', () => {
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID()],
              ['transferOperatorship'],
              [
                defaultAbiCoder.encode(
                  ['address[]', 'uint8'],
                  [owners.map(get('address')), threshold],
                ),
              ],
            ],
          ),
        );

        return getSignedMultisigExecuteInput(data, owners)
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'OperatorshipTransferred')
              .withArgs(
                operators.map(get('address')),
                threshold,
                owners.map(get('address')),
                threshold,
              ),
          )
          .then(() => contract.operators())
          .then((actual) => {
            expect(actual).to.deep.eq(owners.map(get('address')));
          });
      });

      it('should allow previous operators to burn tokens', () => {
        const name = 'An Awesome Token';
        const symbol = 'AAT';
        const decimals = 18;
        const cap = 1e8;
        const amount = 100;
        const data = arrayify(
          defaultAbiCoder.encode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            [
              CHAIN_ID,
              [getRandomID(), getRandomID()],
              ['deployToken', 'mintToken'],
              [
                defaultAbiCoder.encode(
                  ['string', 'string', 'uint8', 'uint256'],
                  [name, symbol, decimals, cap],
                ),
                defaultAbiCoder.encode(
                  ['string', 'address', 'uint256'],
                  [symbol, wallets[0].address, amount],
                ),
              ],
            ],
          ),
        );

        return getSignedMultisigExecuteInput(data, owners.slice(1, 3))
          .then((input) => contract.execute(input))
          .then(() => {
            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [getRandomID()],
                  ['transferOperatorship'],
                  [
                    defaultAbiCoder.encode(
                      ['address[]', 'uint8'],
                      [owners.map(get('address')), threshold],
                    ),
                  ],
                ],
              ),
            );

            return getSignedMultisigExecuteInput(data, owners);
          })
          .then((input) =>
            expect(contract.execute(input))
              .to.emit(contract, 'OperatorshipTransferred')
              .withArgs(
                operators.map(get('address')),
                threshold,
                owners.map(get('address')),
                threshold,
              ),
          )
          .then(() => contract.operators())
          .then((actual) => {
            expect(actual).to.deep.eq(owners.map(get('address')));
          })
          .then(async () => {
            const destinationBtcAddress = '1KDeqnsTRzFeXRaENA6XLN1EwdTujchr4L';
            const salt = id(
              `${destinationBtcAddress}-${wallets[0].address}-${Date.now()}`,
            );

            const data = arrayify(
              defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                  CHAIN_ID,
                  [getRandomID()],
                  ['burnToken'],
                  [
                    defaultAbiCoder.encode(
                      ['string', 'bytes32'],
                      [symbol, salt],
                    ),
                  ],
                ],
              ),
            );

            const tokenAddress = await contract.tokenAddresses(symbol);
            const tokenContract = new Contract(
              tokenAddress,
              BurnableMintableCappedERC20.abi,
              wallets[0],
            );

            const burnerFactory = new ContractFactory(
              Burner.abi,
              Burner.bytecode,
            );
            const { data: burnerInitCode } = burnerFactory.getDeployTransaction(
              tokenAddress,
              salt,
            );
            const burnerAddress = getCreate2Address(
              contract.address,
              salt,
              keccak256(burnerInitCode),
            );

            // This is simpler.
            // const burnerAddress = await tokenContract.depositAddress(salt);

            await tokenContract.transfer(burnerAddress, amount);
            const input = await getSignedMultisigExecuteInput(
              data,
              operators.slice(1, 3),
            );

            await expect(contract.execute(input))
              .to.emit(tokenContract, 'Transfer')
              .withArgs(burnerAddress, ADDRESS_ZERO, amount);
          });
      });
    });
  });
});
