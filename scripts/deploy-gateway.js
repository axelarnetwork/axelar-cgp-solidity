'use strict';

require('dotenv').config();

const {
  ContractFactory,
  Wallet,
  providers: { JsonRpcProvider },
  utils: { defaultAbiCoder, arrayify, computeAddress },
} = require('ethers');

const { execSync }  = require('child_process');

// these environment variables should be defined in an '.env' file
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const TokenDeployer = require('../build/TokenDeployer.json');
const AxelarGatewayMultisig = require('../build/AxelarGatewayMultisig.json');
const AxelarGatewayProxy = require('../build/AxelarGatewayProxy.json');

const printLog = (msg) => {process.stdout.write(JSON.stringify({log: msg}).concat("\n"))}
const printObj = (obj) => {process.stdout.write(JSON.stringify(obj).concat("\n"))}

printLog("retrieving admin addresses")
const adminKeyIDs = JSON.parse(execSync(`${prefix} "axelard q tss external-key-id ${chain} --output json"`)).key_ids;

const admins = adminKeyIDs.map(adminKeyID => {
  const output = execSync(`${prefix} "axelard q tss key ${adminKeyID} --output json"`);
  const key = JSON.parse(output).ecdsa_key.key;
  
  return computeAddress(`0x04${key.x}${key.y}`);
});

const getAddresses = (role) => {
  const keyID = execSync(`${prefix} "axelard q tss key-id ${chain} ${role}"`, { encoding: 'utf-8' }).replaceAll('\n','');
  const output = execSync(`${prefix} "axelard q tss key ${keyID} --output json"`);
  const keys = JSON.parse(output).multisig_key.key;
 
    const addresses = keys.map(key => {
        const x = ("0".repeat(64) + `${key.x}`).slice(-64);
        const y = ("0".repeat(64) + `${key.y}`).slice(-64);
        return computeAddress(`0x04${x}${y}`)
    });

  return {
    addresses: addresses,
    threshold: JSON.parse(output).multisig_key.threshold
  }
}

printObj({admins: {addresses: admins, threshold: adminThreshold}});

printLog("retrieving owner addresses")
const { addresses: owners, threshold: ownerThreshold } = getAddresses("master")
printObj({owners: owners, threshold: ownerThreshold })

printLog("retrieving operator addresses")
const { addresses: operators, threshold: operatorThreshold } = getAddresses("secondary")
printObj({operators: operators, threshold: operatorThreshold })

const params = arrayify(
  defaultAbiCoder.encode(
    ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
    [
      admins,
      adminThreshold,
      owners,
      ownerThreshold,
      operators,
      operatorThreshold,
    ],
  ),
);

const tokenDeployerFactory = new ContractFactory(
  TokenDeployer.abi,
  TokenDeployer.bytecode,
  wallet,
);
const axelarGatewayMultisigFactory = new ContractFactory(
  AxelarGatewayMultisig.abi,
  AxelarGatewayMultisig.bytecode,
  wallet,
);
const axelarGatewayProxyFactory = new ContractFactory(
  AxelarGatewayProxy.abi,
  AxelarGatewayProxy.bytecode,
  wallet,
);

let contracts = {}

printLog("deploying contracts")

tokenDeployerFactory
  .deploy()
  .then((tokenDeployer) => tokenDeployer.deployed())
  .then(({ address }) => {
    printLog(`deployed token deployer at address ${address}`);
    contracts["tokenDeployed"] = `${address}`
    return axelarGatewayMultisigFactory.deploy(address)
  })
  .then((axelarGatewayMultisig) => axelarGatewayMultisig.deployed())
  .then(({ address }) => {
    printLog(`deployed axelar gateway multisig at address ${address}`);
    contracts["gatewayMultisig"] = `${address}`
    return axelarGatewayProxyFactory.deploy(address, params)
  })
  .then((axelarGatewayProxy) => axelarGatewayProxy.deployed())
  .then(({ address }) => {
    printLog(`deployed axelar gateway proxy at address ${address}`);
    contracts["gatewayProxy"] = `${address}`
    printObj(contracts)
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
