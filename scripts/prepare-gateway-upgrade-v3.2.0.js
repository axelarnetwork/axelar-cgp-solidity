'use strict';

require('dotenv').config();

const {
    Contract,
    ContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify, keccak256 },
} = require('ethers');

const { join, resolve } = require('node:path');
const { printLog, printObj, confirm, getOwners, getOperators, getAdminAddresses, parseWei, getTxOptions } = require('./utils');

// these environment variables should be defined in an '.env' file
const contractsPath = resolve(process.env.CONTRACTS_PATH || './build');
const skipConfirm = process.env.SKIP_CONFIRM;
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const proxyAddress = process.env.PROXY_ADDRESS;
const privKey = process.env.PRIVATE_KEY;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);
const gasPrice = parseWei(process.env.GAS_PRICE);
const maxFeePerGas = parseWei(process.env.MAX_FEE_PER_GAS);
const maxPriorityFeePerGas = parseWei(process.env.MAX_PRIORITY_FEE_PER_GAS);
const gasLimit = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : Number(21000);

confirm(
    {
        CONTRACTS_PATH: contractsPath || null,
        PREFIX: prefix || null,
        CHAIN: chain || null,
        URL: url || null,
        PRIVATE_KEY: privKey || null,
        ADMIN_THRESHOLD: adminThreshold || null,
        PROXY_ADDRESS: proxyAddress || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    prefix && chain && url && privKey && adminThreshold && proxyAddress,
);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const admins = getAdminAddresses(prefix, chain);
printObj({ admins: { addresses: admins, threshold: adminThreshold } });

printLog('retrieving owner addresses');
const { addresses: owners, threshold: ownerThreshold } = getOwners(prefix, chain);
printObj({ owners, threshold: ownerThreshold });

printLog('retrieving operator addresses');
const { addresses: operators, threshold: operatorThreshold } = getOperators(prefix, chain);
printObj({ operators, threshold: operatorThreshold });

const params = defaultAbiCoder.encode(
    ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
    [admins, adminThreshold, owners, ownerThreshold, operators, operatorThreshold],
);

const TokenDeployerPath = join(contractsPath, 'TokenDeployer.json');
const TokenDeployer = require(TokenDeployerPath);
const tokenDeployerFactory = new ContractFactory(TokenDeployer.abi, TokenDeployer.bytecode, wallet);

const AxelarGatewayMultisigPath = join(contractsPath, 'AxelarGatewayMultisig.json');
const AxelarGatewayMultisig = require(AxelarGatewayMultisigPath);
const axelarGatewayMultisigFactory = new ContractFactory(AxelarGatewayMultisig.abi, AxelarGatewayMultisig.bytecode, wallet);

const AxelarGatewayPath = join(contractsPath, 'AxelarGateway.json');
const AxelarGateway = require(AxelarGatewayPath);

printLog(`deploying token deployer contract`);

tokenDeployerFactory
    .deploy()
    .then((tokenDeployer) => tokenDeployer.deployed())
    .then(({ address }) => {
        printObj({ token_deployer: address });
        printLog(`deploying gateway implementation contract`);
        return axelarGatewayMultisigFactory.deploy(address);
    })
    .then((axelarGatewayMultisig) => axelarGatewayMultisig.deployed())
    .then(async ({ address }) => {
        const newImplementationCode = await provider.getCode(address);
        const newImplementationCodeHash = keccak256(newImplementationCode);

        printLog('fetching fee data');
        const feeData = await provider.getFeeData();
        printObj({ feeData });
        const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
        printObj({ tx_options: options });

        printObj({
            upgrade_cmd: {
                gateway_implementation_address: address,
                gateway_implementation_code_hash: newImplementationCodeHash,
                params: params,
            },
        });

        const proxy = new Contract(proxyAddress, AxelarGateway.abi, wallet);
        const tx_req = await proxy.populateTransaction.upgrade(address, newImplementationCodeHash, arrayify(params));
        printObj({ upgrade_tx_data: tx_req.data });
    })
    .catch((err) => {
        console.error(err);
    });
