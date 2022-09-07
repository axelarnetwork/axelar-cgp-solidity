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
const gatewayAddress = process.env.GATEWAY_ADDRESS;
const wrappedSymbol = process.env.WRAPPED_SYMBOL;

confirm(
    {
        CONTRACTS_PATH: contractsPath || null,
        URL: url || null,
        PRIVATE_KEY: privKey || null,
        SKIP_CONFIRM: skipConfirm || null,
        GATEWAY_ADDRESS: gatewayAddress || null,
        WRAPPED_SYMBOL: wrappedSymbol || null,
    },
    url && privKey,
);

const AxelarDepositServicePath = join(contractsPath, 'deposit-service/AxelarDepositService.sol','AxelarDepositService.json');
const AxelarDepositServiceProxyPath = join(contractsPath, 'deposit-service/AxelarDepositServiceProxy.sol', 'AxelarDepositServiceProxy.json');

if (!(existsSync(AxelarDepositServicePath) && existsSync(AxelarDepositServiceProxyPath))) {
    console.error(
        `Missing one or more ABIs/bytecodes. Make sure AxelarDepositService.json and AxelarDepositServiceProxy.json are present in ${contractsPath}`,
    );
    process.exit(1);
}

const AxelarDepositService = require(AxelarDepositServicePath);
const AxelarDepositServiceProxy = require(AxelarDepositServiceProxyPath);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const axelarDepositServiceFactory = new ContractFactory(AxelarDepositService.abi, AxelarDepositService.bytecode, wallet);
const axelarDepositServiceProxyFactory = new ContractFactory(AxelarDepositServiceProxy.abi, AxelarDepositServiceProxy.bytecode, wallet);

const contracts = {};

axelarDepositServiceFactory
    .deploy(gatewayAddress, wrappedSymbol)
    .then((axelarDepositService) => axelarDepositService.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar deposit service at address ${address}`);
        contracts.axelarDepositService = address;
        return axelarDepositServiceProxyFactory.deploy();
    })
    .then((axelarDepositServiceProxy) => axelarDepositServiceProxy.deployed())
    .then(({ address }) => {
        printLog(`deployed axelar deposit service proxy at address ${address}`);
        contracts.axelarDepositServiceProxy = address;
    })
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ contract_addresses: contracts });
    });
