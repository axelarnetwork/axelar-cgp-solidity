'use strict';
require('dotenv').config();
const { get } = require('lodash/fp');
const {
    Contract,
    Wallet,
    getDefaultProvider,
    utils: { isAddress },
} = require('ethers');
const readlineSync = require('readline-sync');
const { outputJsonSync } = require('fs-extra');
const { upgradeUpgradable, deployCreate3Upgradable, getCreate3Address } = require('@axelar-network/axelar-gmp-sdk-solidity');
const { deployTokenDeployer, deployLinkerRouter } = require('../../interchain-token-service/scripts/deploy.js');
const IUpgradable = require('@axelar-network/axelar-gmp-sdk-solidity/dist/IUpgradable.json');
const TokenService = require('../../interchain-token-service/artifacts/contracts/interchainTokenService/InterchainTokenService.sol/InterchainTokenService.json');
const TokenServiceProxy = require('../../interchain-token-service/artifacts/contracts/proxies/InterchainTokenServiceProxy.sol/InterchainTokenServiceProxy.json');

function getProxy(wallet, proxyAddress) {
    return new Contract(proxyAddress, IUpgradable.abi, wallet);
}

async function getImplementationArgs(chain, wallet) {
    const gasService = get('AxelarGasService.address', chain);
    if (!isAddress(gasService)) throw new Error(`Missing AxelarGasService.address in the chain info.`);

    await deployTokenDeployer(chain, wallet);

    await deployLinkerRouter(chain, wallet);

    return [chain.gateway, gasService, chain.linkerRouter, chain.tokenDeployer, chain.name];
}

async function deploy(env, chains, wallet, contractName, deployTo) {
    const setJSON = (data, name) => {
        outputJsonSync(name, data, {
            spaces: 2,
            EOL: '\n',
        });
    };

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
                const contract = getProxy(wallet.connect(provider), chain[contractName].address);
                const owner = await contract.owner();
                console.log(`Proxy already exists for ${chain.name}: ${contract.address}`);
                console.log(`Existing implementation ${await contract.implementation()}`);
                console.log(`Existing owner ${owner}`);

                if (wallet.address !== owner) {
                    throw new Error(`Signer ${wallet.address} does not match contract owner ${owner} for chain ${chain.name} in info.`);
                }

                const anwser = readlineSync.question(`Perform an upgrade for ${chain.name}? (y/n) `);
                if (anwser !== 'y') continue;

                const args = await getImplementationArgs(chain, wallet.connect(provider));
                console.log(`Implementation args for chain ${chain.name}: ${args}`);

                await upgradeUpgradable(chain[contractName].address, wallet.connect(provider), TokenService, args, '0x');

                chain[contractName].implementation = await contract.implementation();

                console.log(`${chain.name} | New Implementation for ${contractName} is at ${chain[contractName].implementation}`);
                console.log(`${chain.name} | Upgraded.`);
            } else {
                const key = env.includes('devnet') ? `${contractName}-${env}` : contractName;
                const setupArgs = '0x';
                console.log(`Proxy setup args: ${setupArgs}`);
                console.log(`Proxy deployment salt: '${key}'`);

                if (!chain.Create3Deployer) {
                    throw new Error(`Create3Deployer has not yet been deployed on ${chain.name}.`);
                }
                const proxyAddress = await getCreate3Address(chain.Create3Deployer.address, wallet.connect(provider), key);

                console.log(`Proxy will be deployed to ${proxyAddress}. Does this match any existing deployments?`);
                const anwser = readlineSync.question(`Proceed with deployment on ${chain.name}? (y/n) `);
                if (anwser !== 'y') return;

                const args = await getImplementationArgs(chain, wallet.connect(provider));
                console.log(`Implementation args for chain ${chain.name}: ${args}`);

                const contract = await deployCreate3Upgradable(
                    chain.Create3Deployer.address,
                    wallet.connect(provider),
                    TokenService,
                    TokenServiceProxy,
                    args,
                    [],
                    setupArgs,
                    key,
                    get('gasOptions.gasLimit', chain),
                );

                chain[contractName] = {
                    ...chain[contractName],
                    salt: key,
                    address: contract.address,
                    implementation: await contract.implementation(),
                    deployer: wallet.address,
                };

                console.log(`${chain.name} | Implementation for ${contractName} is at ${chain[contractName].implementation}`);
                console.log(`${chain.name} | Proxy for ${contractName} is at ${contract.address}`);
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

    const contractName = process.argv[3];
    const deployTo = process.argv.slice(4);

    deploy(env, chains, wallet, contractName, deployTo);
}
