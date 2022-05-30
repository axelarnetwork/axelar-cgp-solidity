'use strict';

require('dotenv').config();

const {
  Contract,
  Wallet,
  providers: { JsonRpcProvider },
} = require('ethers');

const {
  printLog,
  printObj,
} = require('./logging');

const path = require('node:path');

// these environment variables should be defined in an '.env' file
const contractsPath = process.env.CONTRACTS_PATH || '../build';
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const destinationChain = process.env.DESTINATION_CHAIN;
const symbol = process.env.SYMBOL;
const amount = process.env.AMOUNT;
const gatewayAddress = process.env.GATEWAY_ADDRESS;

printObj({"enviroment_variables:" : {
  "CONTRACTS_PATH" : contractsPath,
  "URL" : url,
  "PRIVATE_KEY" : privKey,
  "DESTINATION_CHAIN" : destinationChain, 
  "SYMBOL": symbol, 
  "AMOUNT" : amount, 
  "GATEWAY_ADDRESS" : gatewayAddress
}});

if (!(url && privKey && destinationChain && symbol && amount &&  gatewayAddress)) {
  console.error(`one or more of the required environment variable not defined`);
  process.exit(1);
}

// the ABIs for the contracts below must be manually downloaded/compiled
const IAxelarGateway = require(path.join(contractsPath,'IAxelarGateway.json'));
const IERC20 = require(path.join(contractsPath,'IERC20.json'));

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const gateway = new Contract(gatewayAddress, IAxelarGateway.abi, wallet);
const payload = Buffer.from([]);
let transactions = {};

printLog(`approving amount of ${amount}${symbol}`);

(async () => {
  const tokenAddress = await gateway.tokenAddresses(symbol);
  const token = new Contract(tokenAddress, IERC20.abi, wallet);
  return token.approve(gatewayAddress, amount);
})()
.then((tx) => {
  tx.wait();
  printLog(`successfully approved amount of ${amount}${symbol} at tx ${tx.hash}`);
  printLog(`calling contract with token for chain ${destinationChain} and destination address ${wallet.address}`);
  transactions.approve = tx.hash;
})
.then(() => gateway.callContractWithToken(
  destinationChain,
  wallet.address,
  payload,
  symbol,
  amount,
))
.then((tx) => {
  tx.wait();
  printLog(`successfully called contract with token for chain ${destinationChain} and destination address ${wallet.address} at tx ${tx.hash}`);
  transactions.mint = tx.hash;
  printObj(transactions);
  process.exit(0);
})
.catch((err) => {
  console.error(err);
  process.exit(1);
});
