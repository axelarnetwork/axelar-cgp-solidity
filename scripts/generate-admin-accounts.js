'use strict';

const { Wallet } = require('ethers');
const { printObj, printLog } = require('./utils');

const numKeys = process.argv[2] || 8;
printLog(`generating ${numKeys} admin accounts`);
generateAccounts(Number(numKeys));

async function generateAccounts(numKeys) {
    var wallets = Array(numKeys);

    for (let i = 0; i < numKeys; i++) {
        wallets[i] = Wallet.createRandom();
        const wallet = wallets[i];

        printObj({
            mnemonic: wallet.mnemonic['phrase'],
            private_key: wallet.privateKey,
            public_key: wallet.publicKey,
            address: wallet.address,
        });
    }

    const threshold = Math.floor(wallets.length / 2) + (wallets.length % 2);

    printObj({ all_addresses: wallets.map((wallet) => wallet.address) });
    printObj({ threshold: threshold });
}
