'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { splitSignature },
} = require('ethers');
const { expect } = chai;

const CHAIN_ID = 1;

describe('MintableCappedERC20', () => {
    let owner;
    let user;
    let token;

    beforeEach(async () => {
        await ethers.provider.send('hardhat_reset');
        [owner, user] = await ethers.getSigners();

        const mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', owner);

        token = await mintableCappedERC20Factory.deploy('test', 'test', 16, 0).then((d) => d.deployed());

        await token.mint(user.address, 1000000);
    });

    describe('ERC20 Permit', () => {
        it('should should set allowance by verifying permit', async () => {
            const deadline = (1000 + Date.now() / 1000) | 0;

            const signature = splitSignature(
                await user._signTypedData(
                    {
                        name: 'test',
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
                        owner: user.address,
                        spender: owner.address,
                        value: 10000,
                        nonce: 0,
                        deadline,
                    },
                ),
            );

            await expect(token.permit(user.address, owner.address, 10000, deadline, signature.v, signature.r, signature.s))
                .to.emit(token, 'Approval')
                .withArgs(user.address, owner.address, 10000);
        });
    });
});
