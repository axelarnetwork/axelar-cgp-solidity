'use strict';

const chai = require('chai');
const {
    ethers: {
        Contract,
        utils: { defaultAbiCoder, arrayify, keccak256 },
    },
} = require('hardhat');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');
chai.use(solidity);
const { expect } = chai;
const { get } = require('lodash/fp');

const CHAIN_ID = 1;

const Auth = require('../../artifacts/contracts/auth/AxelarAuthWeighted.sol/AxelarAuthWeighted.json');
const AxelarGatewayProxy = require('../../artifacts/contracts/AxelarGatewayProxy.sol/AxelarGatewayProxy.json');
const AxelarGateway = require('../../artifacts/contracts/AxelarGatewayBatched.sol/AxelarGatewayBatched.json');
const DestinationChainBatchedExecutable = require('../../artifacts/contracts/test/gmp/DestinationChainBatchedExecutable.sol/DestinationChainBatchedExecutable.json');

const { getWeightedAuthDeployParam, getSignedWeightedExecuteInput, getRandomID } = require('../utils');

describe('GeneralMessagePassingBatched', () => {
    const [ownerWallet, operatorWallet, userWallet, adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6] =
        new MockProvider().getWallets();
    const adminWallets = [adminWallet1, adminWallet2, adminWallet3, adminWallet4, adminWallet5, adminWallet6];
    const threshold = 3;

    let sourceChainGateway;
    let destinationChainGateway;
    let destinationChainExecutable;

    const sourceChain = 'chainA';
    const destinationChain = 'chainB';
    const otherChain = 'chainC';

    beforeEach(async () => {
        const deployGateway = async (chainName) => {
            const params = arrayify(
                defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [adminWallets.map(get('address')), threshold, '0x']),
            );
            const auth = await deployContract(ownerWallet, Auth, [getWeightedAuthDeployParam([[operatorWallet.address]], [[1]], [1])]);
            const gateway = await deployContract(ownerWallet, AxelarGateway, [auth.address, chainName]);
            const proxy = await deployContract(ownerWallet, AxelarGatewayProxy, [gateway.address, params]);
            await auth.transferOwnership(proxy.address);
            return new Contract(proxy.address, AxelarGateway.abi, ownerWallet);
        };

        sourceChainGateway = await deployGateway(sourceChain);
        destinationChainGateway = await deployGateway(destinationChain);

        destinationChainExecutable = await deployContract(ownerWallet, DestinationChainBatchedExecutable, [
            destinationChainGateway.address,
        ]);
    });

    describe('general message passing batched', () => {
        async function sendCall(destinationChain, val) {
            const nonce = await sourceChainGateway.getNonce();

            const payload = defaultAbiCoder.encode(['uint256'], [val]);
            const payloadHash = keccak256(payload);
            await expect(sourceChainGateway.connect(userWallet).callContract(destinationChain, destinationChainExecutable.address, payload))
                .to.emit(sourceChainGateway, 'ContractCall')
                .withArgs(
                    userWallet.address,
                    destinationChain,
                    destinationChainExecutable.address.toLowerCase(),
                    payloadHash,
                    payload,
                    nonce,
                );
            return nonce;
        }

        async function approveBatch(from, to, size) {
            const approveCommandId = getRandomID();
            const callsHash = await sourceChainGateway.getCallsHash(from, to, size);

            const validateCallsHashData = arrayify(
                defaultAbiCoder.encode(
                    ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
                    [
                        CHAIN_ID,
                        [approveCommandId],
                        ['validateCallsHash'],
                        [defaultAbiCoder.encode(['string', 'bytes32'], [sourceChain, callsHash])],
                    ],
                ),
            );

            const approveExecute = await destinationChainGateway.execute(
                await getSignedWeightedExecuteInput(validateCallsHashData, [operatorWallet], [1], 1, [operatorWallet]),
            );
            await approveExecute.wait();
        }

        async function executeCall(from, to, size, nonce, val) {
            const proof = await sourceChainGateway.getProof(from, to, size, nonce);
            const payload = defaultAbiCoder.encode(['uint256'], [val]);
            return destinationChainExecutable.execute(sourceChain, userWallet.address.toString(), payload, proof);
        }

        async function postExecute(val, execution) {
            console.log(`Execution cost: ${(await execution.wait()).gasUsed}`);
            expect(await destinationChainExecutable.val()).to.equal(val);
            expect(await destinationChainExecutable.lastSenderChain()).to.equal(sourceChain);
            expect((await destinationChainExecutable.lastSenderAddress()).toLowerCase()).to.equal(userWallet.address.toLowerCase());
        }

        it('should execute a single call in a single call batch', async () => {
            const val = 1e6;

            const nonce = await sendCall(destinationChain, val);

            await approveBatch(nonce, nonce, 1, nonce);

            const execution = await executeCall(nonce, nonce, 1, nonce, val);

            await postExecute(val, execution);
        });
        it('should execute a single call in a multiple call batch', async () => {
            const val = 1e6;

            const nonce = await sendCall(destinationChain, val);

            for (let i = 0; i < 9; i++) {
                await sendCall(otherChain, i);
            }

            await approveBatch(nonce, nonce + 9, 10);

            const execution = await executeCall(nonce, nonce + 9, 10, nonce, val);

            await postExecute(val, execution);
        });
        it('should execute a single call in a multiple nested call batch', async () => {
            const val = 1e6;

            for (let i = 0; i < 10; i++) {
                await sendCall(otherChain, i);
            }

            const nonce = await sendCall(destinationChain, val);
            
            for (let i = 0; i < 9; i++) {
                await sendCall(otherChain, i + 10);
            }

            await approveBatch(nonce - 10, nonce + 9, 4);

            const execution = await executeCall(nonce - 10, nonce + 9, 4, nonce, val);

            await postExecute(val, execution);
        });
    });
});
