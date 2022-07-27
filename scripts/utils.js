'use strict';

const reader = require('readline-sync');
const { execSync } = require('child_process');
const { sortBy } = require('lodash');
const {
    utils: { computeAddress, parseUnits },
} = require('ethers');

const getAddresses = (prefix, chain, role) => {
    const keyID = execSync(`${prefix} "axelard q tss key-id ${chain} ${role}"`, {
        encoding: 'utf-8',
    }).replaceAll('\n', '');
    const output = execSync(`${prefix} "axelard q tss key ${keyID} --output json"`);
    const keys = JSON.parse(output).multisig_key.key;

    const addresses = keys.map((key) => {
        const x = `${'0'.repeat(64)}${key.x}`.slice(-64);
        const y = `${'0'.repeat(64)}${key.y}`.slice(-64);
        return computeAddress(`0x04${x}${y}`);
    });

    return {
        addresses: sortBy(addresses, (address) => address.toLowerCase()),
        threshold: Number(JSON.parse(output).multisig_key.threshold),
    };
};

module.exports = {
    printLog(log) {
        console.log(JSON.stringify({ log }));
    },

    printObj(obj) {
        console.log(JSON.stringify(obj));
    },

    confirm(values, complete) {
        module.exports.printObj({ 'environment_variables:': values });

        if (!complete) {
            console.error(
                `One or more of the required environment variable not defined. Make sure to declare these variables in an .env file.`,
            );
            process.exit(1);
        }

        if (values?.SKIP_CONFIRM === 'true') {
            return;
        }

        const answer = reader.question(
            '\n' + JSON.stringify({ log: "ensure the values above are correct, and if so press 'y' to continue" }) + '\n',
        );

        if (!answer) {
            module.exports.printLog('execution cancelled');
            process.exit(0);
        }
    },

    getOwners(prefix, chain) {
        return getAddresses(prefix, chain, 'master');
    },
    getOperators(prefix, chain) {
        return getAddresses(prefix, chain, 'secondary');
    },

    getAdminAddresses(prefix, chain) {
        const adminKeyIDs = JSON.parse(execSync(`${prefix} "axelard q tss external-key-id ${chain} --output json"`)).key_ids;
        return adminKeyIDs.map((adminKeyID) => {
            const output = execSync(`${prefix} "axelard q tss key ${adminKeyID} --output json"`);
            const key = JSON.parse(output).ecdsa_key.key;

            return computeAddress(`0x04${key.x}${key.y}`);
        });
    },

    pubkeysToAddresses(pubkeys) {
        return pubkeys.map((p) => {
            const pubkey = p.startsWith('0x') ? p : '0x' + p;
            return computeAddress(pubkey);
        });
    },

    getEVMAddresses(prefix, chain) {
        const keyID = JSON.parse(execSync(`${prefix} "axelard q multisig key-id ${chain} --output json"`)).key_id;
        const evmAddresses = JSON.parse(execSync(`${prefix} "axelard q evm address ${chain} --key-id ${keyID} --output json"`));
        const sortedAddresses = sortBy(evmAddresses.addresses, (weightedAddress) => weightedAddress.address.toLowerCase());

        const addresses = sortedAddresses.map((weightedAddress) => weightedAddress.address);
        const weights = sortedAddresses.map((weightedAddress) => Number(weightedAddress.weight));
        const threshold = Number(evmAddresses.threshold);

        return { addresses, weights, threshold };
    },

    parseWei(str) {
        if (!str) {
            return;
        }

        const res = str.match(/(-?[\d.]+)([a-z%]*)/);
        return parseUnits(res[1], res[2]);
    },

    getTxOptions(feeData, envOptions) {
        if (!feeData) {
            return;
        }

        // detect if EIP-1559 is supported by the chain
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            return {
                maxFeePerGas: envOptions?.maxFeePerGas || feeData.maxFeePerGas,
                maxPriorityFeePerGas: envOptions?.maxPriorityFeePerGas || feeData.maxPriorityFeePerGas,
                gasLimit: envOptions?.gasLimit || feeData.gasLimit,
            };
        }

        if (feeData.gasPrice) {
            return {
                gasPrice: envOptions?.gasPrice || feeData.gasPrice,
                gasLimit: envOptions?.gasLimit,
            };
        }
    },
};
