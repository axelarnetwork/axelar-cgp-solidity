'use strict';

const {
    Contract,
    utils: { defaultAbiCoder, arrayify },
} = require('ethers');
const { deployContract } = require('ethereum-waffle');

const { deployAndInitContractConstant } = require('axelar-utils-solidity');

const DepositService = require('../artifacts/contracts/deposit-service/AxelarDepositService.sol/AxelarDepositService.json');
const DepositServiceProxy = require('../artifacts/contracts/deposit-service/AxelarDepositServiceProxy.sol/AxelarDepositServiceProxy.json');

async function deployDepositService(constAddressDeployerAddress, gatewayAddress, tokenSymbol, wallet, key = 'gas-deposit') {
    key = key || 'deposit-service';

    const depositImplementation = await deployContract(wallet, DepositService);
    const setupParams = arrayify(defaultAbiCoder.encode(['address', 'string'], [gatewayAddress, tokenSymbol]));

    const depositProxy = await deployAndInitContractConstant(
        constAddressDeployerAddress,
        wallet,
        DepositServiceProxy,
        'deposit-service',
        [],
        [depositImplementation.address, wallet.address, setupParams],
    );

    return new Contract(depositProxy.address, DepositService.abi, wallet);
}

module.exports = {
    deployDepositService,
};

if (require.main === module) {
    const url = process.env.URL;
    const privKey = process.env.PRIVATE_KEY;
    const constAddressDeployerAddress = process.env.CONST_ADDRESS_DEPLOYER;
    const gatewayAddress = process.env.GATEWAY_ADDRESS;
    const tokenSymbol = process.env.TOKEN_SYMBOL;
    const key = process.env.SALT_KEY;

    printObj({
        'environment_variables:': {
            CONTRACTS_PATH: contractsPath || null,
            PREFIX: prefix || null,
            CHAIN: chain || null,
            URL: url || null,
            PRIVATE_KEY: privKey || null,
            ADMIN_THRESHOLD: adminThreshold || null,
        },
    });

    if (!(prefix && chain && url && privKey && adminThreshold)) {
        console.error(
            `One or more of the required environment variable not defined. Make sure to declare these variables in an .env file.`,
        );
        process.exit(1);
    }
    const provider = new JsonRpcProvider(url);
    const wallet = new Wallet(privKey, provider);

    deployDepositService(constAddressDeployerAddress, gatewayAddress, tokenSymbol, wallet, key);
}
