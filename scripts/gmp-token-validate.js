'use strict';

require('dotenv').config();

const { ethers } = require('hardhat');
const {
    getContractAt,
    Wallet,
    utils,
    providers: { JsonRpcProvider },
} = ethers;

const { printLog, printObj, confirm, parseWei, getTxOptions } = require('./utils');

// these environment variables should be defined in an '.env' file
const skipConfirm = process.env.SKIP_CONFIRM;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const sourceChain = process.env.SOURCE_CHAIN;
const commandIDhex = process.env.COMMAND_ID;
const symbol = process.env.SYMBOL;
const amount = process.env.AMOUNT;
const gatewayAddress = process.env.GATEWAY_ADDRESS;
const gasPrice = parseWei(process.env.GAS_PRICE);
const maxFeePerGas = parseWei(process.env.MAX_FEE_PER_GAS);
const maxPriorityFeePerGas = parseWei(process.env.MAX_PRIORITY_FEE_PER_GAS);
const gasLimit = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : Number(21000);

confirm(
    {
        URL: url || null,
        PRIVATE_KEY: '*****REDACTED*****' || null,
        SOURCE_CHAIN: sourceChain || null,
        COMMAND_ID: commandIDhex || null,
        SYMBOL: symbol || null,
        AMOUNT: amount || null,
        GATEWAY_ADDRESS: gatewayAddress || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    url && privKey && sourceChain && commandIDhex && symbol && amount && gatewayAddress,
);
const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const hash = utils.keccak256(utils.arrayify(Buffer.from([])));
const commandID = utils.arrayify(commandIDhex.startsWith('0x') ? commandIDhex : '0x' + commandIDhex);
const transactions = {};

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData });

    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    printLog(`validating contract call with token for source chain ${sourceChain} and destination address ${wallet.address}`);
    const tx = await (
        await getContractAt('IAxelarGateway', gatewayAddress, wallet)
    ).validateContractCallAndMint(commandID, sourceChain, wallet.address, hash, symbol, amount, options);
    await tx.wait();
    printLog(
        `successfully validated contract call with token for source chain ${sourceChain} and destination address ${wallet.address} at tx ${tx.hash}`,
    );

    transactions.validated = tx.hash;
})()
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ transactions_sent: transactions });
    });
