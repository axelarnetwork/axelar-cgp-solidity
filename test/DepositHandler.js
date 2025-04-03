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
        /* NOT TESTING AS DENCUN UPGRADE PREVENTS CALLING SELF DESTRUCT UNLESS IT HAPPENS IN THE SAME TX IN WHICH THE CONTRACT IS CREATED */

        // it('should destroy the contract and send ETH to destination', async function () {
        //     await owner.sendTransaction({ to: test.address, value: 10 }).then((tx) => tx.wait());
        //     await test.destroy(depositHandler.address).then((tx) => tx.wait());

        //     ////
        //     const userBalanceBefore = await ethers.provider.getBalance(user.address);
        //     const codeBeforeDestroy = await ethers.provider.getCode(depositHandler.address);
        //     console.log('Code before destroy:', codeBeforeDestroy.length > 0 ? 'Contract exists' : 'No contract');

        //     // Destroy the contract and wait for the transaction to be confirmed
        //     const destroyTx = await depositHandler.destroy(user.address);
        //     await destroyTx.wait(2); // Wait for more confirmations

        //     ////
        //     const userBalanceAfter = await ethers.provider.getBalance(user.address);
        //     console.log('Balance change:', userBalanceAfter.sub(userBalanceBefore).toString());
        //     expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(10);

        //     // Wait a moment for the node to reflect the contract destruction
        //     await new Promise((resolve) => setTimeout(resolve, 1000));

        //     // Also verify that the contract was destroyed
        //     const codeAfterDestroy = await ethers.provider.getCode(depositHandler.address);
        //     console.log('Code after destroy:', codeAfterDestroy);
        //     expect(codeAfterDestroy).to.equal('0x');
        // });

        it('should revert if locked (no reentrancy)', async function () {
            const data = depositHandler.interface.encodeFunctionData('destroy', [user.address]);
            await depositHandler.execute(depositHandler.address, data);
            await owner.sendTransaction({ to: test.address, value: 10 }).then((tx) => tx.wait());
            await test.destroy(depositHandler.address).then((tx) => tx.wait());

            ////
            const userBalanceBefore = await ethers.provider.getBalance(user.address);

            await depositHandler.execute(depositHandler.address, data);

            ////
            const userBalanceAfter = await ethers.provider.getBalance(user.address);
            expect(userBalanceAfter).to.equal(userBalanceBefore); // No change in balance

            // Also verify the contract code remains
            expect(await ethers.provider.getCode(depositHandler.address)).to.not.equal('0x');
        });
    });
});
