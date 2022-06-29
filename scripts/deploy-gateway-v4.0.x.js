'use strict';

//imports
require('dotenv').config();

const { execSync } = require('child_process');
const { printLog, printObj } = require('./logging');
const { sortBy } = require('lodash');
const { ethers } = require('hardhat');
const {
    getContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify, computeAddress, parseUnits },
} = ethers;

//helper functions
function parseWei(str) {
    if (!str) {
        return
    }

    const res = str.match(/(-?[\d.]+)([a-z%]*)/);
    return parseUnits(res[1], res[2])
}

const getAddresses = (role) => {
    const keyID = execSync(`${prefix} "axelard q tss key-id ${chain} ${role}"`, {
        encoding: 'utf-8',
    }).replaceAll('\n', '');
    const output = execSync(`${prefix} "axelard q tss key ${keyID} --output json"`);
    const keys = JSON.parse(output).multisig_key.key;

    const addresses = keys.map((key) => {
        const x = `${'0'.repeat(64)}${key.x}`.slice(-64);
        const y = `${'0'.repeat(64)}${key.y}`.slice(-64);
        return computeAddress(`0x04${x}${y}`);
    });

    return {
        addresses: sortBy(addresses, (address) => address.toLowerCase()),
        threshold: Number(JSON.parse(output).multisig_key.threshold),
    };
};

 
// these environment variables should be defined in an '.env' file
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
printObj({
    'environment_variables:': {
        PREFIX: prefix || null,
        CHAIN: chain || null,
        URL: url || null,
        PRIVATE_KEY: privKey ? "*****REDACTED*****" : null,
        ADMIN_THRESHOLD: adminThreshold || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
    },
});

if (!(prefix && chain && url && privKey && adminThreshold)) {
    console.error(`One or more of the required environment variable not defined. Make sure to declare these variables in an .env file.`);
    process.exit(1);
}

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

printLog('retrieving admin addresses');
const adminKeyIDs = JSON.parse(execSync(`${prefix} "axelard q tss external-key-id ${chain} --output json"`)).key_ids;
const admins = adminKeyIDs.map((adminKeyID) => {
    const output = execSync(`${prefix} "axelard q tss key ${adminKeyID} --output json"`);
    const key = JSON.parse(output).ecdsa_key.key;

    return computeAddress(`0x04${key.x}${key.y}`);
});
printObj({ admins: { addresses: admins, threshold: adminThreshold } });

printLog('retrieving operator addresses');
const { addresses: operators, threshold: operatorThreshold } = getAddresses('secondary');
printObj({operators: { addresses: operators, threshold: operatorThreshold }});

const contracts = {};
const paramsAuth =  [defaultAbiCoder.encode(['address[]', 'uint256'], [operators,operatorThreshold])];
const paramsProxy = arrayify(
    defaultAbiCoder.encode(
        ['address[]', 'uint8', 'bytes'],
        [
            admins,
            adminThreshold,
            '0x',
        ],
    ),
);

(async () => {
    printLog("fetching fee data")
    const feeData = (await provider.getFeeData())
    printObj({feeData: feeData});

    // detect if EIP-1559 is supported by the chain
    const options = (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) ? {
        maxFeePerGas: maxFeePerGas || feeData?.maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas || feeData?.maxPriorityFeePerGas,
        gasLimit: gasLimit || feeData.gasLimit,
    } : {
        gasPrice: gasPrice || feeData?.gasPrice,
        gasLimit: gasLimit || feeData.gasLimit,
    };

    printObj({tx_options: options});

    printLog("loading contract factories")
    // the ABIs for the contracts below must be manually downloaded/compiled
    const gatewayFactory = await getContractFactory('AxelarGateway', wallet);
    const authFactory = await getContractFactory('AxelarAuthMultisig', wallet);
    const tokenDeployerFactory = await getContractFactory('TokenDeployer', wallet);
    const gatewayProxyFactory = await getContractFactory('AxelarGatewayProxy', wallet);
    printLog("contract factories loaded")

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

    printLog("transferring auth ownership")
    await auth.transferOwnership(gatewayProxy.address, options);
    printLog("transferred auth ownership. All done!")

})().catch((err) => {
    console.error(err);
    process.exit(1);
}).finally(() => {
    printObj({contract_addresses: contracts});
});
