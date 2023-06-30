'use strict';

const chai = require('chai');
const { ethers } = require('hardhat');
const {
    utils: { defaultAbiCoder, arrayify, keccak256 },
} = ethers;
const { expect } = chai;
const { deployUpgradable } = require('@axelar-network/axelar-gmp-sdk-solidity');
const ConstAddressDeployer = require('@axelar-network/axelar-gmp-sdk-solidity/dist/ConstAddressDeployer.json');

const GasService = require('../../artifacts/contracts/gas-service/AxelarGasService.sol/AxelarGasService.json');
const GasServiceProxy = require('../../artifacts/contracts/gas-service/AxelarGasServiceProxy.sol/AxelarGasServiceProxy.json');

const {
    getWeightedAuthDeployParam,
    getSignedWeightedExecuteInput,
    getRandomID,
    getAddresses,
    getChainId,
    getWeightedProxyDeployParams,
} = require('../utils');

describe('GeneralMessagePassing', () => {
    let ownerWallet;
    let operatorWallet;
    let userWallet;

    let sourceChainGateway;
    let destinationChainGateway;
    let sourceChainGasService;
    let sourceChainSwapCaller;
    let destinationChainSwapExecutable;
    let destinationChainSwapForecallable;
    let destinationChainTokenSwapper;
    let tokenA;
    let tokenB;

    let gatewayFactory;
    let authFactory;
    let tokenDeployerFactory;
    let gatewayProxyFactory;
    let mintableCappedERC20Factory;
    let sourceChainSwapCallerFactory;
    let destinationChainSwapExecutableFactory;
    let destinationChainSwapForecallableFactory;
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

    const getMintData = async (symbol, address, amount) =>
        arrayify(
            defaultAbiCoder.encode(
                ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                [
                    await getChainId(),
                    [getRandomID()],
                    ['mintToken'],
                    [defaultAbiCoder.encode(['string', 'address', 'uint256'], [symbol, address, amount])],
                ],
            ),
        );

    before(async () => {
        [ownerWallet, operatorWallet, userWallet] = await ethers.getSigners();

        gatewayFactory = await ethers.getContractFactory('AxelarGateway', ownerWallet);
        authFactory = await ethers.getContractFactory('AxelarAuthWeighted', ownerWallet);
        tokenDeployerFactory = await ethers.getContractFactory('TokenDeployer', ownerWallet);
        gatewayProxyFactory = await ethers.getContractFactory('AxelarGatewayProxy', ownerWallet);
        mintableCappedERC20Factory = await ethers.getContractFactory('MintableCappedERC20', ownerWallet);
        sourceChainSwapCallerFactory = await ethers.getContractFactory('SourceChainSwapCaller', ownerWallet);
        destinationChainSwapExecutableFactory = await ethers.getContractFactory('DestinationChainSwapExecutable', ownerWallet);
        destinationChainSwapForecallableFactory = await ethers.getContractFactory('DestinationChainSwapForecallable', ownerWallet);
        destinationChainTokenSwapperFactory = await ethers.getContractFactory('DestinationChainTokenSwapper', ownerWallet);
    });

    beforeEach(async () => {
        const deployGateway = async () => {
            const operatorAddresses = getAddresses([operatorWallet]);

            auth = await authFactory.deploy(getWeightedAuthDeployParam([operatorAddresses], [[1]], [1])).then((d) => d.deployed());

            tokenDeployer = await tokenDeployerFactory.deploy().then((d) => d.deployed());

            const gatewayImplementation = await gatewayFactory.deploy(auth.address, tokenDeployer.address).then((d) => d.deployed());

            const params = getWeightedProxyDeployParams(ownerWallet.address, ownerWallet.address, [], [], 1);

            const proxy = await gatewayProxyFactory.deploy(gatewayImplementation.address, params).then((d) => d.deployed());

            await auth.transferOwnership(proxy.address).then((tx) => tx.wait());

            gateway = gatewayFactory.attach(proxy.address);

            return gateway;
        };

        const getTokenDeployData = async (withAddress) =>
            arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        await getChainId(),
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

        sourceChainGasService = await deployUpgradable(constAddressDeployer.address, ownerWallet, GasService, GasServiceProxy, [
            ownerWallet.address,
        ]);

        tokenA = await mintableCappedERC20Factory.deploy(nameA, symbolA, decimals, capacity).then((d) => d.deployed());
        tokenB = await mintableCappedERC20Factory.deploy(nameB, symbolB, decimals, capacity).then((d) => d.deployed());

        await sourceChainGateway.execute(
            await getSignedWeightedExecuteInput(await getTokenDeployData(false), [operatorWallet], [1], 1, [operatorWallet]),
        );
        await destinationChainGateway.execute(
            await getSignedWeightedExecuteInput(await getTokenDeployData(true), [operatorWallet], [1], 1, [operatorWallet]),
        );

        destinationChainTokenSwapper = await destinationChainTokenSwapperFactory
            .deploy(tokenA.address, tokenB.address)
            .then((d) => d.deployed());
        destinationChainSwapExecutable = await destinationChainSwapExecutableFactory
            .deploy(destinationChainGateway.address, destinationChainTokenSwapper.address)
            .then((d) => d.deployed());
        destinationChainSwapForecallable = await destinationChainSwapForecallableFactory
            .deploy(destinationChainGateway.address, destinationChainTokenSwapper.address)
            .then((d) => d.deployed());
        sourceChainSwapCaller = await sourceChainSwapCallerFactory
            .deploy(sourceChainGateway.address, sourceChainGasService.address, destinationChain, destinationChainSwapExecutable.address)
            .then((d) => d.deployed());

        await tokenA.mint(destinationChainGateway.address, 1e9);
        await tokenB.mint(destinationChainTokenSwapper.address, 1e9);

        await sourceChainGateway.execute(
            await getSignedWeightedExecuteInput(await getMintData(symbolA, userWallet.address, 1e9), [operatorWallet], [1], 1, [
                operatorWallet,
            ]),
        );
        await tokenA.connect(ownerWallet).mint(userWallet.address, 1e9);
    });

    describe('general message passing', () => {
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
                .to.emit(sourceChainGasService, 'NativeGasPaidForContractCallWithToken')
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
                        await getChainId(),
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

        it('should forecall a swap on remote chain', async () => {
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
                .to.emit(sourceChainGasService, 'NativeGasPaidForContractCallWithToken')
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

            await tokenA.connect(userWallet).approve(destinationChainSwapForecallable.address, swapAmount);

            await expect(
                destinationChainSwapForecallable
                    .connect(userWallet)
                    .forecallWithToken(sourceChain, sourceChainSwapCaller.address, payload, symbolA, swapAmount, userWallet.address),
            )
                .to.emit(tokenA, 'Transfer')
                .withArgs(userWallet.address, destinationChainSwapForecallable.address, swapAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainTokenSwapper.address, destinationChainSwapForecallable.address, convertedAmount)
                .and.to.emit(tokenB, 'Transfer')
                .withArgs(destinationChainSwapForecallable.address, destinationChainGateway.address, convertedAmount)
                .and.to.emit(destinationChainGateway, 'TokenSent')
                .withArgs(destinationChainSwapForecallable.address, sourceChain, userWallet.address.toString(), symbolB, convertedAmount);

            const approveCommandId = getRandomID();
            const sourceTxHash = keccak256('0x123abc123abc');
            const sourceEventIndex = 17;

            const approveWithMintData = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        await getChainId(),
                        [approveCommandId],
                        ['approveContractCallWithMint'],
                        [
                            defaultAbiCoder.encode(
                                ['string', 'string', 'address', 'bytes32', 'string', 'uint256', 'bytes32', 'uint256'],
                                [
                                    sourceChain,
                                    sourceChainSwapCaller.address.toString(),
                                    destinationChainSwapForecallable.address,
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
                    destinationChainSwapForecallable.address,
                    payloadHash,
                    symbolA,
                    swapAmount,
                    sourceTxHash,
                    sourceEventIndex,
                );

            const swap = await destinationChainSwapForecallable.executeWithToken(
                approveCommandId,
                sourceChain,
                sourceChainSwapCaller.address.toString(),
                payload,
                symbolA,
                swapAmount,
            );

            await expect(swap)
                .to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainGateway.address, destinationChainSwapForecallable.address, swapAmount)
                .and.to.emit(tokenA, 'Transfer')
                .withArgs(destinationChainSwapForecallable.address, userWallet.address, swapAmount);
        });
    });
});
