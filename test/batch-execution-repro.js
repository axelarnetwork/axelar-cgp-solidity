const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
    getRandomID,
    getRandomInt,
    getRandomString,
    getChainId,
    getGasOptions,
    buildCommandBatch,
    getSignedWeightedExecuteInput,
    getDeployCommand,
    getMintCommand,
    getBurnCommand,
    id,
    keccak256,
    getCreate2Address,
    bigNumberToNumber,
} = require('./utils');

describe('Batch Execution Reproduction', () => {
    let gateway, governance, operators, owner, notGovernance;
    let burnableMintableCappedERC20Factory, depositHandlerFactory;
    let burnTestToken, token;
    let symbols, externalSymbol, externalTokenName, externalDecimals, externalCap;
    let amount, name, symbol, decimals, cap;

    before(async () => {
        [owner, governance, notGovernance, ...operators] = await ethers.getSigners();

        // Deploy contracts
        const AxelarGateway = await ethers.getContractFactory('AxelarGateway');
        const AxelarAuthWeighted = await ethers.getContractFactory('AxelarAuthWeighted');
        const TokenDeployer = await ethers.getContractFactory('TokenDeployer');
        const BurnableMintableCappedERC20 = await ethers.getContractFactory('BurnableMintableCappedERC20');
        const DepositHandler = await ethers.getContractFactory('DepositHandler');

        const auth = await AxelarAuthWeighted.deploy([]);
        const tokenDeployer = await TokenDeployer.deploy();
        gateway = await AxelarGateway.deploy(auth.address, tokenDeployer.address);

        burnableMintableCappedERC20Factory = BurnableMintableCappedERC20;
        depositHandlerFactory = DepositHandler;

        // Setup test parameters
        symbols = ['TOKEN1', 'TOKEN2', 'TOKEN3'];
        externalSymbol = 'EXT';
        externalTokenName = 'External Token';
        externalDecimals = 18;
        externalCap = 1000000;
        amount = 1000;
        name = 'Test Token';
        symbol = 'TEST';
        decimals = 18;
        cap = 1000000;

        // Deploy external token
        burnTestToken = await burnableMintableCappedERC20Factory.deploy(
            externalTokenName,
            externalSymbol,
            externalDecimals,
            externalCap,
            owner.address,
        );
    });

    it('should reproduce batch deployment failure', async () => {
        console.log('=== Batch Deployment Test ===');
        console.log('Network:', await ethers.provider.getNetwork());
        console.log('Gateway address:', gateway.address);
        console.log(
            'Operators:',
            operators.map((op) => op.address),
        );

        try {
            // Build batch command for deploying multiple tokens
            const data = buildCommandBatch(
                await getChainId(),
                symbols.map(getRandomID),
                symbols.map(() => 'deployToken'),
                symbols.map((symbol) => getDeployCommand(symbol, symbol, decimals, 0, ethers.constants.AddressZero, 0)),
            );

            console.log('Batch data length:', data.length);
            console.log('Batch data (first 100 chars):', data.substring(0, 100));

            const input = await getSignedWeightedExecuteInput(
                data,
                operators,
                operators.map(() => 1), // equal weights
                operators.length, // threshold
                operators,
            );

            console.log('Input data length:', input.length);
            console.log('Input data (first 100 chars):', input.substring(0, 100));

            const gasOptions = getGasOptions();
            console.log('Gas options:', gasOptions);

            const tx = await gateway.execute(input, gasOptions);
            console.log('Transaction hash:', tx.hash);

            const receipt = await tx.wait();
            console.log('Transaction successful!');
            console.log('Gas used:', receipt.gasUsed.toString());
            console.log('Status:', receipt.status);
        } catch (error) {
            console.log('=== BATCH DEPLOYMENT FAILED ===');
            console.log('Error:', error.message);
            console.log('Error code:', error.code);
            console.log('Transaction data (if available):', error.transaction?.data);
            console.log('Gas limit (if available):', error.transaction?.gasLimit?.toString());
            throw error; // Re-throw to fail the test
        }
    });

    it('should reproduce batch mint failure', async () => {
        console.log('=== Batch Mint Test ===');

        // First deploy a token individually
        const deployData = buildCommandBatch(
            await getChainId(),
            [getRandomID()],
            ['deployToken'],
            [getDeployCommand(symbol, symbol, decimals, cap, ethers.constants.AddressZero, 0)],
        );

        const deployInput = await getSignedWeightedExecuteInput(
            deployData,
            operators,
            operators.map(() => 1),
            operators.length,
            operators,
        );

        await gateway.execute(deployInput, getGasOptions()).then((tx) => tx.wait());

        try {
            // Now try batch mint
            const mintData = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID()],
                ['mintToken', 'mintToken'],
                [getMintCommand(symbol, owner.address, amount), getMintCommand(symbol, owner.address, amount)],
            );

            console.log('Mint batch data length:', mintData.length);
            console.log('Mint batch data (first 100 chars):', mintData.substring(0, 100));

            const mintInput = await getSignedWeightedExecuteInput(
                mintData,
                operators,
                operators.map(() => 1),
                operators.length,
                operators,
            );

            const tx = await gateway.execute(mintInput, getGasOptions());
            console.log('Mint transaction hash:', tx.hash);

            const receipt = await tx.wait();
            console.log('Mint transaction successful!');
            console.log('Gas used:', receipt.gasUsed.toString());
        } catch (error) {
            console.log('=== BATCH MINT FAILED ===');
            console.log('Error:', error.message);
            console.log('Error code:', error.code);
            console.log('Transaction data (if available):', error.transaction?.data);
            throw error;
        }
    });

    it('should reproduce batch burn failure', async () => {
        console.log('=== Batch Burn Test ===');

        // Setup: deploy and mint a token
        const deployData = buildCommandBatch(
            await getChainId(),
            [getRandomID()],
            ['deployToken'],
            [getDeployCommand(symbol, symbol, decimals, cap, ethers.constants.AddressZero, 0)],
        );

        const deployInput = await getSignedWeightedExecuteInput(
            deployData,
            operators,
            operators.map(() => 1),
            operators.length,
            operators,
        );

        await gateway.execute(deployInput, getGasOptions()).then((tx) => tx.wait());

        const mintData = buildCommandBatch(
            await getChainId(),
            [getRandomID()],
            ['mintToken'],
            [getMintCommand(symbol, owner.address, amount)],
        );

        const mintInput = await getSignedWeightedExecuteInput(
            mintData,
            operators,
            operators.map(() => 1),
            operators.length,
            operators,
        );

        await gateway.execute(mintInput, getGasOptions()).then((tx) => tx.wait());

        // Get token address
        const tokenAddress = await gateway.tokenAddresses(symbol);
        token = await burnableMintableCappedERC20Factory.attach(tokenAddress);

        // Setup deposit handler
        const destinationAddress = getRandomString(32);
        const salt = id(`${destinationAddress}-${owner.address}-${getRandomInt(1e10)}`);
        const depositHandlerAddress = getCreate2Address(gateway.address, salt, keccak256(depositHandlerFactory.bytecode));

        const burnAmount = amount / 10;
        await token.transfer(depositHandlerAddress, burnAmount).then((tx) => tx.wait());

        try {
            // Try batch burn
            const burnData = buildCommandBatch(
                await getChainId(),
                [getRandomID(), getRandomID()],
                ['burnToken', 'burnToken'],
                [getBurnCommand(symbol, salt), getBurnCommand(symbol, salt)],
            );

            console.log('Burn batch data length:', burnData.length);
            console.log('Burn batch data (first 100 chars):', burnData.substring(0, 100));

            const burnInput = await getSignedWeightedExecuteInput(
                burnData,
                operators,
                operators.map(() => 1),
                operators.length,
                operators,
            );

            const tx = await gateway.execute(burnInput, getGasOptions());
            console.log('Burn transaction hash:', tx.hash);

            const receipt = await tx.wait();
            console.log('Burn transaction successful!');
            console.log('Gas used:', receipt.gasUsed.toString());
        } catch (error) {
            console.log('=== BATCH BURN FAILED ===');
            console.log('Error:', error.message);
            console.log('Error code:', error.code);
            console.log('Transaction data (if available):', error.transaction?.data);
            throw error;
        }
    });
});
