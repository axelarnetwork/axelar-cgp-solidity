'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { toUtf8Bytes, keccak256 },
    constants: { AddressZero },
} = ethers;
const { expect } = chai;

describe('EternalStorage', () => {
    let eternalStorageFactory;
    let eternalStorage;
    let owner;

    before(async () => {
        [owner] = await ethers.getSigners();

        eternalStorageFactory = await ethers.getContractFactory('TestEternalStorage', owner);

        eternalStorage = await eternalStorageFactory.deploy().then((d) => d.deployed());
    });

    it('should store, get, and delete uint values', async () => {
        const val = 10;
        const key = keccak256(val);

        await eternalStorage.setUint(key, val).then((tx) => tx.wait());

        let getVal = await eternalStorage.getUint(key);

        expect(getVal).to.eq(val);

        await eternalStorage.deleteUint(key).then((tx) => tx.wait());

        getVal = await eternalStorage.getUint(key);

        expect(getVal).to.eq(0);
    });

    it('should store, get, and delete string values', async () => {
        const val = 'test';
        const key = keccak256(toUtf8Bytes(val));

        await eternalStorage.setString(key, val).then((tx) => tx.wait());

        let getVal = await eternalStorage.getString(key);

        expect(getVal).to.eq(val);

        await eternalStorage.deleteString(key).then((tx) => tx.wait());

        getVal = await eternalStorage.getString(key);

        expect(getVal).to.eq('');
    });

    it('should store, get, and delete address values', async () => {
        const val = owner.address;
        const key = keccak256(toUtf8Bytes(val));

        await eternalStorage.setAddress(key, val).then((tx) => tx.wait());

        let getVal = await eternalStorage.getAddress(key);

        expect(getVal).to.eq(val);

        await eternalStorage.deleteAddress(key).then((tx) => tx.wait());

        getVal = await eternalStorage.getAddress(key);

        expect(getVal).to.eq(AddressZero);
    });

    it('should store, get, and delete bytes values', async () => {
        const val = '0x1234';
        const key = keccak256(val);

        await eternalStorage.setBytes(key, val).then((tx) => tx.wait());

        let getVal = await eternalStorage.getBytes(key);

        expect(getVal).to.eq(val);

        await eternalStorage.deleteBytes(key).then((tx) => tx.wait());

        getVal = await eternalStorage.getBytes(key);

        expect(getVal).to.eq('0x');
    });

    it('should store, get, and delete bool values', async () => {
        const val = true;
        const valAsString = val.toString();
        const key = keccak256(toUtf8Bytes(valAsString));

        await eternalStorage.setBool(key, val).then((tx) => tx.wait());

        let getVal = await eternalStorage.getBool(key);

        expect(getVal).to.eq(val);

        await eternalStorage.deleteBool(key).then((tx) => tx.wait());

        getVal = await eternalStorage.getBool(key);

        expect(getVal).to.eq(false);
    });

    it('should store, get, and delete int values', async () => {
        const val = 10;
        const key = keccak256(val);

        await eternalStorage.setInt(key, val).then((tx) => tx.wait());

        let getVal = await eternalStorage.getInt(key);

        expect(getVal).to.eq(val);

        await eternalStorage.deleteInt(key).then((tx) => tx.wait());

        getVal = await eternalStorage.getInt(key);

        expect(getVal).to.eq(0);
    });
});
