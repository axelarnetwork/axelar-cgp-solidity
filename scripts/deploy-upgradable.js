'use strict';
require('dotenv').config();
const _ = require('lodash/fp');
const {
    Contract,
    Wallet,
    getDefaultProvider,
    utils: { isAddress },
    ContractFactory,
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
        const collector = _.get('AxelarGasService.collector', chain);
        if (!isAddress(collector)) throw new Error(`Missing AxelarGasService.collector in the chain info.`);
        return [collector];
    }

    if (contractName === 'AxelarDepositService') {
        const symbol = _.getOr('', 'AxelarDepositService.wrappedSymbol', chain);
        if (_.isEmpty(symbol)) console.log(`${chain.name} | AxelarDepositService.wrappedSymbol: wrapped token is disabled`);

        const refundIssuer = _.get('AxelarDepositService.refundIssuer', chain);
        if (!isAddress(refundIssuer)) throw new Error(`Missing AxelarDepositService.refundIssuer in the chain info.`);

        return [chain.gateway, symbol, refundIssuer];
    }

    if (contractName === 'GMPExpressService') {
        const gasService = _.get('AxelarGasService.address', chain);
        if (!isAddress(gasService)) throw new Error(`Missing AxelarGasService.address in the chain info.`);

        const expressOperator = _.get('GMPExpressService.expressOperator', chain);
        if (!isAddress(expressOperator)) throw new Error(`Missing GMPExpressService.expressOperator in the chain info.`);

        let proxyDeployer = _.get('GMPExpressService.proxyDeployer', chain);

        if (!isAddress(proxyDeployer)) {
            const deployerJson = require('@axelar-network/axelar-gmp-sdk-solidity/artifacts/contracts/express/ExpressProxyDeployer.sol/ExpressProxyDeployer.json');
            const deployerFactory = new ContractFactory(deployerJson.abi, deployerJson.bytecode, wallet);
            const deployer = await deployerFactory.deploy(chain.gateway);
            await deployer.deployed();

            proxyDeployer = deployer.address;
            chain.GMPExpressService.proxyDeployer = proxyDeployer;

            console.log(`${chain.name} | GMPExpressService: deployed a new ExpressProxyDeployer at ${proxyDeployer}`);
        }

        return [chain.gateway, gasService, proxyDeployer, expressOperator];
    }

    throw new Error(`${contractName} is not supported.`);
}

function getInitArgs(contractName, chain) {
    if (contractName === 'AxelarGasService') return '0x';
    if (contractName === 'AxelarDepositService') return '0x';
    if (contractName === 'GMPExpressService') return '0x';
    throw new Error(`${contractName} is not supported.`);
}

function getUpgradeArgs(contractName, chain) {
    if (contractName === 'AxelarGasService') return '0x';
    if (contractName === 'AxelarDepositService') return '0x';
    if (contractName === 'GMPExpressService') return '0x';
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

                const args = await getImplementationArgs(contractName, chain, wallet.connect(provider));
                console.log(`Implementation args for chain ${chain.name}: ${args}`);

                await upgradeUpgradable(
                    chain[contractName].address,
                    wallet.connect(provider),
                    implementationJson,
                    args,
                    getUpgradeArgs(contractName, chain),
                );

                chain[contractName].implementation = await contract.implementation();

                console.log(`${chain.name} | New Implementation for ${contractName} is at ${chain[contractName].implementation}`);
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

                const args = await getImplementationArgs(contractName, chain, wallet.connect(provider));
                console.log(`Implementation args for chain ${chain.name}: ${args}`);

                const contract = await deployUpgradable(
                    chain.constAddressDeployer,
                    wallet.connect(provider),
                    implementationJson,
                    proxyJson,
                    args,
                    setupArgs,
                    key,
                    _.get('gasOptions.gasLimit', chain),
                );

                chain[contractName] = {
                    ...chain[contractName],
                    salt: key,
                    address: contract.address,
                    implementation: await contract.implementation(),
                    deployer: wallet.address,
                };

                console.log(`${chain.name} | ConstAddressDeployer is at ${chain.constAddressDeployer}`);
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

    const artifactPath = process.argv[3];

    const contractName = process.argv[4];

    const deployTo = process.argv.slice(5);

    deploy(env, chains, wallet, artifactPath, contractName, deployTo);
}
