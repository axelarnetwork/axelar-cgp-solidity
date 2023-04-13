'use strict';
require('dotenv').config();
const _ = require('lodash/fp');
const { Wallet, getDefaultProvider } = require('ethers');
const readlineSync = require('readline-sync');
const { outputJsonSync } = require('fs-extra');
const { predictContractConstant, deployContractConstant } = require('@axelar-network/axelar-gmp-sdk-solidity');

async function deploy(env, chains, wallet, artifactPath, contractName, deployTo) {
    const setJSON = (data, name) => {
        outputJsonSync(name, data, {
            spaces: 2,
            EOL: '\n',
        });
    };

    const implementationPath = artifactPath + contractName + '.sol/' + contractName + '.json';
    const implementationJson = require(implementationPath);
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
        try {
            if (deployTo.length > 0 && !deployTo.find((name) => chain.name === name)) continue;
            const rpc = chain.rpc;
            const provider = getDefaultProvider(rpc);
            console.log(`Gas override for chain ${chain.name}:`, chain.gasOptions);

            if (chain[contractName] && chain[contractName].address) {
                console.log(`create3Deployer already exits on ${chain.name} at address ${chain.create3Deployer}`);
                continue;
            } else {
                const key = env.includes('devnet') ? `${contractName}-${env}` : contractName;

                const create3DeployerAddress = await predictContractConstant(
                    chain.constAddressDeployer,
                    wallet.connect(provider),
                    implementationJson,
                    key,
                );

                console.log(`create3Deployer will be deployed on ${chain.name} with address ${create3DeployerAddress}.`);
                const anwser = readlineSync.question(`Proceed with deployment on ${chain.name}? (y/n) `);
                if (anwser !== 'y') return;

                const contract = await deployContractConstant(
                    chain.constAddressDeployer,
                    wallet.connect(provider),
                    implementationJson,
                    key,
                    [],
                    _.get('gasOptions.gasLimit', chain),
                );

                chain[contractName] = {
                    ...chain[contractName],
                    salt: key,
                    address: contract.address,
                    deployer: wallet.address,
                };

                console.log(`${chain.name} | ConstAddressDeployer is at ${chain.constAddressDeployer}`);
                console.log(`${chain.name} | ${contractName} is at ${chain[contractName].address}`);
            }

            setJSON(chains, `./info/${env}.json`);
        } catch (e) {
            console.error(`${chain.name} | Error:`);
            console.error(e);
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
