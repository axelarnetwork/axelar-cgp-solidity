'use strict';
require('dotenv').config();
const { Wallet, getDefaultProvider } = require('ethers');
const { deployUpgradable, upgradeUpgradable } = require('./upgradable');
const readlineSync = require('readline-sync');
const { outputJsonSync } = require('fs-extra');
const { defaultAbiCoder } = require('ethers/lib/utils');

function getImplementationArgs(contractName, chain) {
    if (contractName === 'AxelarGasService') return [chain.gasCollector];
    if (contractName === 'AxelarDepositService') return [];
    throw new Error(`${contractName} is not supported.`);
}

function getInitArgs(contractName, chain) {
    if (contractName === 'AxelarGasService') return '0x';
    if (contractName === 'AxelarDepositService') return defaultAbiCoder.encode(['address', 'string'], [chain.gateway, chain.wrappedSymbol]);
    throw new Error(`${contractName} is not supported.`);
}

function getUpgradeArgs(contractName, chain) {
    if (contractName === 'AxelarGasService') return '0x';
    if (contractName === 'AxelarDepositService') return '0x';
    throw new Error(`${contractName} is not supported.`);
}

async function deploy(env, chains, wallet, artifactPath, contractName, deployTo) {
    const setJSON = (data, name) => {
        outputJsonSync(name, data, {
            spaces: 2,
            EOL: '\n',
        });
    };

    const implementationPath = artifactPath + contractName + '.sol/' + contractName + '.json';
    const proxyPath = artifactPath + contractName + 'Proxy.sol/' + contractName + 'Proxy.json';
    const implementationJson = require(implementationPath);
    const proxyJson = require(proxyPath);
    for (const chain of chains) {
        if (deployTo.length > 0 && deployTo.find((name) => chain.name === name) === null) continue;
        const rpc = chain.rpc;
        const provider = getDefaultProvider(rpc);
        console.log(`Deployer has ${(await provider.getBalance(wallet.address)) / 1e18} ${chain.tokenSymbol} on ${chain.name}.`);
    }
    const anwser = readlineSync.question('Proceed with deployment? (y/n). ');
    if (anwser !== 'y') return;
    for (const chain of chains) {
        if (deployTo.length > 0 && deployTo.find((name) => chain.name === name) === null) continue;
        const rpc = chain.rpc;
        const provider = getDefaultProvider(rpc);
        if (chain[contractName]) {
            await upgradeUpgradable(
                wallet.connect(provider),
                chain[contractName],
                implementationJson,
                getImplementationArgs(contractName, chain),
                getUpgradeArgs(contractName, chain),
            );
            console.log(`${chain.name} | Upgraded.`);
        } else {
            const key = contractName;
            const contract = await deployUpgradable(
                chain.constAddressDeployer,
                wallet.connect(provider),
                implementationJson,
                proxyJson,
                getImplementationArgs(contractName, chain),
                getInitArgs(contractName, chain),
                key,
            );
            chain[contractName] = contract.address;
            setJSON(chains, `./info/${env}.json`);
            console.log(`${chain.name} | Proxy for ${contractName} is at ${contract.address}.`);
        }
    }
}

if (require.main === module) {
    const env = process.argv[2];
    if (env === null || (env !== 'testnet' && env !== 'mainnet'))
        throw new Error('Need to specify tesntet or local as an argument to this script.');

    const chains = require(`../info/${env}.json`);

    const private_key = process.env.PRIVATE_KEY;
    const wallet = new Wallet(private_key);

    const artifactPath = process.argv[3];

    const contractName = process.argv[4];

    const deployTo = process.argv.slice(5);

    deploy(env, chains, wallet, artifactPath, contractName, deployTo);
}
