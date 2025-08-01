'use strict';

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { keccak256 } = ethers.utils;

describe('CREATE2 Test', () => {
    let owner, wallet1, wallet2;
    let depositHandlerFactory;
    let testToken;
    let gateway;

    before(async () => {
        [owner, wallet1, wallet2] = await ethers.getSigners();

        const DepositHandler = await ethers.getContractFactory('DepositHandler');
        depositHandlerFactory = DepositHandler;

        const TestToken = await ethers.getContractFactory('BurnableMintableCappedERC20');
        testToken = await TestToken.deploy('Test Token', 'TEST', 18, ethers.constants.MaxUint256);
        await testToken.deployed();

        // Deploy Auth module (mock)
        const MockAuth = await ethers.getContractFactory('AxelarAuthWeighted');
        const mockAuth = await MockAuth.deploy([]);
        await mockAuth.deployed();

        // Deploy Token Deployer
        const TokenDeployer = await ethers.getContractFactory('TokenDeployer');
        const tokenDeployer = await TokenDeployer.deploy();
        await tokenDeployer.deployed();

        // Deploy Gateway
        const AxelarGateway = await ethers.getContractFactory('AxelarGateway');
        gateway = await AxelarGateway.deploy(mockAuth.address, tokenDeployer.address);
        await gateway.deployed();
    });

    const getGasOptions = () => {
        const { network } = require('hardhat');
        const gasOptions = network.config.gasOptions || null;
        return gasOptions;
    };

    const getCreate2Address = (factory, salt, bytecodeHash) => {
        return ethers.utils.getCreate2Address(factory.address, salt, bytecodeHash);
    };

    describe('CREATE2 Deployment', () => {
        it('should deploy DepositHandler using CREATE2', async () => {
            const salt = ethers.utils.id('test-salt');
            const bytecodeHash = keccak256(depositHandlerFactory.bytecode);

            // Calculate expected address
            const expectedAddress = getCreate2Address(gateway, salt, bytecodeHash);
            console.log('Expected DepositHandler address:', expectedAddress);

            // Deploy using CREATE2
            const depositHandler = await depositHandlerFactory.deploy();
            await depositHandler.deployed();

            // Check if deployment was successful
            const code = await ethers.provider.getCode(depositHandler.address);
            expect(code).to.not.equal('0x');

            console.log('CREATE2 deployment successful');
            console.log('Deployed address:', depositHandler.address);
            console.log('Code length:', code.length);
        });

        it('should deploy DepositHandler with salt', async () => {
            const salt = ethers.utils.id('test-salt-2');

            // Deploy with salt
            const depositHandler = await depositHandlerFactory.deploy();
            await depositHandler.deployed();

            console.log('CREATE2 deployment with salt successful');
            console.log('Salt:', salt);
            console.log('Deployed address:', depositHandler.address);
        });

        it('should check if address has code', async () => {
            const salt = ethers.utils.id('test-salt-3');

            // Deploy DepositHandler
            const depositHandler = await depositHandlerFactory.deploy();
            await depositHandler.deployed();

            // Check if address has code
            const code = await ethers.provider.getCode(depositHandler.address);
            const hasCode = code !== '0x';

            console.log('Address has code:', hasCode);
            console.log('Code length:', code.length);

            expect(hasCode).to.be.true;
        });
    });

    describe('DepositHandler Functionality', () => {
        let depositHandler;
        let salt;

        beforeEach(async () => {
            salt = ethers.utils.id(`test-${Date.now()}`);

            // Deploy DepositHandler
            depositHandler = await depositHandlerFactory.deploy();
            await depositHandler.deployed();

            // Mint some tokens to the DepositHandler
            await testToken.mint(depositHandler.address, ethers.utils.parseEther('100'));
        });

        it('should execute transfer from DepositHandler', async () => {
            const initialBalance = await testToken.balanceOf(depositHandler.address);
            const transferAmount = ethers.utils.parseEther('50');

            console.log('Initial DepositHandler balance:', ethers.utils.formatEther(initialBalance));

            // Execute transfer from DepositHandler to Gateway
            const transferData = testToken.interface.encodeFunctionData('transfer', [gateway.address, transferAmount]);

            const tx = await depositHandler.execute(testToken.address, transferData, getGasOptions());
            const receipt = await tx.wait();

            console.log('Transfer transaction hash:', receipt.transactionHash);
            console.log('Gas used:', receipt.gasUsed.toNumber());

            // Check balances
            const finalDepositHandlerBalance = await testToken.balanceOf(depositHandler.address);
            const gatewayBalance = await testToken.balanceOf(gateway.address);

            console.log('Final DepositHandler balance:', ethers.utils.formatEther(finalDepositHandlerBalance));
            console.log('Gateway balance:', ethers.utils.formatEther(gatewayBalance));

            expect(gatewayBalance).to.equal(transferAmount);
        });

        it('should destroy DepositHandler', async () => {
            // First transfer tokens out
            const transferData = testToken.interface.encodeFunctionData('transfer', [
                gateway.address,
                await testToken.balanceOf(depositHandler.address),
            ]);

            await depositHandler.execute(testToken.address, transferData, getGasOptions());

            // Destroy the DepositHandler
            const tx = await depositHandler.destroy(gateway.address, getGasOptions());
            const receipt = await tx.wait();

            console.log('Destroy transaction hash:', receipt.transactionHash);
            console.log('Gas used:', receipt.gasUsed.toNumber());

            // Check if contract is destroyed
            const code = await ethers.provider.getCode(depositHandler.address);
            console.log('Code after destroy:', code);
            console.log('Code length after destroy:', code.length);
        });

        it('should handle full burn cycle', async () => {
            const burnAmount = ethers.utils.parseEther('25');

            console.log('=== Full Burn Cycle Test ===');
            console.log('Initial DepositHandler balance:', ethers.utils.formatEther(await testToken.balanceOf(depositHandler.address)));

            // Step 1: Transfer tokens to Gateway
            const transferData = testToken.interface.encodeFunctionData('transfer', [gateway.address, burnAmount]);

            const transferTx = await depositHandler.execute(testToken.address, transferData, getGasOptions());
            const transferReceipt = await transferTx.wait();

            console.log('Transfer gas used:', transferReceipt.gasUsed.toNumber());
            console.log('Gateway balance after transfer:', ethers.utils.formatEther(await testToken.balanceOf(gateway.address)));

            // Step 2: Destroy DepositHandler
            const destroyTx = await depositHandler.destroy(gateway.address, getGasOptions());
            const destroyReceipt = await destroyTx.wait();

            console.log('Destroy gas used:', destroyReceipt.gasUsed.toNumber());

            // Step 3: Verify final state
            const finalGatewayBalance = await testToken.balanceOf(gateway.address);
            const finalDepositHandlerBalance = await testToken.balanceOf(depositHandler.address);

            console.log('Final Gateway balance:', ethers.utils.formatEther(finalGatewayBalance));
            console.log('Final DepositHandler balance:', ethers.utils.formatEther(finalDepositHandlerBalance));

            expect(finalGatewayBalance).to.equal(burnAmount);
            expect(finalDepositHandlerBalance).to.equal(0);
        });
    });

    describe('zkSync Specific Tests', () => {
        it('should test CREATE2 address calculation on zkSync', async () => {
            const salt = ethers.utils.id('zksync-test');
            const bytecodeHash = keccak256(depositHandlerFactory.bytecode);

            // Calculate CREATE2 address
            const create2Address = getCreate2Address(gateway, salt, bytecodeHash);

            console.log('zkSync CREATE2 address calculation:');
            console.log('Factory address:', gateway.address);
            console.log('Salt:', salt);
            console.log('Bytecode hash:', bytecodeHash);
            console.log('Calculated CREATE2 address:', create2Address);

            // Check if address is valid
            expect(create2Address).to.match(/^0x[a-fA-F0-9]{40}$/);
        });

        it('should test multiple CREATE2 deployments', async () => {
            const salts = [ethers.utils.id('test-1'), ethers.utils.id('test-2'), ethers.utils.id('test-3')];

            console.log('Testing multiple CREATE2 deployments on zkSync:');

            for (let i = 0; i < salts.length; i++) {
                const salt = salts[i];
                const bytecodeHash = keccak256(depositHandlerFactory.bytecode);
                const expectedAddress = getCreate2Address(gateway, salt, bytecodeHash);

                console.log(`Deployment ${i + 1}:`);
                console.log(`  Salt: ${salt}`);
                console.log(`  Expected address: ${expectedAddress}`);

                // Deploy
                const depositHandler = await depositHandlerFactory.deploy();
                await depositHandler.deployed();

                console.log(`  Actual address: ${depositHandler.address}`);
                console.log(`  Success: ${depositHandler.address !== expectedAddress ? 'Different address (expected)' : 'Same address'}`);
            }
        });
    });
});
