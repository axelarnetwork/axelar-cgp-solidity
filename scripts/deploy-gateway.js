'use strict';

require('dotenv').config();

const {
  ContractFactory,
  Wallet,
  providers: { JsonRpcProvider },
  utils: { defaultAbiCoder, arrayify },
} = require('ethers');

const utils = require('ethers').utils
const execSync = require('child_process').execSync;

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

const adminKeyIDs = JSON.parse(execSync(`${prefix} "axelard q tss external-key-id ${chain} --output json"`, { encoding: 'utf-8' })).key_ids;
var admins = [];

adminKeyIDs.forEach(function(id) {
  let output = execSync(`${prefix} "axelard q tss key ${id} --output json"`, { encoding: 'utf-8' });
  let key = JSON.parse(output).ecdsa_key.key;
  const addr = utils.computeAddress(`0x04${key.x}${key.y}`);
  admins.push(addr);
});

var getAddresses = function(role) {
  let keyID = execSync(`${prefix} "axelard q tss key-id ${chain} ${role}"`, { encoding: 'utf-8' }).replaceAll('\n','');
  let output = execSync(`${prefix} "axelard q tss key ${keyID} --output json"`, { encoding: 'utf-8' });
  const keys = JSON.parse(output).multisig_key.key;
  var addresses = [];
 
  keys.forEach(function(key) {
    const addr = utils.computeAddress(`0x04${key.x}${key.y}`);
    addresses.push(addr);
  });

  return {
    addresses: addresses,
    threshold: JSON.parse(output).multisig_key.threshold
  }
}

console.log({admins: {addresses: admins, threshold: adminThreshold}});

let obj = getAddresses("master")
console.log({owners: obj})

const owners = obj.addresses
const ownerThreshold = obj.threshold

obj = getAddresses("secondary")
console.log({operators: obj})

const operators = obj.addresses
const operatorThreshold = obj.threshold



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
