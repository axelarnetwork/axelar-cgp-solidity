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
const sourceAddress = process.env.SOURCE_ADDRESS;
const payloadTypes = process.env.PAYLOAD_TYPES;
const payloadValues = process.env.PAYLOAD_VALUES;
const commandIDhex = process.env.COMMAND_ID;
const contractAddress = process.env.CONTRACT_ADDRESS;
const gasPrice = parseWei(process.env.GAS_PRICE);
const maxFeePerGas = parseWei(process.env.MAX_FEE_PER_GAS);
const maxPriorityFeePerGas = parseWei(process.env.MAX_PRIORITY_FEE_PER_GAS);
const gasLimit = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : Number(21000);

confirm(
    {
        URL: url || null,
        PRIVATE_KEY: '*****REDACTED*****' || null,
        SOURCE_CHAIN: sourceChain || null,
        SOURCE_ADDRESS: sourceAddress || null,
        PAYLOAD_TYPES: payloadTypes || null,
        PAYLOAD_VALUES: payloadValues || null,
        COMMAND_ID: commandIDhex || null,
        CONTRACT_ADDRESS: contractAddress || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    url && privKey && sourceChain && sourceAddress && payloadTypes && payloadValues && commandIDhex && contractAddress,
);
const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const payloadBytes = utils.arrayify(utils.defaultAbiCoder.encode(JSON.parse(payloadTypes), JSON.parse(payloadValues)));
const commandID = utils.arrayify(commandIDhex.startsWith('0x') ? commandIDhex : '0x' + commandIDhex);
const transactions = {};

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData: feeData });

    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    printLog(
        `executing call for source chain ${sourceChain}, source address ${sourceAddress}, command ID ${commandIDhex}, and payload hash ${payloadTypes}`,
    );
    const tx = await (
        await getContractAt('IAxelarExecutable', contractAddress, wallet)
    ).execute(commandID, sourceChain, sourceAddress, payloadBytes, options);
    await tx.wait();
    printLog(`successfully executed call at tx ${tx.hash}`);

    transactions.validated = tx.hash;
})()
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        printObj({ transactions_sent: transactions });
    });
