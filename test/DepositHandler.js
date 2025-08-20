'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const { expect } = chai;
const { expectRevert } = require('./utils');

describe('DepositHandler', function () {
    let depositHandlerFactory;
    let depositHandler;

    let testFactoy;
    let test;

    let owner;
    let user;

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();

        depositHandlerFactory = await ethers.getContractFactory('DepositHandler');
        depositHandler = await depositHandlerFactory.deploy().then((d) => d.deployed());

        testFactoy = await ethers.getContractFactory('TestDepositHandler');
        test = await testFactoy.deploy().then((d) => d.deployed());
    });

    describe('execute', function () {
        it('should execute function call on another contract', async function () {
            const data = test.interface.encodeFunctionData('test');

            await expect(depositHandler.execute(test.address, data)).to.emit(test, 'Called');
        });

        it('should revert if callee is not a contract', async function () {
            await expectRevert((gasOptions) => depositHandler.execute(user.address, '0x', gasOptions), depositHandler, 'NotContract');
        });

        it('should revert if locked (no reentrancy)', async function () {
            const testData = test.interface.encodeFunctionData('test');
            const data = depositHandler.interface.encodeFunctionData('execute', [test.address, testData]);

            await expect(depositHandler.execute(depositHandler.address, data)).to.not.emit(test, 'Called');
        });
    });

    describe('destroy', function () {
        it('should destroy the contract and send ETH to destination', async function () {
            await owner.sendTransaction({ to: test.address, value: 10 }).then((tx) => tx.wait());
            await test.destroy(depositHandler.address).then((tx) => tx.wait());

            await expect(depositHandler.destroy(user.address)).to.changeEtherBalance(user, 10);

            expect(await ethers.provider.getCode(depositHandler.address)).to.equal('0x');
        });

        it('should revert if locked (no reentrancy)', async function () {
            const data = depositHandler.interface.encodeFunctionData('destroy', [user.address]);
            await depositHandler.execute(depositHandler.address, data);
            await owner.sendTransaction({ to: test.address, value: 10 }).then((tx) => tx.wait());
            await test.destroy(depositHandler.address).then((tx) => tx.wait());

            const userBalanceBefore = await ethers.provider.getBalance(user.address);

            await depositHandler.execute(depositHandler.address, data);

            const userBalanceAfter = await ethers.provider.getBalance(user.address);
            expect(userBalanceAfter).to.equal(userBalanceBefore);

            expect(await ethers.provider.getCode(depositHandler.address)).to.not.equal('0x');
        });
    });
});
