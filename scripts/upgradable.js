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

if (require.main === module) {
    const url = process.env.URL;
    const privKey = process.env.PRIVATE_KEY;
    const constAddressDeployerAddress = process.env.CONST_ADDRESS_DEPLOYER;
    const gatewayAddress = process.env.GATEWAY_ADDRESS;
    const tokenSymbol = process.env.TOKEN_SYMBOL;
    const key = process.env.SALT_KEY;

    printObj({
        'environment_variables:': {
            CONTRACTS_PATH: contractsPath || null,
            PREFIX: prefix || null,
            CHAIN: chain || null,
            URL: url || null,
            PRIVATE_KEY: privKey || null,
            ADMIN_THRESHOLD: adminThreshold || null,
        },
    });

    if (!(prefix && chain && url && privKey && adminThreshold)) {
        console.error(
            `One or more of the required environment variable not defined. Make sure to declare these variables in an .env file.`,
        );
        process.exit(1);
    }
    const provider = new JsonRpcProvider(url);
    const wallet = new Wallet(privKey, provider);

    deployDepositService(constAddressDeployerAddress, gatewayAddress, tokenSymbol, wallet, key);
}
