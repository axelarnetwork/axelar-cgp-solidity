'use strict';

const {
    Contract,
    utils: { defaultAbiCoder, arrayify },
} = require('ethers');
const { deployContract } = require('ethereum-waffle');

const { deployAndInitContractConstant } = require('axelar-utils-solidity');

const GasService = require('../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');

async function deployGasService(constAddressDeployerAddress, wallet, key = 'gas-service') {
    key = key || 'gas-service';
    const gasImplementation = await deployContract(wallet, GasService);
    const gasProxy = await deployAndInitContractConstant(
        constAddressDeployerAddress,
        wallet,
        GasServiceProxy,
        key,
        [],
        [gasImplementation.address, wallet.address, '0x'],
    );

    return new Contract(gasProxy.address, GasService.abi, wallet);
}

module.exports = {
    deployGasService,
};

if (require.main === module) {
    const url = process.env.URL;
    const privKey = process.env.PRIVATE_KEY;
    const constAddressDeployerAddress = process.env.CONST_ADDRESS_DEPLOYER;
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

    deployGasService(constAddressDeployerAddress, wallet, key);
}
