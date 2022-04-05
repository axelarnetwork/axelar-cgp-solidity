'use strict';

require('dotenv').config();

const {
  ContractFactory,
  Wallet,
  providers: { JsonRpcProvider },
  utils: { defaultAbiCoder, arrayify, computeAddress },
} = require('ethers');

const { execSync }  = require('child_process');

// define these environment variables in an .env file like:
/*
PREFIX="docker exec validator1 sh -c"
CHAIN="ethereum"
URL="http://localhost:7545"
PRIVATE_KEY="0xcf469f1c4b06a6204bb9f977fa2865271a17a4ed2028ba4c064fea4754e81c83"
ADMIN_THRESHOLD="4"*
*/
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
 
  const addresses = keys.map(key => computeAddress(`0x04${key.x}${key.y}`));

  return {
    addresses: addresses,
    threshold: JSON.parse(output).multisig_key.threshold
  }
}

console.log({admins: {addresses: admins, threshold: adminThreshold}});

const { addresses: owners, threshold: ownerThreshold } = getAddresses("master")
console.log({owners: owners, threshold: ownerThreshold })

const { addresses: operators, threshold: operatorThreshold } = getAddresses("secondary")
console.log({operators: operators, threshold: operatorThreshold })

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

tokenDeployerFactory
  .deploy()
  .then((tokenDeployer) => tokenDeployer.deployed())
  .then(({ address }) => {
    console.log(`deployed token deployer at address ${address}`);
    return axelarGatewayMultisigFactory.deploy(address)
  })
  .then((axelarGatewayMultisig) => axelarGatewayMultisig.deployed())
  .then(({ address }) => {
    console.log(`deployed axelar gateway multisig at address ${address}`);
    return axelarGatewayProxyFactory.deploy(address, params)
  })
  .then((axelarGatewayProxy) => axelarGatewayProxy.deployed())
  .then(({ address }) => {
    console.log(`deployed axelar gateway proxy at address ${address}`);

    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
