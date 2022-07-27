'use strict';

require('dotenv').config();

const { printLog, printObj, confirm, getOperators, getAdminAddresses, parseWei, getTxOptions } = require('./utils');
const { ethers } = require('hardhat');
const {
    getContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify },
} = ethers;

// these environment variables should be defined in an '.env' file
const skipConfirm = process.env.SKIP_CONFIRM;
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
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
        ADMIN_THRESHOLD: adminThreshold || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    prefix && chain && url && privKey && adminThreshold,
);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

printLog('retrieving admin addresses');
const admins = getAdminAddresses(prefix, chain);
printObj({ admins: { addresses: admins, threshold: adminThreshold } });

printLog('retrieving operator addresses');
const { addresses: operators, threshold: operatorThreshold } = getOperators(prefix, chain);
printObj({ operators: { addresses: operators, threshold: operatorThreshold } });

const contracts = {};
const paramsAuth = [defaultAbiCoder.encode(['address[]', 'uint256'], [operators, operatorThreshold])];
const paramsProxy = arrayify(defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [admins, adminThreshold, '0x']));

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData });
    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    printLog('loading contract factories');
    // the ABIs for the contracts below must be manually downloaded/compiled
    const gatewayFactory = await getContractFactory('AxelarGateway', wallet);
    const authFactory = await getContractFactory('AxelarAuthMultisig', wallet);
    const tokenDeployerFactory = await getContractFactory('TokenDeployer', wallet);
    const gatewayProxyFactory = await getContractFactory('AxelarGatewayProxy', wallet);
    printLog('contract factories loaded');

    printLog(`deploying auth contract`);
    const auth = await authFactory.deploy(paramsAuth).then((d) => d.deployed());
    printLog(`deployed auth at address ${auth.address}`);
    contracts.auth = auth.address;

    printLog(`deploying token deployer contract`);
    const tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
    printLog(`deployed token deployer at address ${tokenDeployer.address}`);
    contracts.tokenDeployer = tokenDeployer.address;

    printLog(`deploying gateway implementation contract`);
    const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
    printLog(`deployed gateway implementation at address ${gatewayImplementation.address}`);
    contracts.gatewayImplementation = gatewayImplementation.address;

    printLog(`deploying gateway proxy contract`);
    const gatewayProxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, paramsProxy).then((d) => d.deployed());
    printLog(`deployed gateway proxy at address ${gatewayProxy.address}`);
    contracts.gatewayProxy = gatewayProxy.address;

    printLog('transferring auth ownership');
    await auth.transferOwnership(gatewayProxy.address, options);
    printLog('transferred auth ownership. All done!');
})()
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
