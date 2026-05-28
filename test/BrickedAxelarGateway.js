'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { keccak256, defaultAbiCoder },
} = ethers;
const { expect } = chai;
const { expectRevert } = require('./utils');

describe('BrickedAxelarGateway', () => {
    let owner;
    let bricked;

    before(async () => {
        [owner] = await ethers.getSigners();

        const factory = await ethers.getContractFactory('BrickedAxelarGateway', owner);
        bricked = await factory.deploy();
        await bricked.deployTransaction.wait();
    });

    it('contractId() returns keccak256("axelar-gateway")', async () => {
        expect(await bricked.contractId()).to.eq(keccak256(ethers.utils.toUtf8Bytes('axelar-gateway')));
    });

    it('setup(bytes) is a no-op (does not revert)', async () => {
        await expect(bricked.setup('0x1234')).to.not.be.reverted;
        await expect(bricked.setup('0x')).to.not.be.reverted;
    });

    it('reverts with Bricked on an unknown selector', async () => {
        const unknownCalldata = '0xdeadbeef';
        await expectRevert(
            (gasOptions) => owner.sendTransaction({ to: bricked.address, data: unknownCalldata, ...gasOptions }),
            bricked,
            'Bricked',
        );
    });

    it('reverts with Bricked on governance() call', async () => {
        const calldata = ethers.utils.id('governance()').slice(0, 10);
        await expectRevert(
            (gasOptions) => owner.sendTransaction({ to: bricked.address, data: calldata, ...gasOptions }),
            bricked,
            'Bricked',
        );
    });

    it('reverts with Bricked on callContract', async () => {
        const calldata = ethers.utils.defaultAbiCoder.encode(['string', 'string', 'bytes'], ['dst', 'addr', '0x']).slice(2);
        const selector = ethers.utils.id('callContract(string,string,bytes)').slice(0, 10);
        await expectRevert(
            (gasOptions) => owner.sendTransaction({ to: bricked.address, data: selector + calldata, ...gasOptions }),
            bricked,
            'Bricked',
        );
    });

    it('reverts with Bricked on execute', async () => {
        const selector = ethers.utils.id('execute(bytes)').slice(0, 10);
        const data = defaultAbiCoder.encode(['bytes'], ['0x00']).slice(2);
        await expectRevert(
            (gasOptions) => owner.sendTransaction({ to: bricked.address, data: selector + data, ...gasOptions }),
            bricked,
            'Bricked',
        );
    });

    it('rejects native value (contract does not accept ETH)', async () => {
        await expect(owner.sendTransaction({ to: bricked.address, value: 1 })).to.be.reverted;
    });
});
