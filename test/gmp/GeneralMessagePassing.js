'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { defaultAbiCoder, arrayify, keccak256 },
} = ethers;
const { expect } = chai;
const { deployUpgradable, deployCreate3Upgradable } = require('@axelar-network/axelar-gmp-sdk-solidity');
const ConstAddressDeployer = require('@axelar-network/axelar-gmp-sdk-solidity/dist/ConstAddressDeployer.json');
const Create3Deployer = require('@axelar-network/axelar-gmp-sdk-solidity/dist/Create3Deployer.json');
const ExpressProxyDeployer = require('@axelar-network/axelar-gmp-sdk-solidity/artifacts/contracts/express/ExpressProxyDeployer.sol/ExpressProxyDeployer.json');
const ExpressProxy = require('@axelar-network/axelar-gmp-sdk-solidity/artifacts/contracts/express/ExpressProxy.sol/ExpressProxy.json');
const ExpressRegistry = require('@axelar-network/axelar-gmp-sdk-solidity/artifacts/contracts/express/ExpressRegistry.sol/ExpressRegistry.json');

const CHAIN_ID = 1;

const GasService = require('../../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');
const GMPExpressService = require('../../artifacts/contracts/gmp-express/GMPExpressService.sol/GMPExpressService.json');
const GMPExpressServiceProxy = require('../../artifacts/contracts/gmp-express/GMPExpressServiceProxy.sol/GMPExpressServiceProxy.json');
const DestinationChainSwapExpress = require('../../artifacts/contracts/test/gmp/DestinationChainSwapExpress.sol/DestinationChainSwapExpress.json');

const {
    getWeightedAuthDeployParam,
    getSignedWeightedExecuteInput,
    getRandomID,
    getMultisigProxyDeployParams,
    getAddresses,
} = require('../utils');

describe('GeneralMessagePassing', () => {
    let ownerWallet;
    let operatorWallet;
    let userWallet;
    let adminWallet1;
    let adminWallet2;
    let adminWallet3;
    let adminWallet4;
    let adminWallet5;
    let adminWallet6;
    let adminWallets;
    let threshold;

    let sourceChainGateway;
    let destinationChainGateway;
    let gmpExpressService;
    let gasService;
    let sourceChainSwapCaller;
    let destinationChainSwapExecutable;
    let destinationChainSwapExpress;
    let destinationChainSwapExpressProxy;
    let destinationChainTokenSwapper;
    let tokenA;
    let tokenB;

    let gatewayFactory;
    let authFactory;
    let tokenDeployerFactory;
    let gatewayProxyFactory;
    let expressProxyFactory;
    let mintableCappedERC20Factory;
    let sourceChainSwapCallerFactory;
    let destinationChainSwapExecutableFactory;
    let destinationChainTokenSwapperFactory;

    let auth;
    let tokenDeployer;
    let gateway;

    const sourceChain = 'chainA';
    const destinationChain = 'chainB';
    const nameA = 'testTokenX';
    const symbolA = 'testTokenX';
    const nameB = 'testTokenY';
    const symbolB = 'testTokenY';
    const decimals = 16;
    const capacity = 0;

    const getMintData = (symbol, address, amount) =>
        arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    CHAIN_ID,
                    [getRandomID()],
                    ['mintToken'],
                    [defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount])],
                ],
            ),
        );

    before(async () => {
        [ownerWallet, operatorWallet, userWallet, adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6] =
            await ethers.getSigners();
        adminWallets = [adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6];
        threshold = 3;

        gatewayFactory = await ethers.getContractFactory('AxelarGateway', ownerWallet);
        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', ownerWallet);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', ownerWallet);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', ownerWallet);
        expressProxyFactory = await ethers.getContractFactory(ExpressProxy.abi, ExpressProxy.bytecode, ownerWallet);
        mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', ownerWallet);
        sourceChainSwapCallerFactory = await ethers.getContractFactory('SourceChainSwapCaller', ownerWallet);
        destinationChainSwapExecutableFactory = await ethers.getContractFactory('DestinationChainSwapExecutable', ownerWallet);
        destinationChainTokenSwapperFactory = await ethers.getContractFactory('DestinationChainTokenSwapper', ownerWallet);
    });

    beforeEach(async () => {
        const deployGateway = async () => {
            const adminAddresses = getAddresses(adminWallets);
            const operatorAddresses = getAddresses([operatorWallet]);

            const params = getMultisigProxyDeployParams(adminAddresses, threshold, [], threshold);

            auth = await authFactory.deploy(getWeightedAuthDeployParam([operatorAddresses], [[1]], [1])).then((d) => d.deployed());

            tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());

            const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());

            const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());

            await auth.transferOwnership(proxy.address).then((tx) => tx.wait());

            gateway = gatewayFactory.attach(proxy.address);

            return gateway;
        };

        const getTokenDeployData = (withAddress) =>
            arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [getRandomID(), getRandomID()],
                        ['deployToken', 'deployToken'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
                                [nameA, symbolA, decimals, capacity, withAddress ? tokenA.address : ethers.constants.AddressZero, 0],
                            ),
                            defaultAbiCoder.encode(
                                ['string', 'string', 'uint8', 'uint256', 'address', 'uint256'],
                                [nameB, symbolB, decimals, capacity, withAddress ? tokenB.address : ethers.constants.AddressZero, 0],
                            ),
                        ],
                    ],
                ),
            );

        sourceChainGateway = await deployGateway();
        destinationChainGateway = await deployGateway();
        const constAddressDeployerFactory = await ethers.getContractFactory(
            ConstAddressDeployer.abi,
            ConstAddressDeployer.bytecode,
            ownerWallet,
        );
        const constAddressDeployer = await constAddressDeployerFactory.deploy().then((d) => d.deployed());

        const create3DeployerFactory = await ethers.getContractFactory(Create3Deployer.abi, Create3Deployer.bytecode, ownerWallet);
        const create3Deployer = await create3DeployerFactory.deploy().then((d) => d.deployed());

        gasService = await deployUpgradable(constAddressDeployer.address, ownerWallet, GasService, GasServiceProxy, [ownerWallet.address]);

        const expressProxyDeployerFactory = await ethers.getContractFactory(
            ExpressProxyDeployer.abi,
            ExpressProxyDeployer.bytecode,
            ownerWallet,
        );
        const expressProxyDeployer = await expressProxyDeployerFactory.deploy(destinationChainGateway.address).then((d) => d.deployed());

        gmpExpressService = await deployCreate3Upgradable(create3Deployer.address, ownerWallet, GMPExpressService, GMPExpressServiceProxy, [
            destinationChainGateway.address,
            gasService.address,
            expressProxyDeployer.address,
            ownerWallet.address,
        ]);

        tokenA = await mintableCappedERC20Factory.deploy(nameA, symbolA, decimals, capacity).then((d) => d.deployed());
        tokenB = await mintableCappedERC20Factory.deploy(nameB, symbolB, decimals, capacity).then((d) => d.deployed());

        await sourceChainGateway.execute(
            await getSignedWeightedExecuteInput(getTokenDeployData(false), [operatorWallet], [1], 1, [operatorWallet]),
        );
        await destinationChainGateway.execute(
            await getSignedWeightedExecuteInput(getTokenDeployData(true), [operatorWallet], [1], 1, [operatorWallet]),
        );

        destinationChainTokenSwapper = await destinationChainTokenSwapperFactory
            .deploy(tokenA.address, tokenB.address)
            .then((d) => d.deployed());

        destinationChainSwapExecutable = await destinationChainSwapExecutableFactory
            .deploy(destinationChainGateway.address, destinationChainTokenSwapper.address)
            .then((d) => d.deployed());

        destinationChainSwapExpress = await deployCreate3Upgradable(
            create3Deployer.address,
            ownerWallet,
            DestinationChainSwapExpress,
            ExpressProxy,
            [destinationChainGateway.address, destinationChainTokenSwapper.address],
            [destinationChainGateway.address],
        );

        destinationChainSwapExpressProxy = await expressProxyFactory.attach(destinationChainSwapExpress.address);
        await destinationChainSwapExpressProxy.deployRegistry(ExpressRegistry.bytecode);

        sourceChainSwapCaller = await sourceChainSwapCallerFactory
            .deploy(sourceChainGateway.address, gasService.address, destinationChain, destinationChainSwapExecutable.address.toString())
            .then((d) => d.deployed());

        await tokenA.mint(destinationChainGateway.address, 1e9);
        await tokenB.mint(destinationChainTokenSwapper.address, 1e9);

        await sourceChainGateway.execute(
            await getSignedWeightedExecuteInput(getMintData(symbolA, userWallet.address, 1e9), [operatorWallet], [1], 1, [operatorWallet]),
        );
        await tokenA.connect(ownerWallet).mint(userWallet.address, 1e9);
    });

    describe('Executable', () => {
        it('should swap tokens on remote chain', async () => {
            const swapAmount = 1e6;
            const gasFeeAmount = 1e3;
            const convertedAmount = 2 * swapAmount;
            const payload = defaultAbiCoder.encode(['string', 'string'], [symbolB, userWallet.address.toString()]);
            const payloadHash = keccak256(payload);

            const sourceChainTokenA = mintableCappedERC20Factory
                .attach(await sourceChainGateway.tokenAddresses(symbolA))
                .connect(userWallet);
            await sourceChainTokenA.approve(sourceChainSwapCaller.address, swapAmount + gasFeeAmount);

            await expect(
                sourceChainSwapCaller
                    .connect(userWallet)
                    .swapToken(symbolA, symbolB, swapAmount, userWallet.address.toString(), { value: gasFeeAmount }),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address,
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    symbolA,
                    swapAmount,
                    gasFeeAmount,
                    userWallet.address,
                )
                .and.to.emit(sourceChainGateway, 'ContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address.toString(),
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    payload,
                    symbolA,
                    swapAmount,
                );

            const approveCommandId = getRandomID();
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveWithMintData = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [approveCommandId],
                        ['approveContractCallWithMint'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'address', 'bytes32', 'string', 'uint256', 'bytes32', 'uint256'],
                                [
                                    sourceChain,
                                    sourceChainSwapCaller.address.toString(),
                                    destinationChainSwapExecutable.address,
                                    payloadHash,
                                    symbolA,
                                    swapAmount,
                                    sourceTxHash,
                                    sourceEventIndex,
                                ],
                            ),
                        ],
                    ],
                ),
            );

            const approveExecute = await destinationChainGateway.execute(
                await getSignedWeightedExecuteInput(approveWithMintData, [operatorWallet], [1], 1, [operatorWallet]),
            );

            await expect(approveExecute)
                .to.emit(destinationChainGateway, 'ContractCallApprovedWithMint')
                .withArgs(
                    approveCommandId,
                    sourceChain,
                    sourceChainSwapCaller.address.toString(),
                    destinationChainSwapExecutable.address,
                    payloadHash,
                    symbolA,
                    swapAmount,
                    sourceTxHash,
                    sourceEventIndex,
                );

            const swap = await destinationChainSwapExecutable.executeWithToken(
                approveCommandId,
                sourceChain,
                sourceChainSwapCaller.address.toString(),
                payload,
                symbolA,
                swapAmount,
            );

            await expect(swap)
                .to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainGateway.address, destinationChainSwapExecutable.address, swapAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainTokenSwapper.address, destinationChainSwapExecutable.address, convertedAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainSwapExecutable.address, destinationChainGateway.address, convertedAmount)
                .and.to.emit(destinationChainGateway, 'TokenSent')
                .withArgs(destinationChainSwapExecutable.address, sourceChain, userWallet.address.toString(), symbolB, convertedAmount);
        });
    });

    describe('ExpressExecutable', async () => {
        it('should expressExecuteWithToken to swap on remote chain', async () => {
            const swapAmount = 1e6;
            const gasFeeAmount = 1e3;
            const convertedAmount = 2 * swapAmount;
            const payload = defaultAbiCoder.encode(['string', 'string'], [symbolB, userWallet.address.toString()]);
            const payloadHash = keccak256(payload);

            const sourceChainTokenA = mintableCappedERC20Factory
                .attach(await sourceChainGateway.tokenAddresses(symbolA))
                .connect(userWallet);
            await sourceChainTokenA.approve(sourceChainSwapCaller.address, swapAmount + gasFeeAmount);

            await expect(
                sourceChainSwapCaller
                    .connect(userWallet)
                    .swapToken(symbolA, symbolB, swapAmount, userWallet.address.toString(), { value: gasFeeAmount }),
            )
                .to.emit(gasService, 'NativeGasPaidForContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address,
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    symbolA,
                    swapAmount,
                    gasFeeAmount,
                    userWallet.address,
                )
                .and.to.emit(sourceChainGateway, 'ContractCallWithToken')
                .withArgs(
                    sourceChainSwapCaller.address.toString(),
                    destinationChain,
                    destinationChainSwapExecutable.address.toString(),
                    payloadHash,
                    payload,
                    symbolA,
                    swapAmount,
                );

            await tokenA.connect(userWallet).transfer(gmpExpressService.address, swapAmount);

            await expect(
                gmpExpressService
                    .connect(ownerWallet)
                    .callWithToken(
                        getRandomID(),
                        sourceChain,
                        sourceChainSwapCaller.address,
                        destinationChainSwapExpress.address,
                        payload,
                        symbolA,
                        swapAmount,
                    ),
            )
                .to.emit(tokenA, 'Transfer')
                .withArgs(gmpExpressService.address, destinationChainSwapExpress.address, swapAmount)
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainSwapExpress.address, destinationChainTokenSwapper.address, swapAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainTokenSwapper.address, destinationChainSwapExpress.address, convertedAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainSwapExpress.address, destinationChainGateway.address, convertedAmount)
                .and.to.emit(destinationChainGateway, 'TokenSent')
                .withArgs(destinationChainSwapExpress.address, sourceChain, userWallet.address.toString(), symbolB, convertedAmount);

            const approveCommandId = getRandomID();
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveWithMintData = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [approveCommandId],
                        ['approveContractCallWithMint'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'address', 'bytes32', 'string', 'uint256', 'bytes32', 'uint256'],
                                [
                                    sourceChain,
                                    sourceChainSwapCaller.address.toString(),
                                    destinationChainSwapExpress.address,
                                    payloadHash,
                                    symbolA,
                                    swapAmount,
                                    sourceTxHash,
                                    sourceEventIndex,
                                ],
                            ),
                        ],
                    ],
                ),
            );

            const approveExecute = await destinationChainGateway.execute(
                await getSignedWeightedExecuteInput(approveWithMintData, [operatorWallet], [1], 1, [operatorWallet]),
            );

            await expect(approveExecute)
                .to.emit(destinationChainGateway, 'ContractCallApprovedWithMint')
                .withArgs(
                    approveCommandId,
                    sourceChain,
                    sourceChainSwapCaller.address.toString(),
                    destinationChainSwapExpress.address,
                    payloadHash,
                    symbolA,
                    swapAmount,
                    sourceTxHash,
                    sourceEventIndex,
                );

            const execute = await destinationChainSwapExpress.executeWithToken(
                approveCommandId,
                sourceChain,
                sourceChainSwapCaller.address.toString(),
                payload,
                symbolA,
                swapAmount,
            );

            await expect(execute)
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainGateway.address, destinationChainSwapExpress.address, swapAmount)
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainSwapExpress.address, gmpExpressService.address, swapAmount);
        });
    });
});
