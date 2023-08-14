# Design

This document covers design aspects of Axelar's Solidity contracts implementing the [CGP spec](https://github.com/axelarnetwork/cgp-spec).

## Axelar Governance

For Axelar governance design documentation please refer to the [SDK repo](https://github.com/axelarnetwork/axelar-gmp-sdk-solidity/blob/main/DESIGN.md#axelar-governance).

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
sent by the user. It prevents re-entrancy, and while its methods are permissionless,
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

-   `AxelarGateway.execute()` takes a signed batched of commands.
    Each command has a corresponding `commandID`. This is guaranteed to be unique from the Axelar network. `execute` intentionally allows retrying
    a `commandID` if the `command` failed to be processed; this is because commands are state dependent, and someone might submit command 2 before command 1 causing it to fail.
-   Axelar network supports sending any Cosmos/ERC-20 token to any other Cosmos/EVM chain.
-   Supported tokens have 3 different types:
    -   `External`: An external ERC-20 token on its native chain is registered as external, e.g. `USDC` on Ethereum.
    -   `InternalBurnableFrom`: Axelar wrapped tokens that are minted by the Axelar network when transferring over the original token, e.g. `axlATOM`, `axlUSDC` on Avalanche.
    -   `InternalBurnable`: `v1.0.0` version of Axelar wrapped tokens that used a different deposit address contract, e.g. `UST` (native to Terra) on Avalanche.
        New tokens cannot be of this type, and this is only present for legacy support.
-   Deploying gateway contract:
    -   Deploy the `AxelarAuthWeighted` contract.
    -   Deploy the `TokenDeployer` contract.
    -   Deploy the `AxelarGateway` contract with the token deployer address.
    -   Deploy the `AxelarGatewayProxy` contract with the implementation contract address (from above) and `setup` params obtained from the current network state.
