'use strict';

const {
    Contract,
    ContractFactory,
    utils: { keccak256 },
} = require('ethers');
const { deployAndInitContractConstant, predictContractConstant } = require('axelar-utils-solidity');

const IUpgradable = require('../artifacts/contracts/interfaces/IUpgradable.sol/IUpgradable.json');

async function predictProxyAddress(
    constAddressDeployerAddress,
    wallet,
    proxyJson,
    key,
) {
    const proxyAddress = await predictContractConstant(
        constAddressDeployerAddress,
        wallet,
        proxyJson,
        key,
    );

    return proxyAddress;
}

async function deployUpgradable(
    constAddressDeployerAddress,
    wallet,
    implementationJson,
    proxyJson,
    implementationParams = [],
    setupParams = '0x',
    key = Date.now(),
    options = {},
) {
    const implementationFactory = new ContractFactory(implementationJson.abi, implementationJson.bytecode, wallet);

    const implementation = await implementationFactory.deploy(...implementationParams, options);
    await implementation.deployed();

    const proxy = await deployAndInitContractConstant(
        constAddressDeployerAddress,
        wallet,
        proxyJson,
        key,
        [],
        [implementation.address, wallet.address, setupParams],
        options.gasLimit || 5e6,
    );

    return new Contract(proxy.address, implementationJson.abi, wallet);
}

async function upgradeUpgradable(wallet, proxyAddress, contractJson, implementationParams = [], setupParams = '0x', options = {}) {
    const proxy = new Contract(proxyAddress, IUpgradable.abi, wallet);

    const implementationFactory = new ContractFactory(contractJson.abi, contractJson.bytecode, wallet);

    const implementation = await implementationFactory.deploy(...implementationParams, options);
    await implementation.deployed();

    const implementationCode = await wallet.provider.getCode(implementation.address);
    const implementationCodeHash = keccak256(implementationCode);

    const tx = await proxy.upgrade(implementation.address, implementationCodeHash, setupParams, options);
    await tx.wait();
    return tx;
}

function getProxy(wallet, proxyAddress) {
    return new Contract(proxyAddress, IUpgradable.abi, wallet);
}

module.exports = {
    predictProxyAddress,
    deployUpgradable,
    upgradeUpgradable,
    getProxy,
};
