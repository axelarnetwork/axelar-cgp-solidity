# Axelar Governance Protocol

## Multisig
Central to the Axelar Governance Protocol is a Multisig contract, incorporating MultisigBase and Multisig components. This contract maintains a list of signer accounts and enforces a threshold or minimum number of signers required to execute certain functions. It plays a pivotal role in defining token mint limits for the gateway.

### Voting Procedure
For each transaction, a voting process is initiated among the signers. Every time a signer casts a vote, the counter increases, and the action is recorded under the signer's address. Once the threshold is met, the transaction is carried out, and the voting counter is reset.

### Rotation of Signers
The Multisig contract facilitates a rotation mechanism for signers. Existing signers can refresh the list of signatory addresses and the threshold value using the `rotateSigners` function. Each rotation is tracked by incrementing an epoch.

### Execution of External Contracts
The Multisig contract extends its purview functionality to include external contract calls. The `execute` function allows signers to call any function on any external contract. The data accompanying this call contains the target contract's function and its associated arguments. It may also include native tokens as part of the transaction.

### Safeguards
The Multisig contract incorporates safeguards to deter misuse. These safeguards enforce preventive measures such as prohibiting multiple votes from the same account within an epoch, preventing signer duplication, and requiring transactions to meet the voting threshold before execution.

## Interchain Governance

The Interchain Governance Contract facilitates cross-chain governance actions within the Axelar network. It enables the creation, cancellation, and execution of governance proposals while incorporating a TimeLock mechanism. The TimeLock mechanism institutes a mandatory time delay before any proposal execution, thereby offering robust protection against sudden, potentially disruptive changes.

### Timelock Mechanism
The TimeLock contract institutes a mechanism that guarantees the secure execution of functions after a designated time delay. This mechanism not only enables the scheduling, cancellation, and finalization of function calls, but it also enforces a minimum time delay before any function can be either scheduled or finalized, thereby enhancing the contract's security.

### Governance Operations
The TimeLock contract manages two types of governance operations: Proposal Scheduling and Proposal Cancellation.

- **Proposal Scheduling**:  Facilitates the creation of new proposals. For each scheduled proposal, it sets a corresponding TimeLock that must expire before the proposal's execution.

- **Proposal Cancellation**: Facilitates the cancellation of an existing proposal by setting its corresponding TimeLock timestamp to zero and thereby blocking its execution.

Both operations require a match between the source chain and source address, and the governance chain and governance address in the contract. This check guarantees that only authorized entities can schedule or cancel actions.

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
