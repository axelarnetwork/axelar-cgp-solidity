'use strict';

const { Contract } = require('ethers');
const { deployUpgradable, upgradeUpgradable } = require('@axelar-network/axelar-gmp-sdk-solidity');
const IUpgradable = require('@axelar-network/axelar-gmp-sdk-solidity/dist/IUpgradable.json');

function getProxy(wallet, proxyAddress) {
    return new Contract(proxyAddress, IUpgradable.abi, wallet);
}

module.exports = {
    deployUpgradable,
    upgradeUpgradable,
    getProxy,
};
