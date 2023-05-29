'use strict';

const chai = require('chai');
const { ethers, network } = require('hardhat');
const {
    utils: { splitSignature },
} = ethers;
const { expect } = chai;
const { getChainId, isHardhat } = require('./utils');

describe('MintableCappedERC20', () => {
    let owner;
    let user;
    let token;

    beforeEach(async () => {
        if (isHardhat) {
            await ethers.provider.send('hardhat_reset');
        }

        [owner, user] = await ethers.getSigners();

        const mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', owner);

        token = await mintableCappedERC20Factory.deploy('test', 'test', 16, 0).then((d) => d.deployed());

        await token.mint(user.address, 1000000).then((tx) => tx.wait());
    });

    describe('ERC20 Permit', () => {
        it('should should set allowance by verifying permit', async () => {
            const deadline = (1000 + Date.now() / 1000) | 0;
            const allowance = 10000;

            const signature = splitSignature(
                await user._signTypedData(
                    {
                        name: 'test',
                        version: '1',
                        chainId: await getChainId(),
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
                        value: allowance,
                        nonce: 0,
                        deadline,
                    },
                ),
            );

            await expect(
                token.connect(owner).permit(user.address, owner.address, allowance, deadline, signature.v, signature.r, signature.s),
            )
                .to.emit(token, 'Approval')
                .withArgs(user.address, owner.address, allowance);

            expect(await token.nonces(user.address)).to.equal(1);

            await expect(token.connect(owner).transferFrom(user.address, owner.address, allowance))
                .to.emit(token, 'Transfer')
                .withArgs(user.address, owner.address, allowance);
        });
    });

    describe('ERC20 Mint', () => {
        it('should allow owner to mint', async () => {
            const amount = 10000;
            await expect(token.connect(owner).mint(user.address, amount))
                .to.emit(token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, user.address, amount);
        });
    });
});
