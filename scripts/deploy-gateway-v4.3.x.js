'use strict';

require('dotenv').config();

const {
    printLog,
    printObj,
    confirm,
    getEVMAddresses,
    pubkeysToAddresses,
    parseWei,
    getTxOptions,
    getProxy,
    writeJSON,
} = require('./utils');
const { verifyContract } = require('@axelar-network/axelar-contract-deployments/evm/utils');
const { ethers } = require('hardhat');
const {
    getContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify, keccak256, getContractAddress },
} = ethers;

const env = process.argv[2] || 'mainnet';
if (env === null || (env !== 'local' && !env.includes('devnet') && env !== 'testnet' && env !== 'mainnet'))
    throw new Error('Need to specify teslocaltnet | devnet* | testnet | mainnet as an argument to this script.');

const chains = require(`../info/${env}.json`);

// these environment variables should be defined in an '.env' file
const network = env || process.env.NETWORK;
const skipConfirm = process.env.SKIP_CONFIRM;
const reuseProxy = process.env.REUSE_PROXY;
const prefix = process.env.PREFIX;
const axelarRpc = process.env.AXELAR_RPC;
const chain = (process.argv[3] || process.env.CHAIN).toLowerCase();
var config;
for (const chain1 of chains) {
    if (chain1.name.toLowerCase() === chain) {
        config = chain1;
        break;
    }
}
const url = config.rpc || process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminPubkeys = process.env.ADMIN_PUBKEYS;
const adminAddresses = process.env.ADMIN_ADDRESSES;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);
const gasPrice = parseWei(process.env.GAS_PRICE);
const maxFeePerGas = parseWei(process.env.MAX_FEE_PER_GAS);
const maxPriorityFeePerGas = parseWei(process.env.MAX_PRIORITY_FEE_PER_GAS);
const gasLimit = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : config?.gasOptions?.gasLimit || Number(6e6);
const shouldVerifyContracts = process.env.VERIFY;

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

// main execution
confirm(
    {
        NETWORK: network || null,
        PREFIX: prefix || null,
        CHAIN: chain || null,
        URL: url || null,
        AXELAR_RPC: axelarRpc || null,
        PRIVATE_KEY: privKey ? '*****REDACTED*****' : null,
        WALLET: wallet.address,
        REUSE_PROXY: reuseProxy || null,
        ADMIN_PUBKEYS: adminPubkeys || null,
        ADMIN_ADDRESSES: adminAddresses || null,
        ADMIN_THRESHOLD: adminThreshold || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
        VERIFY: shouldVerifyContracts,
    },
    (prefix || axelarRpc) && privKey && adminThreshold && (adminPubkeys || adminAddresses) && (!shouldVerifyContracts || network),
);

const contracts = {};

async function authParams() {
    printLog('retrieving addresses');
    const { addresses, weights, threshold } = getEVMAddresses(prefix, chain, axelarRpc);
    printObj(JSON.stringify({ addresses, weights, threshold }));
    const paramsAuth = [defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [addresses, weights, threshold])];
    return paramsAuth;
}

function proxyParams() {
    const admins = adminAddresses ? JSON.parse(adminAddresses) : pubkeysToAddresses(JSON.parse(adminPubkeys));
    printObj({ admins });
    return defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [admins, adminThreshold, '0x']);
}

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData });
    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    const transactionCount = await wallet.getTransactionCount();
    const proxyAddress = getContractAddress({
        from: wallet.address,
        nonce: transactionCount + 3,
    });
    printLog(`Predicted proxy address: ${proxyAddress}`);

    printLog('loading contract factories');
    // the ABIs for the contracts below must be manually downloaded/compiled
    const gatewayFactory = await getContractFactory('AxelarGateway', wallet);
    const authFactory = await getContractFactory('AxelarAuthWeighted', wallet);
    const tokenDeployerFactory = await getContractFactory('TokenDeployer', wallet);
    const gatewayProxyFactory = await getContractFactory('AxelarGatewayProxy', wallet);
    printLog('contract factories loaded');

    printLog(`Deployer key: ${wallet.address}`);

    var gateway;
    var auth;
    var tokenDeployer;
    var contractsToVerify = [];

    if (reuseProxy) {
        printLog(`reusing gateway proxy contract`);
        contracts.gatewayProxy = config.gateway || getProxy(prefix, chain, axelarRpc);
        printLog(`proxy address ${contracts.gatewayProxy}`);
        gateway = gatewayFactory.attach(contracts.gatewayProxy);
    }

    if (reuseProxy) {
        contracts.auth = await gateway.authModule();
        auth = authFactory.attach(contracts.auth);
    } else {
        printLog(`deploying auth contract`);
        const params = await authParams();
        printLog(`auth deployment args: ${params}`);

        auth = await authFactory.deploy(params).then((d) => d.deployed());
        printLog(`deployed auth at address ${auth.address}`);
        contracts.auth = auth.address;

        contractsToVerify.push({
            address: auth.address,
            params: [params],
        });
    }

    if (reuseProxy) {
        contracts.tokenDeployer = await gateway.tokenDeployer();
        tokenDeployer = tokenDeployerFactory.attach(contracts.tokenDeployer);
    } else {
        printLog(`deploying token deployer contract`);
        tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
        printLog(`deployed token deployer at address ${tokenDeployer.address}`);
        contracts.tokenDeployer = tokenDeployer.address;

        contractsToVerify.push({
            address: tokenDeployer.address,
            params: [],
        });
    }

    printLog(`deploying gateway implementation contract`);
    printLog(`authModule: ${contracts.auth}`);
    printLog(`tokenDeployer: ${contracts.tokenDeployer}`);
    printLog(`implementation deployment args: ${contracts.auth},${contracts.tokenDeployer}`);

    const gatewayImplementation = await gatewayFactory.deploy(contracts.auth, contracts.tokenDeployer).then((d) => d.deployed());
    printLog(`implementation: ${gatewayImplementation.address}`);
    contracts.gatewayImplementation = gatewayImplementation.address;
    const bytecode = await provider.getCode(gatewayImplementation.address);
    const codehash = keccak256(bytecode);
    contracts.implementationCodehash = codehash;

    printLog(`implementation codehash: ${contracts.implementationCodehash}`);

    contractsToVerify.push({
        address: gatewayImplementation.address,
        params: [contracts.auth, contracts.tokenDeployer]
    });

    if (!reuseProxy) {
        const params = proxyParams();
        printLog(`deploying gateway proxy contract`);
        printLog(`proxy deployment args: ${gatewayImplementation.address},${params}`);
        const gatewayProxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());
        printLog(`deployed gateway proxy at address ${gatewayProxy.address}`);
        contracts.gatewayProxy = gatewayProxy.address;
        gateway = gatewayFactory.attach(contracts.gatewayProxy);

        contractsToVerify.push({
            address: gatewayProxy.address,
            params: [contracts.gatewayImplementation, params]
        });
    }

    if (!reuseProxy) {
        printLog('transferring auth ownership');
        await auth.transferOwnership(contracts.gatewayProxy, options).then((tx) => tx.wait());
        printLog('transferred auth ownership. All done!');
    }

    var error = false;
    const epoch = await gateway.adminEpoch();
    const admins = `${await gateway.admins(epoch)}`.split(',');
    printLog(`Existing admins ${admins}`);
    const encodedAdmins = JSON.parse(adminAddresses);
    if (!reuseProxy && `${admins}` !== `${encodedAdmins}`) {
        printLog(`ERROR: Retrieved admins are different:`);
        printLog(`   Actual:   ${admins}`);
        printLog(`   Expected: ${encodedAdmins}`);
        error = true;
    }

    const authModule = await gateway.authModule();
    if (authModule !== contracts.auth) {
        printLog(`ERROR: Auth module retrieved from gateway ${authModule} doesn't match deployed contract ${contracts.auth}`);
        error = true;
    }

    const tokenDeployerAddress = await gateway.tokenDeployer();
    if (tokenDeployerAddress !== contracts.tokenDeployer) {
        printLog(
            `ERROR: Token deployer retrieved from gateway ${tokenDeployerAddress} doesn't match deployed contract ${contracts.tokenDeployer}`,
        );
        error = true;
    }

    const authOwner = await auth.owner();
    if (authOwner !== contracts.gatewayProxy) {
        printLog(`ERROR: Auth module owner is set to ${authOwner} instead of proxy address ${contracts.gatewayProxy}`);
        error = true;
    }

    const implementation = await gateway.implementation();
    if (implementation !== contracts.gatewayImplementation) {
        printLog(
            `ERROR: Implementation contract retrieved from gateway ${implementation} doesn't match deployed contract ${contracts.gatewayImplementation}`,
        );
        error = true;
    }

    if (error) {
        printLog('Deployment failed!');
        return;
    }

    if (config) {
        config['AxelarGateway'] = {
            address: contracts.gatewayProxy,
            implementation: contracts.gatewayImplementation,
            authModule: contracts.auth,
            tokenDeployer: contracts.tokenDeployer,
            deployer: wallet.address,
        };

        writeJSON(chains, `../info/${network}.json`);
    }

    printLog(`Deployment completed`);

    if (shouldVerifyContracts) {
        // Verify contracts at the end to avoid deployment failures in the middle
        for (const contract of contractsToVerify) {
            await verifyContract(network, chain, contract.address, contract.params);
        }

        printLog('Verified all contracts!');
    }
})()
    .catch((err) => {
        printLog(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
