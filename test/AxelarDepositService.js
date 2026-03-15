'use strict';

const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('AxelarDepositService', () => {
    it('should not have AxelarDepositService contract', async () => {
        await expect(ethers.getContractFactory('AxelarDepositService')).to.be.rejected;
    });

    it('should not have AxelarDepositServiceProxy contract', async () => {
        await expect(ethers.getContractFactory('AxelarDepositServiceProxy')).to.be.rejected;
    });

    it('should not have ReceiverImplementation contract', async () => {
        await expect(ethers.getContractFactory('ReceiverImplementation')).to.be.rejected;
    });
});
