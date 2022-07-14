'use strict';

require('dotenv').config();

const {
    ContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify },
} = require('ethers');

const { join, resolve } = require('node:path');
const { existsSync } = require('node:fs');
const { printLog, printObj, confirm, getAdminAddresses, getOwners, getOperators } = require('./utils');

// these environment variables should be defined in an '.env' file
const contractsPath = resolve(process.env.CONTRACTS_PATH || './build');
const skipConfirm = process.env.SKIP_CONFIRM;
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);

confirm(
    {
        CONTRACTS_PATH: contractsPath || null,
        PREFIX: prefix || null,
        CHAIN: chain || null,
        URL: url || null,
        PRIVATE_KEY: privKey || null,
        ADMIN_THRESHOLD: adminThreshold || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    prefix && chain && url && privKey && adminThreshold,
);

// the ABIs for the contracts below must be manually downloaded/compiled
const TokenDeployerPath = join(contractsPath, 'TokenDeployer.json');
const AxelarGatewayMultisigPath = join(contractsPath, 'AxelarGatewayMultisig.json');
const AxelarGatewayProxyPath = join(contractsPath, 'AxelarGatewayProxy.json');

if (!(existsSync(TokenDeployerPath) && existsSync(AxelarGatewayMultisigPath) && existsSync(AxelarGatewayProxyPath))) {
    console.error(
        `Missing one or more ABIs/bytecodes. Make sure TokenDeployer.json, AxelarGatewayMultisig.json, and AxelarGatewayProxy.json are present in ${contractsPath}`,
    );
    process.exit(1);
}

const TokenDeployer = require(TokenDeployerPath);
const AxelarGatewayMultisig = require(AxelarGatewayMultisigPath);
const AxelarGatewayProxy = require(AxelarGatewayProxyPath);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

printLog('retrieving admin addresses');
const admins = getAdminAddresses(prefix, chain);
printObj({ admins: { addresses: admins, threshold: adminThreshold } });

printLog('retrieving owner addresses');
const { addresses: owners, threshold: ownerThreshold } = getOwners(prefix, chain);
printObj({ owners, threshold: ownerThreshold });

printLog('retrieving operator addresses');
const { addresses: operators, threshold: operatorThreshold } = getOperators(prefix, chain);
printObj({ operators, threshold: operatorThreshold });

const tokenDeployerFactory = new ContractFactory(TokenDeployer.abi, TokenDeployer.bytecode, wallet);
const axelarGatewayMultisigFactory = new ContractFactory(AxelarGatewayMultisig.abi, AxelarGatewayMultisig.bytecode, wallet);
const axelarGatewayProxyFactory = new ContractFactory(AxelarGatewayProxy.abi, AxelarGatewayProxy.bytecode, wallet);

const contracts = {};
const params = arrayify(
    defaultAbiCoder.encode(
        ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
        [admins, adminThreshold, owners, ownerThreshold, operators, operatorThreshold],
    ),
);

printLog('deploying contracts');

tokenDeployerFactory
    .deploy()
    .then((tokenDeployer) => tokenDeployer.deployed())
    .then(({ address }) => {
        printLog(`deployed token deployer at address ${address}`);
        contracts.tokenDeployed = address;
        return axelarGatewayMultisigFactory.deploy(address);
    })
    .then((axelarGatewayMultisig) => axelarGatewayMultisig.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar gateway multisig at address ${address}`);
        contracts.gatewayMultisig = address;
        return axelarGatewayProxyFactory.deploy(address, params);
    })
    .then((axelarGatewayProxy) => axelarGatewayProxy.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar gateway proxy at address ${address}`);
        contracts.gatewayProxy = address;
    })
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
