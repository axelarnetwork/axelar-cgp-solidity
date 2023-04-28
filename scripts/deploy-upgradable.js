'use strict';
require('dotenv').config();
const { get, getOr, isEmpty } = require('lodash/fp');
const {
    Contract,
    Wallet,
    getDefaultProvider,
    utils: { isAddress },
} = require('ethers');
const readlineSync = require('readline-sync');
const { outputJsonSync } = require('fs-extra');
const { deployUpgradable, upgradeUpgradable, predictContractConstant } = require('@axelar-network/axelar-gmp-sdk-solidity');
const IUpgradable = require('@axelar-network/axelar-gmp-sdk-solidity/dist/IUpgradable.json');

function getProxy(wallet, proxyAddress) {
    return new Contract(proxyAddress, IUpgradable.abi, wallet);
}

async function getImplementationArgs(contractName, chain, wallet) {
    if (contractName === 'AxelarGasService') {
        const collector = get('AxelarGasService.collector', chain);
        if (!isAddress(collector)) throw new Error(`Missing AxelarGasService.collector in the chain info.`);
        return [collector];
    }

    if (contractName === 'AxelarDepositService') {
        const symbol = getOr('', 'AxelarDepositService.wrappedSymbol', chain);
        if (isEmpty(symbol)) console.log(`${chain.name} | AxelarDepositService.wrappedSymbol: wrapped token is disabled`);

        const refundIssuer = get('AxelarDepositService.refundIssuer', chain);
        if (!isAddress(refundIssuer)) throw new Error(`${chain.name} | Missing AxelarDepositService.refundIssuer in the chain info.`);

        return [chain.gateway, symbol, refundIssuer];
    }

    throw new Error(`${contractName} is not supported.`);
}

function getInitArgs(contractName, chain) {
    if (contractName === 'AxelarGasService') return '0x';
    if (contractName === 'AxelarDepositService') return '0x';
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
    console.log(`Deployer address ${wallet.address}`);

    for (const chain of chains) {
        if (deployTo.length > 0 && !deployTo.find((name) => chain.name === name)) continue;
        const rpc = chain.rpc;
        const provider = getDefaultProvider(rpc);
        console.log(
            `Deployer has ${(await provider.getBalance(wallet.address)) / 1e18} ${
                chain.tokenSymbol
            } and nonce ${await provider.getTransactionCount(wallet.address)} on ${chain.name}.`,
        );
    }

    for (const chain of chains) {
        if (deployTo.length > 0 && !deployTo.find((name) => chain.name === name)) continue;
        const rpc = chain.rpc;
        const provider = getDefaultProvider(rpc);
        const args = await getImplementationArgs(contractName, chain);
        console.log(`Implementation args for chain ${chain.name}: ${args}`);
        console.log(`Gas override for chain ${chain.name}:`, chain.gasOptions);

        if (chain[contractName] && chain[contractName].address) {
            const contract = getProxy(wallet.connect(provider), chain[contractName]['address']);
            const owner = await contract.owner();
            console.log(`Proxy already exists for ${chain.name}: ${contract.address}`);
            console.log(`Existing implementation ${await contract.implementation()}`);
            console.log(`Existing owner ${owner}`);

            if (wallet.address !== owner) {
                throw new Error(
                    `${chain.name} | Signer ${wallet.address} does not match contract owner ${owner} for chain ${chain.name} in info.`,
                );
            }

            const anwser = readlineSync.question(`Perform an upgrade for ${chain.name}? (y/n) `);
            if (anwser !== 'y') continue;

            await upgradeUpgradable(
                wallet.connect(provider),
                chain[contractName]['address'],
                implementationJson,
                args,
                getUpgradeArgs(contractName, chain),
                get('gasOptions.gasLimit', chain),
            );

            chain[contractName]['implementation'] = await contract.implementation();

            setJSON(chains, `../info/${env}.json`);
            console.log(`${chain.name} | New Implementation for ${contractName} is at ${chain[contractName]['implementation']}`);
            console.log(`${chain.name} | Upgraded.`);
        } else {
            const key = env.includes('devnet') ? `${contractName}-${env}` : contractName;
            const setupArgs = getInitArgs(contractName, chain);
            console.log(`Proxy setup args: ${setupArgs}`);
            console.log(`Proxy deployment salt: '${key}'`);

            const proxyAddress = await predictContractConstant(chain.constAddressDeployer, wallet.connect(provider), proxyJson, key);
            console.log(`Proxy will be deployed to ${proxyAddress}. Does this match any existing deployments?`);
            const anwser = readlineSync.question(`Proceed with deployment on ${chain.name}? (y/n) `);
            if (anwser !== 'y') return;

            const contract = await deployUpgradable(
                chain.constAddressDeployer,
                wallet.connect(provider),
                implementationJson,
                proxyJson,
                args,
                [],
                setupArgs,
                key,
                get('gasOptions.gasLimit', chain),
            );

            chain[contractName]['salt'] = key;
            chain[contractName]['address'] = contract.address;
            chain[contractName]['implementation'] = await contract.implementation();
            chain[contractName]['deployer'] = wallet.address;

            setJSON(chains, `../info/${env}.json`);
            console.log(`${chain.name} | ConstAddressDeployer is at ${chain.constAddressDeployer}`);
            console.log(`${chain.name} | Implementation for ${contractName} is at ${chain[contractName]['implementation']}`);
            console.log(`${chain.name} | Proxy for ${contractName} is at ${contract.address}`);
        }
    }
}

if (require.main === module) {
    const env = process.argv[2];
    if (env === null || (env !== 'local' && !env.includes('devnet') && env !== 'testnet' && env !== 'mainnet'))
        throw new Error('Need to specify local | devnet* | testnet | mainnet as an argument to this script.');

    const chains = require(`../info/${env}.json`);

    const private_key = process.env.PRIVATE_KEY;
    const wallet = new Wallet(private_key);

    const artifactPath = process.argv[3];

    const contractName = process.argv[4];

    const deployTo = process.argv.slice(5);

    deploy(env, chains, wallet, artifactPath, contractName, deployTo);
}
