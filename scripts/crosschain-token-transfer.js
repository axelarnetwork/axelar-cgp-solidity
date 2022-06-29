'use strict';

require('dotenv').config();

const {
    Contract,
    Wallet,
    providers: { JsonRpcProvider },
} = require('ethers');

const { printLog, printObj, confirm } = require('./utils');

const { join, resolve } = require('node:path');

const { existsSync } = require('node:fs');

// these environment variables should be defined in an '.env' file
const contractsPath = resolve(process.env.CONTRACTS_PATH || './build');
const confirmValues = process.env.CONFIRM_VALUES;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const destinationChain = process.env.DESTINATION_CHAIN;
const symbol = process.env.SYMBOL;
const amount = process.env.AMOUNT;
const gatewayAddress = process.env.GATEWAY_ADDRESS;

confirm(
    {
        CONTRACTS_PATH: contractsPath || null,
        URL: url || null,
        PRIVATE_KEY: privKey || null,
        DESTINATION_CHAIN: destinationChain || null,
        SYMBOL: symbol || null,
        AMOUNT: amount || null,
        GATEWAY_ADDRESS: gatewayAddress || null,
        CONFIRM_VALUES: confirmValues || null,
    },
    (url && privKey && destinationChain && symbol && amount && gatewayAddress),
);

// the ABIs for the contracts below must be manually downloaded/compiled
const IAxelarGatewayPath = join(contractsPath, 'IAxelarGateway.json');
const IERC20Path = join(contractsPath, 'IERC20.json');

if (!(existsSync(IAxelarGatewayPath) && existsSync(IERC20Path))) {
    console.error(`Missing one or more ABIs/bytecodes. Make sure IAxelarGateway.json and IERC20.json are present in ${contractsPath}`);
    process.exit(1);
}

const IAxelarGateway = require(IAxelarGatewayPath);
const IERC20 = require(IERC20Path);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const gateway = new Contract(gatewayAddress, IAxelarGateway.abi, wallet);
const payload = Buffer.from([]);
const transactions = {};

printLog(`approving amount of ${amount}${symbol}`);

gateway
    .tokenAddresses(symbol)
    .then((tokenAddress) => {
        const token = new Contract(tokenAddress, IERC20.abi, wallet);
        return token.approve(gatewayAddress, amount);
    })
    .then(async (tx) => {
        await tx.wait();
        printLog(`successfully approved amount of ${amount}${symbol} at tx ${tx.hash}`);
        printLog(`calling contract with token for chain ${destinationChain} and destination address ${wallet.address}`);
        transactions.approve = tx.hash;
    })
    .then(() => gateway.callContractWithToken(destinationChain, wallet.address, payload, symbol, amount))
    .then(async (tx) => {
        await tx.wait();
        printLog(
            `successfully called contract with token for chain ${destinationChain} and destination address ${wallet.address} at tx ${tx.hash}`,
        );
        transactions.mint = tx.hash;
        printObj(transactions);
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
