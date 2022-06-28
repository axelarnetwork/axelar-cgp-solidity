'use strict';

const {
    Contract,
    utils: { keccak256 },
} = require('ethers');
const { deployContract } = require('ethereum-waffle');
const { deployAndInitContractConstant } = require('axelar-utils-solidity');

const IUpgradable = require('../artifacts/contracts/interfaces/IUpgradable.sol/IUpgradable.json');

async function deployUpgradable(constAddressDeployerAddress, wallet, implementationJson, proxyJson, setupParams = '0x', key = null) {
    key = key || new Date();

    const implementation = await deployContract(wallet, implementationJson);

    const proxy = await deployAndInitContractConstant(
        constAddressDeployerAddress,
        wallet,
        proxyJson,
        key,
        [],
        [implementation.address, wallet.address, setupParams],
    );

    return new Contract(proxy.address, implementationJson.abi, wallet);
}

async function upgradeUpgradable(proxyAddress, contractJson, setupParams, wallet) {
    const proxy = new Contract(proxyAddress, IUpgradable.abi, wallet);

    const newImplementation = await deployContract(wallet, contractJson);
    const newImplementationCode = await wallet.provider.getCode(newImplementation.address);
    const newImplementationCodeHash = keccak256(newImplementationCode);

    const tx = await proxy.upgrade(newImplementation.address, newImplementationCodeHash, setupParams);
    await tx.wait();
    return tx;
}

module.exports = {
    deployUpgradable,
    upgradeUpgradable,
};
