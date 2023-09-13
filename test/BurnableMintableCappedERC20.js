'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { splitSignature, keccak256 },
    constants: { MaxUint256, AddressZero },
} = ethers;
const { expect } = chai;
const { getChainId, isHardhat } = require('./utils');

describe('BurnableMintableCappedERC20', () => {
    let owner;
    let user;
    let token;

    beforeEach(async () => {
        if (isHardhat) {
            await ethers.provider.send('hardhat_reset');
        }

        [owner, user] = await ethers.getSigners();

        const burnableMintableCappedERC20Factory = await ethers.getContractFactory('BurnableMintableCappedERC20', owner);

        token = await burnableMintableCappedERC20Factory.deploy('test', 'test', 16, 10000000).then((d) => d.deployed());

        await token.mint(user.address, 1000000).then((tx) => tx.wait());
    });

    describe('Owner operations', () => {
        it('should revert on transfer ownership if called by non-owner', async () => {
            await expect(token.connect(user).transferOwnership(user.address)).to.be.revertedWithCustomError(token, 'NotOwner');
        });

        it('should revert on transfer ownership if new owner is invalid', async () => {
            await expect(token.connect(owner).transferOwnership(AddressZero)).to.be.revertedWithCustomError(token, 'InvalidOwner');
        });

        it('should transfer ownership', async () => {
            const initialOwner = await token.owner();
            expect(initialOwner).to.eq(owner.address);

            await expect(token.connect(owner).transferOwnership(user.address))
                .to.emit(token, 'OwnershipTransferred')
                .withArgs(owner.address, user.address);

            const finalOwner = await token.owner();
            expect(finalOwner).to.eq(user.address);
        });
    });

    describe('ERC20 Basics', () => {
        it('should increase and decrease allowance', async () => {
            const initialAllowance = await token.allowance(user.address, owner.address);
            expect(initialAllowance).to.eq(0);

            await expect(token.connect(user).increaseAllowance(owner.address, MaxUint256))
                .to.emit(token, 'Approval')
                .withArgs(user.address, owner.address, MaxUint256);

            const increasedAllowance = await token.allowance(user.address, owner.address);
            expect(increasedAllowance).to.eq(MaxUint256);

            await expect(token.connect(user).decreaseAllowance(owner.address, MaxUint256))
                .to.emit(token, 'Approval')
                .withArgs(user.address, owner.address, 0);

            const finalAllowance = await token.allowance(user.address, owner.address);
            expect(finalAllowance).to.eq(0);
        });

        it('should revert on approve with invalid owner or sender', async () => {
            await expect(token.connect(owner).transferFrom(AddressZero, owner.address, 0)).to.be.revertedWithCustomError(
                token,
                'InvalidAccount',
            );

            await expect(token.connect(user).increaseAllowance(AddressZero, MaxUint256)).to.be.revertedWithCustomError(
                token,
                'InvalidAccount',
            );
        });

        it('should transfer with max possible allowance', async () => {
            const initialAllowance = await token.allowance(user.address, owner.address);
            expect(initialAllowance).to.eq(0);

            await expect(token.connect(user).increaseAllowance(owner.address, MaxUint256))
                .to.emit(token, 'Approval')
                .withArgs(user.address, owner.address, MaxUint256);

            const increasedAllowance = await token.allowance(user.address, owner.address);
            expect(increasedAllowance).to.eq(MaxUint256);

            const amount = 100;

            await expect(token.connect(owner).transferFrom(user.address, owner.address, amount))
                .to.emit(token, 'Transfer')
                .withArgs(user.address, owner.address, amount);

            const finalAllowance = await token.allowance(user.address, owner.address);
            expect(finalAllowance).to.eq(MaxUint256);
        });

        it('should revert on transfer to invalid address', async () => {
            const initialAllowance = await token.allowance(user.address, owner.address);
            expect(initialAllowance).to.eq(0);

            await expect(token.connect(user).increaseAllowance(owner.address, MaxUint256))
                .to.emit(token, 'Approval')
                .withArgs(user.address, owner.address, MaxUint256);

            const increasedAllowance = await token.allowance(user.address, owner.address);
            expect(increasedAllowance).to.eq(MaxUint256);

            const amount = 100;

            await expect(token.connect(owner).transferFrom(user.address, AddressZero, amount)).to.be.revertedWithCustomError(
                token,
                'InvalidAccount',
            );
        });
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

        it('should revert if permit is expired', async () => {
            const deadline = 100;
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
            ).to.be.revertedWithCustomError(token, 'PermitExpired');
        });

        it('should revert if signature is incorrect', async () => {
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
                token.connect(owner).permit(user.address, owner.address, allowance, deadline, signature.v, signature.r, MaxUint256),
            ).to.be.revertedWithCustomError(token, 'InvalidS');

            await expect(
                token.connect(owner).permit(user.address, owner.address, allowance, deadline, 0, signature.r, signature.s),
            ).to.be.revertedWithCustomError(token, 'InvalidV');

            await expect(
                token.connect(owner).permit(owner.address, owner.address, allowance, deadline, signature.v, signature.r, signature.s),
            ).to.be.revertedWithCustomError(token, 'InvalidSignature');
        });
    });

    describe('ERC20 Mint', () => {
        it('should allow owner to mint', async () => {
            const amount = 10000;
            await expect(token.connect(owner).mint(user.address, amount))
                .to.emit(token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, user.address, amount);
        });

        it('should revert if non-owner mints', async () => {
            const amount = 10000;
            await expect(token.connect(user).mint(user.address, amount)).to.be.revertedWithCustomError(token, 'NotOwner');
        });

        it('should revert if total supply is greater than capacity', async () => {
            const amount = 1000000000;
            await expect(token.connect(owner).mint(user.address, amount)).to.be.revertedWithCustomError(token, 'CapExceeded');
        });

        it('should revert if account is invalid', async () => {
            const amount = 10000;
            await expect(token.connect(owner).mint(AddressZero, amount)).to.be.revertedWithCustomError(token, 'InvalidAccount');
        });
    });

    describe('ERC20 Burn', () => {
        it('should revert when non-owner calls either burn function', async () => {
            const salt = keccak256(0);

            await expect(token.connect(user).burn(salt)).to.be.revertedWithCustomError(token, 'NotOwner');
            await expect(token.connect(user).burnFrom(owner.address, 10)).to.be.revertedWithCustomError(token, 'NotOwner');
        });

        it('should revert on burn with an invalid address', async () => {
            const amount = 0;
            await expect(token.burnFrom(AddressZero, amount)).to.be.revertedWithCustomError(token, 'InvalidAccount');
        });

        it('should allow owner to burn', async () => {
            const amount = 10000;
            await expect(token.connect(owner).mint(user.address, amount))
                .to.emit(token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, user.address, amount);

            await token.connect(user).approve(owner.address, MaxUint256);

            await token.burnFrom(user.address, amount);

            const allowance = await token.allowance(user.address, owner.address);

            expect(allowance).to.eq(MaxUint256);
        });
    });
});
