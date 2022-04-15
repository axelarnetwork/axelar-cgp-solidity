const { Contract, constants: {AddressZero}, getDefaultProvider } = require('ethers');
const abi = require('./build/IAxelarGasReceiver.json');
const provider = getDefaultProvider();
const contract = new Contract(AddressZero, abi.abi, provider);
(async () => {

console.log(await contract.populateTransaction.setup('0x'));
})();