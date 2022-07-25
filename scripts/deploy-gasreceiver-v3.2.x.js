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

const AxelarGasReceiverPath = join(contractsPath, 'AxelarGasReceiver.json');
const AxelarGasReceiverProxyPath = join(contractsPath, 'AxelarGasReceiverProxy.json');

if (!(existsSync(AxelarGasReceiverPath) && existsSync(AxelarGasReceiverProxyPath))) {
    console.error(
        `Missing one or more ABIs/bytecodes. Make sure AxelarGasReceiver.json and AxelarGasReceiverProxy.json are present in ${contractsPath}`,
    );
    process.exit(1);
}

const AxelarGasReceiver = require(AxelarGasReceiverPath);
const AxelarGasReceiverProxy = require(AxelarGasReceiverProxyPath);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const axelarGasReceiverFactory = new ContractFactory(AxelarGasReceiver.abi, AxelarGasReceiver.bytecode, wallet);
const axelarGasReceiverProxyFactory = new ContractFactory(AxelarGasReceiverProxy.abi, AxelarGasReceiverProxy.bytecode, wallet);

const contracts = {};
const params = arrayify(defaultAbiCoder.encode(['address'], [wallet.address]));

axelarGasReceiverFactory
    .deploy()
    .then((axelarGasReceiver) => axelarGasReceiver.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar gas receiver at address ${address}`);
        contracts.axelarGasReceiver = address;
        return axelarGasReceiverProxyFactory.deploy(address, params);
    })
    .then((axelarGasReceiverProxy) => axelarGasReceiverProxy.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar gas receiver proxy at address ${address}`);
        contracts.axelarGasReceiverProxy = address;
    })
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
