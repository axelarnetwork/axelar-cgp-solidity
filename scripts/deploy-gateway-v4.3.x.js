'use strict';

require('dotenv').config();

const { printLog, printObj, confirm, getEVMAddresses, pubkeysToAddresses, parseWei, getTxOptions, getProxy } = require('./utils');
const { ethers } = require('hardhat');
const {
    getContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify },
} = ethers;

// these environment variables should be defined in an '.env' file
const skipConfirm = process.env.SKIP_CONFIRM;
const reuseProxy = process.env.REUSE_PROXY;
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminPubkeys = process.env.ADMIN_PUBKEYS;
const adminAddresses = process.env.ADMIN_ADDRESSES;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);
const gasPrice = parseWei(process.env.GAS_PRICE);
const maxFeePerGas = parseWei(process.env.MAX_FEE_PER_GAS);
const maxPriorityFeePerGas = parseWei(process.env.MAX_PRIORITY_FEE_PER_GAS);
const gasLimit = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : Number(21000);

// main execution
confirm(
    {
        PREFIX: prefix || null,
        CHAIN: chain || null,
        URL: url || null,
        PRIVATE_KEY: privKey ? '*****REDACTED*****' : null,
        REUSE_PROXY: reuseProxy || null,
        ADMIN_PUBKEYS: adminPubkeys || null,
        ADMIN_ADDRESSES: adminAddresses || null,
        ADMIN_THRESHOLD: adminThreshold || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    prefix && chain && url && privKey && adminThreshold && (adminPubkeys || adminAddresses),
);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const contracts = {};

printLog('retrieving addresses');
const { addresses, weights, threshold } = getEVMAddresses(prefix, chain);
printObj({ addresses, weights, threshold });
const paramsAuth = [defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [addresses, weights, threshold])];

function proxyParams() {
    const admins = adminAddresses ? JSON.parse(adminAddresses) : pubkeysToAddresses(JSON.parse(adminPubkeys));
    printObj({ admins });
    return arrayify(defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [admins, adminThreshold, '0x']));
}

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData });
    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    printLog('loading contract factories');
    // the ABIs for the contracts below must be manually downloaded/compiled
    const gatewayFactory = await getContractFactory('AxelarGateway', wallet);
    const authFactory = await getContractFactory('AxelarAuthWeighted', wallet);
    const tokenDeployerFactory = await getContractFactory('TokenDeployer', wallet);
    const gatewayProxyFactory = await getContractFactory('AxelarGatewayProxy', wallet);
    printLog('contract factories loaded');

    printLog(`deploying auth contract`);
    const auth = await authFactory.deploy(paramsAuth).then((d) => d.deployed());
    printLog(`deployed auth at address ${auth.address}`);
    contracts.auth = auth.address;

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 5000));

    printLog(`deploying token deployer contract`);
    const tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
    printLog(`deployed token deployer at address ${tokenDeployer.address}`);
    contracts.tokenDeployer = tokenDeployer.address;

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 5000));

    printLog(`deploying gateway implementation contract`);
    const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
    printLog(`deployed gateway implementation at address ${gatewayImplementation.address}`);
    contracts.gatewayImplementation = gatewayImplementation.address;

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 5000));

    if (reuseProxy) {
        printLog(`reusing gateway proxy contract`);
        contracts.gatewayProxy = getProxy(prefix, chain);
        printLog(`proxy address ${contracts.gatewayProxy}`);
    } else {
        const params = proxyParams();
        printLog(`deploying gateway proxy contract`);
        const gatewayProxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());
        printLog(`deployed gateway proxy at address ${gatewayProxy.address}`);
        contracts.gatewayProxy = gatewayProxy.address;
    }

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 5000));

    printLog('transferring auth ownership');
    await auth.transferOwnership(contracts.gatewayProxy, options);
    printLog('transferred auth ownership. All done!');

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 5000));

    const gateway = gatewayFactory.attach(contracts.gatewayProxy);

    const epoch = await gateway.adminEpoch();
    const admins = await gateway.admins(epoch);
    printLog(`Existing admins ${admins}`);

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 2000));

    const authModule = await gateway.authModule();
    if (authModule !== contracts.auth) {
        console.error(`Auth module retrieved from gateway ${authModule} doesn't match deployed contract ${contracts.auth}`);
    }

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 2000));

    const tokenDeployerAddress = await gateway.tokenDeployer();
    if (tokenDeployer !== contracts.tokenDeployer) {
        console.error(
            `Token deployer retrieved from gateway ${tokenDeployerAddress} doesn't match deployed contract ${contracts.tokenDeployer}`,
        );
    }

    // timeout to avoid rpc syncing issues
    await new Promise(r => setTimeout(r, 2000));

    const authOwner = await auth.owner();
    if (authOwner !== contracts.gatewayProxy) {
        console.error(`Auth module owner is set to ${authOwner} instead of proxy address ${contracts.gatewayProxy}`);
    }
})()
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
