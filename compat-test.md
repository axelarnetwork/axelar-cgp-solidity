
AxelarGateway
  axelar gateway proxy
    ✔ should revert on invalid gateway implementation address (102ms)
    ✔ should revert if gateway setup fails (10518ms)
    ✔ should fail on receiving native value (21456ms)
  constructor checks
    ✔ should revert if auth module is not a contract (138ms)
    ✔ should revert if token deployer is not a contract (93ms)
    ✔ check internal constants (5125ms)
  deployment params
    ✔ should get the correct governance address (76ms)
    ✔ should get the correct mint limiter address (70ms)
    ✔ should get the correct auth module (76ms)
    ✔ auth module should have the correct owner (67ms)
    ✔ should get the correct token deployer (68ms)
  check external methods that should only be called by self
    ✔ should fail on external call to deployToken (80ms)
    ✔ should fail on external call to mintToken (78ms)
    ✔ should fail on external call to burnToken (79ms)
    ✔ should fail on external call to approveContractCall (73ms)
    ✔ should fail on external call to approveContractCallWithMint (84ms)
    ✔ should fail on external call to transferOperatorship (81ms)
  should preserve the bytecode [ @skip-on-coverage ]
    ✔ should preserve the same proxy bytecode for each EVM
    ✔ should preserve the implementation bytecode for each EVM
    ✔ should have the same deposit handler bytecode preserved for each EVM
    ✔ should have the same token bytecode preserved for each EVM
  setTokenMintLimits
    ✔ should allow governance to set a token's daily limit (5279ms)
  gateway operators
    ✔ should allow transferring governance (5881ms)
    ✔ should allow transferring mint limiter (11229ms)
  upgrade
    ✔ should allow governance to upgrade to the correct implementation (10656ms)
    ✔ should allow governance to upgrade to the correct implementation with new governance and mint limiter (
10813ms)
                    ✔ should allow governance to upgrade to the correct implementation with new operators (11460ms)
    ✔ should allow governance to upgrade to the correct implementation with new governance and operators (109
62ms)
                    ✔ should allow governance to upgrade to the same implementation with new governance (846ms)
    ✔ should not allow governance to upgrade to a wrong implementation (10239ms)
    ✔ should not allow calling the setup function directly (4663ms)
    ✔ should not allow malicious proxy to call setup function directly and transfer governance or mint limite
r (5657ms)
                    ✔ should not allow calling the upgrade on the implementation (5909ms)
    ✔ should revert on upgrade if setup fails for any reason (5091ms)
  chain id
    ✔ should fail if chain id mismatches (125ms)
  command deployToken
    1) should allow operators to deploy a new token
    2) should not deploy a duplicate token
  command mintToken
    3) should not allow the operators to mint tokens exceeding the daily limit
    4) should allow the operators to mint tokens
    5) should not mint wrong symbols
  command burnToken
    burn token positive tests
burnToken internal gas: 853854
      ✔ should allow the operators to burn internal tokens (15257ms)
      6) should allow the operators to burn external tokens
      7) should allow the operators to burn external tokens even if the deposit address has ether
      8) should allow the operators to burn the external token multiple times from the same address
    burn token negative tests
      ✔ should fail if symbol does not correspond to internal token (9651ms)
      ✔ should fail to burn external tokens if deposit handler execute reverts (6279ms)
      ✔ should fail to burn external tokens if deposit handler execute fails (9507ms)
  command transferOperatorship
transferOperatorship gas: 847686
    ✔ should allow operators to transfer operatorship (5072ms)
    ✔ should not allow transferring operatorship to address zero (4860ms)
    9) should allow the previous operators to mint and burn token
    ✔ should not allow the previous operators to transfer operatorship (9482ms)
    ✔ should not allow operatorship transfer to the previous operators (9746ms)
    ✔ should not allow multiple operatorship transfers in one batch (4876ms)
  sendToken
    send token negative tests
      ✔ should fail if token deployment fails (4931ms)
    send token positive tests
      10) should burn internal token and emit an event
sendNative external gas: 323653
      ✔ should lock external token and emit an event (19544ms)
  external tokens
    ✔ should fail if external ERC20 token address is invalid (4914ms)
    11) should support external ERC20 token
  batch commands
    ✔ should revert on mismatch between commandID and command/params length (256ms)
    ✔ should batch execute multiple commands and skip any unknown commands (5757ms)
    ✔ should not execute the same commandID twice (5805ms)
  callContract
callContract gas: 174198
    ✔ should emit an event (4581ms)
  callContractWithToken
    ✔ should revert if token does not exist (83ms)
    12) should revert if token amount is invalid
    13) should burn internal token and emit an event
callContractWithToken external gas: 341361
    ✔ should lock external token and emit an event (21072ms)
  external contract approval and execution
    ✔ should approve and validate contract call (11795ms)
    ✔ should approve and validate contract call with token (20019ms)
  deprecated functions
    ✔ should return correct value for allTokensFrozen (76ms)
    ✔ should return correct value for tokenFrozen (80ms)

AxelarGatewayUpgrade
  ✔ should deploy gateway with the correct modules (362ms)
  ✔ should upgrade AxelarGateway through InterchainGovernance proposal (34225ms)


59 passing (20m)
13 failing

1) AxelarGateway
     command deployToken
       should allow operators to deploy a new token:
 AssertionError: Expected event "TokenDeployed" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:712:13)

2) AxelarGateway
     command deployToken
       should not deploy a duplicate token:
 AssertionError: Expected event "TokenDeployed" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:756:13)

3) AxelarGateway
     command mintToken
       should not allow the operators to mint tokens exceeding the daily limit:
 Error: cannot estimate gas; transaction may fail or may require manual gas limit [ See: https://links.ethers.org/v5-errors-UNPREDICTABLE_GAS_LIMIT ] (reason="execution reverted", method="estimateGas", transaction={...}, error={...}, code=UNPREDICTABLE_GAS_LIMIT, version=providers/5.7.2)
  at Logger.makeError (node_modules/@ethersproject/logger/src.ts/index.ts:269:28)
  at Logger.throwError (node_modules/@ethersproject/logger/src.ts/index.ts:281:20)
  at checkError (node_modules/@ethersproject/providers/src.ts/json-rpc-provider.ts:78:20)
  at EthersProviderWrapper.<anonymous> (node_modules/@ethersproject/providers/src.ts/json-rpc-provider.ts:642:20)
  at step (node_modules/@ethersproject/providers/lib/json-rpc-provider.js:48:23)
  at Object.throw (node_modules/@ethersproject/providers/lib/json-rpc-provider.js:29:53)
  at rejected (node_modules/@ethersproject/providers/lib/json-rpc-provider.js:21:65)
  at processTicksAndRejections (node:internal/process/task_queues:95:5)

4) AxelarGateway
     command mintToken
       should allow the operators to mint tokens:
 AssertionError: Expected event "Transfer" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:890:13)

5) AxelarGateway
     command mintToken
       should not mint wrong symbols:
 Error: call revert exception [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ] (method="balanceOf(address)", data="0x", errorArgs=null, errorName=null, errorSignature=null, reason=null, code=CALL_EXCEPTION, version=abi/5.7.0)
  at Logger.makeError (node_modules/@ethersproject/logger/src.ts/index.ts:269:28)
  at Logger.throwError (node_modules/@ethersproject/logger/src.ts/index.ts:281:20)
  at Interface.decodeFunctionResult (node_modules/@ethersproject/abi/src.ts/interface.ts:427:23)
  at Contract.<anonymous> (node_modules/@ethersproject/contracts/src.ts/index.ts:400:44)
  at step (node_modules/@ethersproject/contracts/lib/index.js:48:23)
  at Object.next (node_modules/@ethersproject/contracts/lib/index.js:29:53)
  at fulfilled (node_modules/@ethersproject/contracts/lib/index.js:20:58)
  at processTicksAndRejections (node:internal/process/task_queues:95:5)

6) AxelarGateway
     command burnToken
       burn token positive tests
         should allow the operators to burn external tokens:
 AssertionError: Expected event "Transfer" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:1049:17)

7) AxelarGateway
     command burnToken
       burn token positive tests
         should allow the operators to burn external tokens even if the deposit address has ether:
 AssertionError: Expected event "Transfer" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:1104:17)

8) AxelarGateway
     command burnToken
       burn token positive tests
         should allow the operators to burn the external token multiple times from the same address:
 AssertionError: Expected event "Executed" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:1155:17)

9) AxelarGateway
     command transferOperatorship
       should allow the previous operators to mint and burn token:
 AssertionError: Expected event "TokenDeployed" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:1384:13)

10) AxelarGateway
     sendToken
       send token positive tests
         should burn internal token and emit an event:
 Error: cannot estimate gas; transaction may fail or may require manual gas limit [ See: https://links.ethers.org/v5-errors-UNPREDICTABLE_GAS_LIMIT ] (reason="execution reverted", method="estimateGas", transaction={...}, error={...}, code=UNPREDICTABLE_GAS_LIMIT, version=providers/5.7.2)
  at Logger.makeError (node_modules/@ethersproject/logger/src.ts/index.ts:269:28)
  at Logger.throwError (node_modules/@ethersproject/logger/src.ts/index.ts:281:20)
  at checkError (node_modules/@ethersproject/providers/src.ts/json-rpc-provider.ts:78:20)
  at EthersProviderWrapper.<anonymous> (node_modules/@ethersproject/providers/src.ts/json-rpc-provider.ts:642:20)
  at step (node_modules/@ethersproject/providers/lib/json-rpc-provider.js:48:23)
  at Object.throw (node_modules/@ethersproject/providers/lib/json-rpc-provider.js:29:53)
  at rejected (node_modules/@ethersproject/providers/lib/json-rpc-provider.js:21:65)
  at processTicksAndRejections (node:internal/process/task_queues:95:5)

11) AxelarGateway
     external tokens
       should support external ERC20 token:
 AssertionError: Expected event "Transfer" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:1732:13)

12) AxelarGateway
     callContractWithToken
       should revert if token amount is invalid:
 AssertionError: Expected transaction to be reverted with custom error 'InvalidAmount', but it reverted with custom error 'TokenDoesNotExist'
  at processTicksAndRejections (node:internal/process/task_queues:95:5)
  at expectRevert (test/utils.js:95:9)
  at Context.<anonymous> (test/AxelarGateway.js:1931:13)

13) AxelarGateway
     callContractWithToken
       should burn internal token and emit an event:
 AssertionError: Expected event "Approval" to be emitted, but it wasn't
  at Context.<anonymous> (test/AxelarGateway.js:1966:13)


---

RpcCompatibility
  ✔ should support RPC method eth_blockNumber
  ✔ should support RPC method eth_call (5391ms)
  ✔ should support RPC method eth_getCode
  ✔ should support RPC method eth_gasPrice
  ✔ should support RPC method eth_chainId (40ms)
  ✔ should support RPC method eth_getTransactionCount (4751ms)
  1) should support RPC method eth_sendRawTransaction [ @skip-on-coverage ]
  ✔ should support RPC method eth_getBalance
  ✔ should support RPC method eth_syncing
  ✔ should support RPC method eth_subscribe (9125ms)
  ✔ should return consistent logIndex values between eth_getLogs and eth_getTransactionReceipt (3024ms)
  eth_getLogs
    ✔ should support RPC method eth_getLogs (69ms)
    ✔ supports safe tag (14573ms)
    ✔ should have valid parent hash
    ✔ should fail on querying eth_getLogs with a random blockHash (63ms)
    supports finalized tag
      ✔ should return latest.number > finalized.number (855ms)
  rpc get transaction and blockByHash methods
    ✔ should support RPC method eth_getTransactionReceipt (49ms)
    ✔ should support RPC method eth_getTransactionByHash
    ✔ should support RPC method eth_getBlockByHash (67ms)
  eth_getBlockByNumber
    ✔ should support RPC method eth_getBlockByNumber (220ms)
    ✔ supports safe tag (1791ms)
    2) supports finalized tag
    ✔ should have valid parent hashes
  eth_estimateGas
    3) should support RPC method eth_estimateGas like ethereum mainnet
    4) should send tx with estimated gas
  eip-1559 supported rpc methods
    5) should support RPC method eth_maxPriorityFeePerGas
    6) should send transaction based on RPC method eth_feeHistory pricing

21 passing (1m)
6 failing

1) RpcCompatibility
     should support RPC method eth_sendRawTransaction [ @skip-on-coverage ]:

    AssertionError: expected '0xddf252ad1be2c89b69c2b068fc378daa952…' to equal '0x4273d0736f60e0dedfe745e86718093d8ec…'
    + expected - actual

    -0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    +0x4273d0736f60e0dedfe745e86718093d8ec8646ebd2a60cd60643eeced565811
    
    at checkReceipt (test/RpcCompatibility.js:32:46)
    at Context.<anonymous> (test/RpcCompatibility.js:388:15)

2) RpcCompatibility
     eth_getBlockByNumber
       supports finalized tag:

    AssertionError: expected 14779 to be at most 12000
    + expected - actual

    -14779
    +12000
    
    at checkBlockTimeStamp (test/RpcCompatibility.js:39:38)
    at Context.<anonymous> (test/RpcCompatibility.js:271:13)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

3) RpcCompatibility
     eth_estimateGas
       should support RPC method eth_estimateGas like ethereum mainnet:

    AssertionError: expected 314990 to be below 30000. The numerical values of the given "ethers.BigNumber" and "number" inputs were compared, and they differed.
    + expected - actual

    -314990
    +30000
    
    at Context.<anonymous> (test/RpcCompatibility.js:328:31)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

4) RpcCompatibility
     eth_estimateGas
       should send tx with estimated gas:

    AssertionError: expected '0xddf252ad1be2c89b69c2b068fc378daa952…' to equal '0x4273d0736f60e0dedfe745e86718093d8ec…'
    + expected - actual

    -0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    +0x4273d0736f60e0dedfe745e86718093d8ec8646ebd2a60cd60643eeced565811
    
    at checkReceipt (test/RpcCompatibility.js:32:46)
    at Context.<anonymous> (test/RpcCompatibility.js:338:19)

5) RpcCompatibility
     eip-1559 supported rpc methods
       should support RPC method eth_maxPriorityFeePerGas:

    AssertionError: expected '0xddf252ad1be2c89b69c2b068fc378daa952…' to equal '0x4273d0736f60e0dedfe745e86718093d8ec…'
    + expected - actual

    -0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    +0x4273d0736f60e0dedfe745e86718093d8ec8646ebd2a60cd60643eeced565811
    
    at checkReceipt (test/RpcCompatibility.js:32:46)
    at Context.<anonymous> (test/RpcCompatibility.js:460:23)

6) RpcCompatibility
     eip-1559 supported rpc methods
       should send transaction based on RPC method eth_feeHistory pricing:

    AssertionError: expected '0xddf252ad1be2c89b69c2b068fc378daa952…' to equal '0x4273d0736f60e0dedfe745e86718093d8ec…'
    + expected - actual

    -0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    +0x4273d0736f60e0dedfe745e86718093d8ec8646ebd2a60cd60643eeced565811
    
    at checkReceipt (test/RpcCompatibility.js:32:46)
    at Context.<anonymous> (test/RpcCompatibility.js:496:19)
