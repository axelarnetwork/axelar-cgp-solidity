'use strict';

const {
  Contract,
  utils: { defaultAbiCoder, splitSignature, arrayify },
} = require('ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
const { get } = require("lodash/fp");
const chai = require('chai');
chai.use(solidity);
const { expect } = chai;

const CHAIN_ID = 1;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ROLE_OWNER = 1;

const BurnableMintableCappedERC20 = require('../build/BurnableMintableCappedERC20.json');

const AxelarGatewayProxyMultisig = require("../build/AxelarGatewayProxyMultisig.json");
const AxelarGatewayMultisig = require("../build/AxelarGatewayMultisig.json");
const {getRandomID, getSignedMultisigExecuteInput} = require("./utils");

describe('BurnableMintableCappedERC20', () => {
  const wallets = new MockProvider().getWallets();
  const owners = wallets.slice(0, 3);
  const operators = wallets.slice(3, 6);
  const admins = wallets.slice(6, 9);
  const threshold = 2;

  const ownerWallet = owners[0]
  const userWallet = admins[0]

  const tokenName = 'Test Token';
  const tokenSymbol = 'TEST';
  let gateway;
  let token;

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
    gateway = new Contract(
      proxy.address,
      AxelarGatewayMultisig.abi,
      wallets[0],
    );

    const decimals = 18;
    const cap = 1e9

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
              [tokenName, tokenSymbol, decimals, cap, ADDRESS_ZERO],
            ),
            defaultAbiCoder.encode(
              ['string', 'address', 'uint256'],
              [tokenSymbol, userWallet.address, 1e6],
            ),
          ],
        ],
      ),
    );
    await gateway.execute(await getSignedMultisigExecuteInput(data, owners.slice(1, 3)))

    const tokenAddress = await gateway.tokenAddresses(tokenSymbol)
    token = new Contract(
      tokenAddress,
      BurnableMintableCappedERC20.abi,
      wallets[0],
    );
  });

  describe('burning from account with given approve', () => {
    it('gateway should burnFrom address', async () => {
      const issuer = userWallet.address;
      const spender = gateway.address;
      const amount = 1000;

      await expect(await token.connect(userWallet).approve(spender, amount))
        .to.emit(token, 'Approval')
        .withArgs(issuer, spender, amount);

      await expect(await gateway.connect(userWallet).sendToken(2, ownerWallet.address, tokenSymbol, amount))
        .to.emit(token, 'Transfer')
        .withArgs(issuer, ADDRESS_ZERO, amount);
    });
  });
  describe('EIP-2612: approve permit', () => {
    it('should should set allowance by verifying permit', async () => {
      const issuer = userWallet.address;
      const spender = ownerWallet.address;
      const amount = 10000;
      const nonce = 0;
      const deadline = (1000 + Date.now() / 1000) | 0;

      const signature = splitSignature(
        await userWallet._signTypedData(
          {
            name: tokenName,
            version: '1',
            chainId: CHAIN_ID,
            verifyingContract: token.address,
          },
          {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          {
            owner: issuer,
            spender,
            value: amount,
            nonce,
            deadline,
          },
        ),
      );

      await expect(
        await token.permit(
          issuer,
          spender,
          amount,
          deadline,
          signature.v,
          signature.r,
          signature.s,
        ),
      )
        .to.emit(token, 'Approval')
        .withArgs(issuer, spender, amount);
    });
  });
});
