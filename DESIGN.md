# Design

This document covers design aspects of Axelar's Solidity contracts implementing the [CGP spec](https://github.com/axelarnetwork/cgp-spec).

## Axelar Governance

## Interchain Governance

The Interchain Governance Contract facilitates cross-chain governance actions within the Axelar network. It enables the creation, cancellation, and execution of governance proposals while incorporating a TimeLock mechanism. The TimeLock mechanism institutes a mandatory time delay before any proposal execution, thereby offering robust protection against sudden, potentially disruptive changes. This mechanism is used to govern upgrades of the Axelar Gateway contract.

### Timelock Mechanism
The TimeLock contract institutes a mechanism that guarantees the secure execution of functions after a designated time delay. This mechanism not only enables the scheduling, cancellation, and finalization of function calls, but it also enforces a minimum time delay before any function can be either scheduled or finalized, thereby enhancing the contract's security.

### Governance Operations
The TimeLock contract manages two types of governance operations: Proposal Scheduling and Proposal Cancellation.

- **Proposal Scheduling**: Facilitates the creation of new proposals. For each scheduled proposal, it sets a corresponding TimeLock that must expire before the proposal's execution.

- **Proposal Cancellation**: Facilitates the cancellation of an existing proposal by setting its corresponding TimeLock timestamp to zero and thereby blocking its execution.

Both operations require a match between the source chain and source address, and the governance chain and governance address in the contract. This check guarantees that only authorized entities can schedule or cancel actions.

### Secure Execution of Proposals
Once their corresponding TimeLock expires, proposals become executable. For ensured safety during execution, the contract revalidates the TimeLock right before initiating the proposal execution.

### Generating Proposal Hashes
The system ensures the uniqueness of each proposal by generating hashes with the Keccak256 algorithm. The hashes are derived from the target contract's address, encoded function call data, and the native token transfer value.

## Multisig
The Multisig contract maintains a list of signer accounts and enforces a threshold or minimum number of signers required to execute certain functions. It plays a pivotal role in defining token mint limits for the gateway.

### Voting Procedure
For each transaction, a voting process is initiated among the signers. Every time a signer casts a vote, the counter increases, and the action is recorded under the signer's address. Once the threshold is met, the transaction is carried out, and the voting counter is reset.

### Rotation of Signers
The Multisig contract facilitates a rotation mechanism for signers. Existing signers can refresh the list of signatory addresses and the threshold value using the `rotateSigners` function. Each rotation is tracked by incrementing an epoch.

### Execution of External Contracts
The Multisig contract's `execute` function allows signers to call any function on any external contract if the threshold number of signers trigger the method with the same args.

### Safeguards
The Multisig contract incorporates safeguards to deter misuse. These safeguards enforce preventive measures such as prohibiting multiple votes from the same account within an epoch, preventing signer duplication, and requiring transactions to meet the voting threshold before execution.

### Multisig Operations
Multisig operations demand multi-signatory authorization for proposal execution. A mapping mechanism tracks approvals for different proposals, requiring a proposal to garner sufficient approval to meet the predefined threshold before its execution.

## Axelar Service Governance

Building upon the Interchain Governance Contract, the Service Governance Contract is specifically designed to manage operations that require coordination. By incorporating `MultisigBase`, it introduces the functionality to approve, execute, and cancel multisig proposals, in addition to schedule and cancel TimeLock proposals. This is intended to be used as the owner for services such as the Interchain token service contract, allowing Axelar governance to manage it.

### Service Governance Operations
The contract orchestrates four governance operations:

- **Schedule TimeLock Proposal**: Similar to Interchain Governance, it schedules a new governance proposal with a TimeLock.

- **Cancel TimeLock Proposal**: Again, similar to Interchain Governance, it cancels an existing governance proposal.

- **Approve Multisig Proposal**: Enables multisig proposal approval, setting the approval status of the proposal to true and signaling successful approval via a `MultisigApproved` event.

- **Cancel Multisig Approval**: Cancels an approved multisig proposal, setting the approval status of the proposal to false and indicating successful cancellation through a `MultisigCancelled` event.

### Secure Execution of Multisig Proposals
Upon receiving the necessary number of signatory approvals, a multisig proposal becomes eligible for execution. Before execution, the contract verifies the proposal's approval status; if the approval status is false, the transaction is reverted. Following successful execution, the proposal's approval status is reset, and a `MultisigExecuted` event is emitted.

## Smart Contracts

Relevant smart contracts in the repo

### Interfaces

#### IAxelarGateway.sol

#### IERC20.sol

#### IERC20BurnFrom.sol

#### IAxelarExecutable.sol

This interface needs to be implemented by the application contract
to receive cross-chain messages. See the
[token swapper example](/contracts/test/gmp/DestinationChainSwapExecutable.sol) for an example.

### Contracts

#### AxelarGatewayProxy.sol

Our gateway contracts implement the proxy pattern to allow upgrades.
Calls are delegated to the implementation contract while using the proxy's storage. 
`setup` function is overridden to be an empty method on the proxy contract to prevent anyone besides the proxy contract 
from calling the implementation's `setup` on the proxy storage.

#### AxelarGateway.sol

The implementation contract that accepts commands signed by Axelar network's validators (see `execute`).
The signature proof verification is performed by `AxelarAuthWeighted` contract.

#### AxelarAuthWeighted.sol

Weighted multisig authentication contract that is used by the gateway.
It accepts a set of operators with corresponding weights. 
To verify the message weights of provided signatures are summed and need to meet the specified threshold

#### ERC20.sol

Base ERC20 contract used to deploy wrapped version of tokens on other chains.

#### ERC20Permit.sol

Allow an account to issue a spending permit to another account.

#### MintableCappedERC20.sol

Mintable ERC20 token contract with an optional capped total supply (when `capacity != 0`).
It also allows us the owner of the ERC20 contract to burn tokens for an account (`IERC20BurnFrom`).

#### BurnableMintableCappedERC20.sol

The main token contract that's deployed for Axelar wrapped version of tokens on non-native chains.
This contract allows burning tokens from deposit addresses generated (`depositAddress`) by the Axelar network, where
users send their deposits. `salt` needed to generate the address is provided in a signed burn command
from the Axelar network validators.

#### TokenDeployer.sol

When the Axelar network submits a signed command to deploy a token,
the token deployer contract is called to deploy the `BurnableMintableCappedERC20` token.
This is done to reduce the bytecode size of the gateway contract to allow deploying on EVM chains
with more restrictive gas limits.

#### DepositHandler.sol

The contract deployed at the deposit addresses that allows burning/locking of the tokens
sent by the user. It prevents re-entrancy, and while it's methods are permisionless,
the gateway deploys the deposit handler and burns/locks in the same call (see `_burnToken`).

#### Ownable.sol

Define ownership of a contract and modifiers for permissioned methods.

#### EternalStorage.sol

Storage contract for the proxy.

#### ECDSA.sol

Modified version of OpenZeppelin ECDSA signature authentication check.

#### AxelarDepositService.sol

This service is used to generate deposit addresses for an ERC20 token or native currency transfer.
The third type of deposit address is for unwrapping native currency from a wrapped ECR20 token.

#### AxelarGasService.sol

This contract is used for cross-chain gas payment. 
It accepts payments for covering gas cost on the destination chain.
Gas payment should happen with the same params right before calling `callContract` or `callContractWithToken` on the gateway.

## Notes
- `AxelarGateway.execute()` takes a signed batched of commands.
  Each command has a corresponding `commandID`. This is guaranteed to be unique from the Axelar network. `execute` intentionally allows retrying
  a `commandID` if the `command` failed to be processed; this is because commands are state dependent, and someone might submit command 2 before command 1 causing it to fail.
- Axelar network supports sending any Cosmos/ERC-20 token to any other Cosmos/EVM chain.
- Supported tokens have 3 different types:
    - `External`: An external ERC-20 token on it's native chain is registered as external, e.g. `USDC` on Ethereum.
    - `InternalBurnableFrom`: Axelar wrapped tokens that are minted by the Axelar network when transferring over the original token, e.g. `axlATOM`, `axlUSDC` on Avalanche.
    - `InternalBurnable`: `v1.0.0` version of Axelar wrapped tokens that used a different deposit address contract, e.g. `UST` (native to Terra) on Avalanche.
      New tokens cannot be of this type, and this is only present for legacy support.
- Deploying gateway contract:
    - Deploy the `AxelarAuthWeighted` contract.
    - Deploy the `TokenDeployer` contract.
    - Deploy the `AxelarGateway` contract with the token deployer address.
    - Deploy the `AxelarGatewayProxy` contract with the implementation contract address (from above) and `setup` params obtained from the current network state.
