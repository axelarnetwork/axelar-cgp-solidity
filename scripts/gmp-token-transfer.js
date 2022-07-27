'use strict';

require('dotenv').config();

const { ethers } = require('hardhat');
const {
    getContractAt,
    Wallet,
    providers: { JsonRpcProvider },
} = ethers;

const { printLog, printObj, confirm, parseWei, getTxOptions } = require('./utils');

// these environment variables should be defined in an '.env' file
const skipConfirm = process.env.SKIP_CONFIRM;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const destinationChain = process.env.DESTINATION_CHAIN;
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
        DESTINATION_CHAIN: destinationChain || null,
        SYMBOL: symbol || null,
        AMOUNT: amount || null,
        GATEWAY_ADDRESS: gatewayAddress || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    url && privKey && destinationChain && symbol && amount && gatewayAddress,
);
const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const payload = Buffer.from([]);
const transactions = {};

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData });
    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    const gateway = await getContractAt('IAxelarGateway', gatewayAddress, wallet);
    const tokenAddress = await gateway.tokenAddresses(symbol);
    printLog(`token address for asset ${symbol} available at address ${tokenAddress}`);

    printLog(`approving amount of ${amount}${symbol}`);
    const token = await getContractAt('IERC20', tokenAddress, wallet);
    const approveTX = await token.approve(gatewayAddress, amount, options);
    await approveTX.wait();
    transactions.approve = approveTX.hash;
    printLog(`successfully approved amount of ${amount}${symbol} at tx ${approveTX.hash}`);

    const callContractTX = await gateway.callContractWithToken(destinationChain, wallet.address, payload, symbol, amount, options);
    await callContractTX.wait();

    transactions.mint = callContractTX.hash;
    printLog(
        `successfully called contract with token for chain ${destinationChain} and destination address ${wallet.address} at tx ${callContractTX.hash}`,
    );
})()
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ transactions_sent: transactions });
    });
