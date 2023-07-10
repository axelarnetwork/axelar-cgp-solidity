# Axelar Governance Protocol

## Multisig
Central to the Axelar Governance Protocol is a Multisig contract, incorporating MultisigBase and Multisig components. This contract maintains a list of signer accounts and enforces a threshold or minimum number of signers required to execute certain functions. It plays a pivotal role in defining token mint limits for the gateway.

### Voting Procedure
For each transaction, a voting process is initiated among the signers. Each time a signer casts a vote, the count increments and the act is documented against the signer's address. Upon reaching the threshold, the transaction executes and the voting counter resets.

### Rotation of Signers
The Multisig contract facilitates a rotation mechanism for signers. Existing signers can refresh the list of signatory addresses and the threshold value using the `rotateSigners` function. Each rotation is tracked by incrementing an epoch.

### Execution of External Contracts
The Multisig contract extends its purview to external contracts. The `execute` function allows signers to call any external contract. The data for this call encodes the target contract function and arguments, and may include native tokens to accompany the call.

### Safeguards
Multisig contract incorporates safeguards to deter misuse. Checks to prevent multiple votes from the same account within an epoch or duplicating a signer, as well as a requirement for transactions to meet the voting threshold before execution are in place as preventive measures.

## Interchain Governance

The Interchain Governance Contract is u enables cross-chain governance actions on the Axelar network, allowing creation, cancellation, and execution of governance proposals. It institutes a TimeLock mechanism which introduces a mandatory delay before execution, safeguarding against abrupt changes.

### Timelock Mechanism
The contract establishes a TimeLock mechanism ensuring secure function execution after a designated time delay. This mechanism supports scheduling, cancellation, and finalizing functions and imposes a minimum delay before any function can be scheduled or finalized.

### Governance Operations
The contract manages two types of governance operations: Proposal Scheduling and Proposal Cancellation.

- **Proposal Scheduling**: Facilitates the creation of a new proposal. With every scheduled proposal, a corresponding TimeLock is set, which must expire prior to its execution.

- **Proposal Cancellation**: Allows the cancellation of an existing proposal, setting its corresponding TimeLock timestamp to zero and blocking its execution.

Both operations demand matching source chain and source address with governance chain and governance address in the contract, thereby ensuring only authorized entities have scheduling or cancellation privileges.

### Secure Execution of Proposals
Proposals can be executed once their respective TimeLock has expired. To guarantee safe execution, the contract rechecks the TimeLock immediately prior to proposal execution.

### Generating Proposal Hashes
Uniqueness of each proposal is ensured through generating hashes employing the Keccak256 hashing algorithm on the target contract's address, function call data encoding, and the native token transfer value.

## Service Governance

Building upon the Interchain Governance, the Service Governance Contract specializes in addressing operations requiring coordination. Incorporating a MultisigBase, it introduces functionalities to approve, execute, and cancel multisig proposals, alongside scheduling and cancelling timelock proposals.

### Multisig Operations
Multisig operations demand multi-signatory authorization for proposal execution. A mapping mechanism tracks approvals for different proposals, requiring a proposal to garner sufficient approval to meet the predefined threshold before its execution.

### Service Governance Operations
The contract orchestrates four governance operations:

- **Schedule TimeLock Proposal**: Similar to Interchain Governance, it schedules a new governance proposal with a timelock.

- **Cancel TimeLock Proposal**: Again, akin to Interchain Governance, it cancels an existing governance proposal.

- **Approve Multisig Proposal**: Enables multisig proposal approval, setting the approval status of the proposal to true and signaling successful approval via a `MultisigApproved` event.

- **Cancel Multisig Approval**: Cancels an approved multisig proposal, setting the proposal’s status to false and indicating successful operation through a `MultisigCancelled` event.

### Secure Execution of Multisig Proposals
A multisig proposal, upon requisite signatory approval, is eligible for execution. Pre-execution, the proposal's approval status is verified by the contract; lack of approval results in transaction reversion. Upon successful execution, the proposal’s approval status resets, triggering a `MultisigExecuted` event.
