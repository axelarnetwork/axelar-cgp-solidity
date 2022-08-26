'use strict';

const {
    Contract,
    ContractFactory,
    utils: { keccak256 },
} = require('ethers');
const { deployAndInitContractConstant } = require('axelar-utils-solidity');

const IUpgradable = require('../artifacts/contracts/interfaces/IUpgradable.sol/IUpgradable.json');

async function deployUpgradable(
    constAddressDeployerAddress,
    wallet,
    implementationJson,
    proxyJson,
    implementationParams = [],
    setupParams = '0x',
    key = Date.now(),
) {
    const implementationFactory = new ContractFactory(implementationJson.abi, implementationJson.bytecode, wallet);

    const implementation = await implementationFactory.deploy(...implementationParams);
    await implementation.deployed();

    const proxy = await deployAndInitContractConstant(
        constAddressDeployerAddress,
        wallet,
        proxyJson,
        key,
        [],
        [implementation.address, wallet.address, setupParams],
        6e5,
    );

    return new Contract(proxy.address, implementationJson.abi, wallet);
}

async function upgradeUpgradable(wallet, proxyAddress, contractJson, implementationParams = [], setupParams = '0x') {
    const proxy = new Contract(proxyAddress, IUpgradable.abi, wallet);

    const implementationFactory = new ContractFactory(contractJson.abi, contractJson.bytecode, wallet);

    const implementation = await implementationFactory.deploy(...implementationParams);
    await implementation.deployed();

    const implementationCode = await wallet.provider.getCode(implementation.address);
    const implementationCodeHash = keccak256(implementationCode);

    const tx = await proxy.upgrade(implementation.address, implementationCodeHash, setupParams);
    await tx.wait();
    return tx;
}

module.exports = {
    deployUpgradable,
    upgradeUpgradable,
};
