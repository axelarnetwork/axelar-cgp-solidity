'use strict';

require('dotenv').config();

const {
  Contract,
  Wallet,
  utils,
  providers: { JsonRpcProvider },
} = require('ethers');

const { printLog, printObj } = require('./logging');

const { join, resolve } = require('node:path');

const { existsSync } = require('node:fs');

// these environment variables should be defined in an '.env' file
const contractsPath = resolve(process.env.CONTRACTS_PATH || './build');
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const sourceChain = process.env.SOURCE_CHAIN;
const commandIDhex = process.env.COMMAND_ID;
const symbol = process.env.SYMBOL;
const amount = process.env.AMOUNT;
const gatewayAddress = process.env.GATEWAY_ADDRESS;

printObj({
  'environment_variables:': {
    CONTRACTS_PATH: contractsPath || null,
    URL: url || null,
    PRIVATE_KEY: privKey || null,
    SOURCE_CHAIN: sourceChain || null,
    COMMAND_ID: commandIDhex || null,
    SYMBOL: symbol || null,
    AMOUNT: amount || null,
    GATEWAY_ADDRESS: gatewayAddress || null,
  },
});

if (
  !(
    url &&
    privKey &&
    sourceChain &&
    commandIDhex &&
    symbol &&
    amount &&
    gatewayAddress
  )
) {
  console.error(
    `One or more of the required environment variable not defined. Make sure to declare these variables in an .env file.`,
  );
  process.exit(1);
}

// the ABIs for the contracts below must be manually downloaded/compiled
const IAxelarGatewayPath = join(contractsPath, 'IAxelarGateway.json');

if (!existsSync(IAxelarGatewayPath)) {
  console.error(
    `Missing IAxelarGateway ABI. Make sure IAxelarGateway.json is present in ${contractsPath}`,
  );
  process.exit(1);
}

const IAxelarGateway = require(IAxelarGatewayPath);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const gateway = new Contract(gatewayAddress, IAxelarGateway.abi, wallet);

const hash = utils.keccak256(utils.arrayify(Buffer.from([])));
const commandID = utils.arrayify(
  commandIDhex.startsWith('0x') ? commandIDhex : '0x' + commandIDhex,
);

printLog(
  `validating contract call with token for chain ${sourceChain} and destination address ${wallet.address}`,
);

gateway
  .validateContractCallAndMint(
    commandID,
    sourceChain,
    wallet.address,
    hash,
    symbol,
    amount,
  )
  .then(async (tx) => {
    await tx.wait();
    printLog(
      `successfully validated contract call with token for chain ${sourceChain} and destination address ${wallet.address} at tx ${tx.hash}`,
    );
    printObj({ validated: tx.hash });
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
