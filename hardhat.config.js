require('@nomicfoundation/hardhat-toolbox');

const fs = require('fs');
const env = process.env.ENV || 'testnet';
const { importNetworks } = require('@axelar-network/axelar-contract-deployments/evm/utils');
const chains = require(`@axelar-network/axelar-contract-deployments/info/${env}.json`);
const keys = fs.existsSync('./info/keys.json') ? require('./info/keys.json') : undefined; // Load keys if they exist
const { networks, etherscan } = importNetworks(chains, keys);

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        version: '0.8.9',
        settings: {
            evmVersion: process.env.EVM_VERSION || 'london',
            optimizer: {
                enabled: true,
                runs: 1000,
                details: {
                    peephole: true,
                    inliner: true,
                    jumpdestRemover: true,
                    orderLiterals: true,
                    deduplicate: true,
                    cse: true,
                    constantOptimizer: true,
                    yul: true,
                    yulDetails: {
                        stackAllocation: true,
                    },
                },
            },
        },
    },
    defaultNetwork: 'hardhat',
    networks: networks,
    etherscan: etherscan,
    mocha: {
        timeout: 1000000,
    },
    gasReporter: {
        enabled: (process.env.REPORT_GAS !== undefined),
    },
};
