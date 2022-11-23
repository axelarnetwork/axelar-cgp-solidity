'use strict';

require('dotenv').config();

const { printLog, printObj, confirm, getEVMAddresses, parseWei, getTxOptions, pubkeysToAddresses } = require('./utils');
const { ethers } = require('hardhat');
const {
    getContractFactory,
    getContractAt,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify, keccak256 },
} = ethers;

// these environment variables should be defined in an '.env' file
const skipConfirm = process.env.SKIP_CONFIRM;
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const proxyAddress = process.env.PROXY_ADDRESS;

const adminPubkeys = process.env.ADMIN_PUBKEYS;
const adminAddresses = process.env.ADMIN_ADDRESSES;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);
const gasPrice = parseWei(process.env.GAS_PRICE);
const maxFeePerGas = parseWei(process.env.MAX_FEE_PER_GAS);
const maxPriorityFeePerGas = parseWei(process.env.MAX_PRIORITY_FEE_PER_GAS);
const gasLimit = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : Number(21000);

// main execution
confirm(
    {
        PREFIX: prefix || null,
        CHAIN: chain || null,
        URL: url || null,
        PRIVATE_KEY: privKey ? '*****REDACTED*****' : null,
        PROXY_ADDRESS: proxyAddress || null,
        ADMIN_THRESHOLD: adminThreshold || null,
        ADMIN_PUBKEYS: adminPubkeys || null,
        ADMIN_ADDRESSES: adminAddresses || null,
        MAX_FEE_PER_GAS: maxFeePerGas?.toString() || null,
        MAX_PRIORITY_FEE_PER_GAS: maxPriorityFeePerGas?.toString() || null,
        GAS_PRICE: gasPrice?.toString() || null,
        GAS_LIMIT: gasLimit || null,
        SKIP_CONFIRM: skipConfirm || null,
    },
    prefix && chain && url && privKey && proxyAddress && adminThreshold && (adminPubkeys || adminAddresses),
);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

printLog('retrieving addresses');
const { addresses, weights, threshold } = getEVMAddresses(prefix, chain);
printObj({ operators: addresses, weights, threshold });
const admins = adminAddresses ? JSON.parse(adminAddresses) : pubkeysToAddresses(JSON.parse(adminPubkeys));
printObj({ admins });

const paramsAuth = [defaultAbiCoder.encode(['address[]', 'uint256[]', 'uint256'], [addresses, weights, threshold])];
const paramsUpgrade = defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [admins, adminThreshold, '0x']);

(async () => {
    printLog('fetching fee data');
    const feeData = await provider.getFeeData();
    printObj({ feeData });
    const options = getTxOptions(feeData, { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit });
    printObj({ tx_options: options });

    printLog('loading contract factories');
    // the ABIs for the contracts below must be manually downloaded/compiled
    const gatewayFactory = await getContractFactory('AxelarGateway', wallet);
    const authFactory = await getContractFactory('AxelarAuthWeighted', wallet);
    const tokenDeployerFactory = await getContractFactory('TokenDeployer', wallet);
    printLog('contract factories loaded');

    printLog(`deploying auth contract`);
    const auth = await authFactory.deploy(paramsAuth).then((d) => d.deployed());
    printObj({ auth_address: auth.address });

    printLog(`deploying token deployer contract`);
    const tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());
    printObj({ token_deployer_address: tokenDeployer.address });

    printLog(`deploying gateway implementation contract`);
    const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());
    printLog(`deployed gateway implementation at address ${gatewayImplementation.address}`);

    printLog(`transferring auth ownership to proxy address ${proxyAddress}`);
    const tx = await auth.transferOwnership(proxyAddress, options);
    await tx.wait();
    printLog(`transferred auth ownership to proxy address ${proxyAddress}`);

    const newImplementationCode = await provider.getCode(gatewayImplementation.address);
    const newImplementationCodeHash = keccak256(newImplementationCode);

    printObj({
        auth_address: auth.address,
        token_deployer_address: tokenDeployer.address,
        upgrade_cmd: {
            gateway_implementation_address: gatewayImplementation.address,
            gateway_implementation_code_hash: newImplementationCodeHash,
            params: paramsUpgrade,
        },
    });

    const proxy = await getContractAt('IAxelarGateway', proxyAddress, wallet);
    const tx_req = await proxy.populateTransaction.upgrade(
        gatewayImplementation.address,
        newImplementationCodeHash,
        arrayify(paramsUpgrade),
    );
    printObj({ upgrade_tx_data: tx_req.data });
})().catch((err) => {
    console.error(err);
});
