const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getRandomID, getChainId, buildCommandBatch, getSignedWeightedExecuteInput, getDeployCommand } = require('./utils');

describe('zkSync Batch Execution Test', () => {
    let gateway, operators, owner;
    let threshold = 3;

    // Define getWeights locally like in AxelarGateway.js
    const getWeights = ({ length }, weight = 1) => Array(length).fill(weight);

    before(async () => {
        [owner, ...operators] = await ethers.getSigners();
        operators = operators.slice(0, threshold);

        // Simple deployment without proxy pattern
        const TokenDeployer = await ethers.getContractFactory('TokenDeployer');
        const tokenDeployer = await TokenDeployer.deploy();
        await tokenDeployer.deployTransaction.wait();

        // Create a simple mock auth contract
        const MockAuth = await ethers.getContractFactory('AxelarAuthWeighted');
        const auth = await MockAuth.deploy([]); // Deploy with empty array
        await auth.deployTransaction.wait();

        const AxelarGateway = await ethers.getContractFactory('AxelarGateway');
        gateway = await AxelarGateway.deploy(auth.address, tokenDeployer.address);
        await gateway.deployTransaction.wait();
    });

    it('should test batch deployment pattern with explicit gas limit', async () => {
        console.log('=== Testing Batch Deployment Pattern ===');

        // Mimic the exact pattern from AxelarGateway.js line 328
        const symbols = ['TOKEN1', 'TOKEN2', 'TOKEN3'];
        const decimals = 18;

        const data = buildCommandBatch(
            await getChainId(),
            symbols.map(getRandomID),
            symbols.map(() => 'deployToken'),
            symbols.map((symbol) => getDeployCommand(symbol, symbol, decimals, 0, ethers.constants.AddressZero, 0)),
        );

        console.log('Batch data length:', data.length);

        const input = await getSignedWeightedExecuteInput(data, operators, getWeights(operators), threshold, operators.slice(0, threshold));

        console.log('Input data length:', input.length);

        // Try with explicit gas limit
        const gasLimit = 10000000; // 10M gas limit
        console.log('Using explicit gas limit:', gasLimit);

        try {
            const tx = await gateway.execute(input, { gasLimit });
            const receipt = await tx.wait();

            console.log('✅ Batch deployment succeeded with explicit gas limit');
            console.log('Transaction hash:', receipt.transactionHash);
            console.log('Gas used:', receipt.gasUsed.toString());
            console.log('Status:', receipt.status);
        } catch (error) {
            console.log('❌ Batch deployment failed with explicit gas limit:');
            console.log('Error message:', error.message);
            console.log('Error code:', error.code);
            console.log('Error data:', error.data);

            if (error.transaction) {
                console.log('Transaction hash:', error.transaction.hash);
                console.log('Gas limit used:', error.transaction.gasLimit.toString());
            }

            if (error.receipt) {
                console.log('Receipt gas used:', error.receipt.gasUsed.toString());
                console.log('Receipt status:', error.receipt.status);
            }
        }
    });
});
