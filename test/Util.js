'use strict';

const chai = require('chai');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;

const UtilTest = require('../build/UtilTest.json');

const { it } = require('mocha');

describe('UtilTest', () => {
  const [ownerWallet] = new MockProvider().getWallets();
  let utilTest;

  beforeEach(async () => {
    utilTest = await deployContract(ownerWallet, UtilTest);
  });

  it('should convert address to lowercase string', async () => {
    const address = ownerWallet.address;
    expect(await utilTest.addressToString(address)).to.equal(
      address.toLowerCase(),
    );
  });

  it('should convert string of any format to address', async () => {
    const address = ownerWallet.address;
    expect(await utilTest.stringToAddress(address)).to.equal(address);
  });
});
