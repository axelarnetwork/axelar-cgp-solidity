'use strict';

const {
    utils: { defaultAbiCoder },
} = require('ethers');
const { ethers } = require('hardhat');
const { expectRevert } = require('./utils');
const { expect } = require('chai');

describe('Proxy', async () => {
    let owner, user;

    let proxyFactory;
    let proxy;

    let proxyImplementationFactory;
    let proxyImplementation;

    let invalidProxyImplementationFactory;
    let invalidProxyImplementation;

    before(async () => {
        [owner, user] = await ethers.getSigners();

        proxyFactory = await ethers.getContractFactory('TestProxy', owner);

        proxyImplementationFactory = await ethers.getContractFactory('TestImplementation', owner);

        invalidProxyImplementationFactory = await ethers.getContractFactory('InvalidTestImplementation', owner);
    });

    beforeEach(async () => {
        proxy = await proxyFactory.deploy().then((d) => d.deployed());

        proxyImplementation = await proxyImplementationFactory.deploy().then((d) => d.deployed());
    });

    it('should revert if non-owner calls init', async () => {
        await expectRevert(
            (gasOptions) => proxy.connect(user).init(proxyImplementation.address, user.address, '0x', gasOptions),
            proxy,
            'NotOwner',
        );
    });

    it('should revert if proxy is already initialized', async () => {
        const val = 10;
        const name = 'test';
        const setupParams = defaultAbiCoder.encode(['uint256', 'string'], [val, name]);

        await proxy.init(proxyImplementation.address, owner.address, setupParams).then((tx) => tx.wait());

        await expectRevert(
            (gasOptions) => proxy.init(proxyImplementation.address, owner.address, setupParams, gasOptions),
            proxy,
            'AlreadyInitialized',
        );
    });

    it('should revert if setup fails', async () => {
        const setupParams = '0x00';

        await expectRevert(
            (gasOptions) => proxy.init(proxyImplementation.address, owner.address, setupParams, gasOptions),
            proxy,
            'SetupFailed',
        );
    });

    it('should revert with invalid contract ID', async () => {
        invalidProxyImplementation = await invalidProxyImplementationFactory.deploy().then((d) => d.deployed());

        await expectRevert(
            (gasOptions) => proxy.init(invalidProxyImplementation.address, owner.address, '0x', gasOptions),
            proxy,
            'InvalidImplementation',
        );
    });

    it('should revert if native value is sent to the proxy', async () => {
        const value = 10;

        await expectRevert(
            (gasOptions) =>
                owner.sendTransaction({
                    to: proxy.address,
                    value,
                    ...gasOptions,
                }),
            proxy,
            'EtherNotAccepted',
        );
    });

    it('should be a no-op if setup is called', async () => {
        await expect(proxy.setup('0x')).to.not.be.reverted;
    })
});
