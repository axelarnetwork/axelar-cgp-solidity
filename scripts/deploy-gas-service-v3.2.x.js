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
const { printLog, printObj, confirm } = require('./utils');

// these environment variables should be defined in an '.env' file
const contractsPath = resolve(process.env.CONTRACTS_PATH || './build');
const skipConfirm = process.env.SKIP_CONFIRM;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;

confirm(
    {
        CONTRACTS_PATH: contractsPath || null,
        URL: url || null,
        PRIVATE_KEY: privKey || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    url && privKey,
);

const AxelarGasServicePath = join(contractsPath, 'AxelarGasService.json');
const AxelarGasServiceProxyPath = join(contractsPath, 'AxelarGasServiceProxy.json');

if (!(existsSync(AxelarGasServicePath) && existsSync(AxelarGasServiceProxyPath))) {
    console.error(
        `Missing one or more ABIs/bytecodes. Make sure AxelarGasService.json and AxelarGasServiceProxy.json are present in ${contractsPath}`,
    );
    process.exit(1);
}

const AxelarGasService = require(AxelarGasServicePath);
const AxelarGasServiceProxy = require(AxelarGasServiceProxyPath);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const axelarGasServiceFactory = new ContractFactory(AxelarGasService.abi, AxelarGasService.bytecode, wallet);
const axelarGasServiceProxyFactory = new ContractFactory(AxelarGasServiceProxy.abi, AxelarGasServiceProxy.bytecode, wallet);

const contracts = {};
const params = arrayify(defaultAbiCoder.encode(['address'], [wallet.address]));

axelarGasServiceFactory
    .deploy()
    .then((axelarGasService) => axelarGasService.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar gas receiver at address ${address}`);
        contracts.axelarGasService = address;
        return axelarGasServiceProxyFactory.deploy(address, params);
    })
    .then((axelarGasServiceProxy) => axelarGasServiceProxy.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar gas receiver proxy at address ${address}`);
        contracts.axelarGasServiceProxy = address;
    })
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
