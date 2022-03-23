require('dotenv').config();

const { ethers } = require('hardhat');

const {
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, arrayify, computeAddress },
} = ethers;

const { execSync } = require('child_process');

// these environment variables should be defined in an '.env' file
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const adminKeyIDs = JSON.parse(execSync(`${prefix} "axelard q tss external-key-id ${chain} --output json"`)).key_ids;

const admins = adminKeyIDs.map((adminKeyID) => {
    const output = execSync(`${prefix} "axelard q tss key ${adminKeyID} --output json"`);
    const key = JSON.parse(output).ecdsa_key.key;

    return computeAddress(`0x04${key.x}${key.y}`);
});

const getAddresses = (role) => {
    const keyID = execSync(`${prefix} "axelard q tss key-id ${chain} ${role}"`, { encoding: 'utf-8' }).replaceAll('\n', '');
    const output = execSync(`${prefix} "axelard q tss key ${keyID} --output json"`);
    const keys = JSON.parse(output).multisig_key.key;

    const addresses = keys.map((key) => computeAddress(`0x04${key.x}${key.y}`));

    return {
        addresses,
        threshold: JSON.parse(output).multisig_key.threshold,
    };
};

console.log({ admins: { addresses: admins, threshold: adminThreshold } });

const { addresses: owners, threshold: ownerThreshold } = getAddresses('master');
console.log({ owners, threshold: ownerThreshold });

const { addresses: operators, threshold: operatorThreshold } = getAddresses('secondary');
console.log({ operators, threshold: operatorThreshold });

const deployParams = arrayify(
    defaultAbiCoder.encode(
        ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
        [admins, adminThreshold, owners, ownerThreshold, operators, operatorThreshold],
    ),
);

const getFactories = async (wallet) => {
    const tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', wallet);
    const gatewayMultisigFactory = await ethers.getContractFactory('AxelarGatewayMultisig', wallet);
    const gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', wallet);

    return { tokenDeployerFactory, gatewayMultisigFactory, gatewayProxyFactory };
};

getFactories(wallet).then(async ({ tokenDeployerFactory, gatewayMultisigFactory, gatewayProxyFactory }) => {
    const tokenDeployer = await tokenDeployerFactory
        .deploy()
        .then((d) => d.deployed())
        .catch((err) => {
            console.error(`Failed to deploy token deployer: ${err}`);
            process.exit(1);
        });

    console.log(`Deployed token deployer to ${tokenDeployer.address}`);

    const gatewayImplementation = await gatewayMultisigFactory
        .deploy(tokenDeployer.address)
        .then((d) => d.deployed())
        .catch((err) => {
            console.error(`Failed to deploy gateway multisig implementation: ${err}`);
            process.exit(1);
        });

    console.log(`Deployed Axelar gateway multisig implementation to ${gatewayImplementation.address}`);

    const proxy = await gatewayProxyFactory
        .deploy(gatewayImplementation.address, deployParams)
        .then((d) => d.deployed())
        .catch((err) => {
            console.error(`Failed to deploy gateway proxy: ${err}`);
            process.exit(1);
        });

    console.log(`Deployed Axelar gateway proxy to ${proxy.address}`);
});
