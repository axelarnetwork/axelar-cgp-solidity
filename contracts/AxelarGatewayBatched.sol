// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGatewayBatched } from './interfaces/IAxelarGatewayBatched.sol';
import { IAxelarAuth } from './interfaces/IAxelarAuth.sol';
import { IERC20 } from './interfaces/IERC20.sol';
import { IBurnableMintableCappedERC20 } from './interfaces/IBurnableMintableCappedERC20.sol';
import { ITokenDeployer } from './interfaces/ITokenDeployer.sol';

import { ECDSA } from './ECDSA.sol';
import { DepositHandler } from './DepositHandler.sol';
import { AdminMultisigBase } from './AdminMultisigBase.sol';

contract AxelarGatewayBatched is IAxelarGatewayBatched, AdminMultisigBase {
    event Call(string destinationChain, address indexed from, bytes to, bytes payload, uint256 indexed nonce);
    event Execution(uint256 sourceChainId, address from, address to, uint256 indexed nonce);

    bytes32 public immutable selfChainHash;

    uint256 public constant SEND_OFFSET = uint256(keccak256('SEND_OFFSET'));

    // solhint-disable-next-line var-name-mixedcase
    address internal immutable AUTH_MODULE;

    /// @dev Storage slot with the address of the current implementation. `keccak256('eip1967.proxy.implementation') - 1`.
    bytes32 internal constant KEY_IMPLEMENTATION = bytes32(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc);

    // AUDIT: slot names should be prefixed with some standard string
    bytes32 internal constant PREFIX_COMMAND_EXECUTED = keccak256('command-executed');
    bytes32 internal constant PREFIX_OUTGOINGCALL = keccak256('outgoing-call');
    bytes32 internal constant PREFIX_INCOMING_CALL = keccak256('incoming-call');
    bytes32 internal constant PREFIX_INCOMING_CALLS_HASH = keccak256('incoming-calls_hash');

    bytes32 internal constant SELECTOR_VALIDATE_CALLS_HASH = keccak256('validateCallsHash');
    bytes32 internal constant SELECTOR_TRANSFER_OPERATORSHIP = keccak256('transferOperatorship');

    bytes32 internal constant NONCE_SLOT = keccak256('nonce');

    constructor(address authModule_, string memory selfChainName) {
        if (authModule_.code.length == 0) revert InvalidAuthModule();
        AUTH_MODULE = authModule_;

        selfChainHash = keccak256(bytes(selfChainName));
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();

        _;
    }

    /******************\
    |* Public Methods *|
    \******************/

    function callContract(
        string calldata destinationChain,
        bytes calldata destinationContractAddress,
        bytes calldata payload
    ) external override {
        uint256 nonce = getNonce();
        _setNonce(nonce + 1);
        bytes32 payloadHash = keccak256(payload);
        uint256 val = _getSendVal(keccak256(bytes(destinationChain)), _toBytes(msg.sender), destinationContractAddress, payloadHash);
        _setOutgoingCall(nonce, val);
        emit ContractCall(msg.sender, destinationChain, destinationContractAddress, payloadHash, payload, nonce);
    }

    function validateContractCall(
        string calldata sourceChain,
        bytes calldata sourceAddress,
        bytes32 payloadHash,
        Proof calldata proof
    ) external override returns (bool valid) {
        if (!isContractCallValid(sourceChain, sourceAddress, msg.sender, payloadHash, proof)) revert('INVALID_CALL2');
        uint256 state = _getIncomingCallState(sourceChain, proof.nonce);
        valid = (state >> (proof.nonce % 256)) & 1 == 0;

        if (valid) _setIncomingCall(sourceChain, proof.nonce, state | (1 << (proof.nonce % 256)));
    }

    /***********\
    |* Getters *|
    \***********/

    function authModule() public view returns (address) {
        return AUTH_MODULE;
    }

    function implementation() public view override returns (address) {
        return getAddress(KEY_IMPLEMENTATION);
    }

    function isCommandExecuted(bytes32 commandId) public view override returns (bool) {
        return getBool(_getIsCommandExecutedKey(commandId));
    }

    function getProof(
        uint256 from,
        uint256 to,
        uint256 leafSize,
        uint256 nonce_
    ) external view override returns (Proof memory proof) {
        uint256 treeDepth = 1;
        uint256[] memory calls = getCalls(from, to);
        uint256 length = calls.length;
        while (length > leafSize) {
            length = (length + leafSize - 1) / leafSize;
            treeDepth++;
        }
        proof.levels = new ProofLevel[](treeDepth);
        uint256 index = (nonce_ - from) / leafSize;
        uint256 end;
        for (uint256 i = treeDepth - 1; i > 0; --i) {
            end = index * leafSize + leafSize - 1;
            if (end >= calls.length) end = calls.length - 1;
            proof.levels[i] = ProofLevel(index, _getPart(calls, index * leafSize, end));
            calls = _getNextLever(calls, leafSize);
            index = index / leafSize;
        }
        proof.levels[0] = ProofLevel(index, calls);
        proof.nonce = nonce_;
        proof.batchStart = from;
        proof.batchEnd = to;
        proof.leafSize = leafSize;
    }

    function isContractCallValid(
        string calldata sourceChain,
        bytes calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        Proof calldata proof
    ) public view override returns (bool) {
        bytes32 callsHash = keccak256(abi.encode(proof.levels[0].array, proof.batchStart));
        if (!isIncomingCallsHashValid(sourceChain, callsHash)) revert('INVALID_CALL');
        uint256 length = proof.levels.length;
        for (uint256 i; i < length - 1; ++i) {
            _checkLevel(proof, i);
        }
        ProofLevel calldata lastLevel = proof.levels[length - 1];
        uint256 index = proof.nonce - proof.batchStart;
        uint256 leafSize = proof.leafSize;
        if (index / leafSize != lastLevel.index) revert('WRONG_CALL_INDEX');
        if (lastLevel.array[index % leafSize] != _getSendVal(selfChainHash, sourceAddress, _toBytes(contractAddress), payloadHash))
            revert('WRONG_CALL');
        return true;
    }

    function getNonce() public view override returns (uint256) {
        return getUint(NONCE_SLOT);
    }

    function getOutgoingCall(uint256 nonce) public view override returns (uint256 call) {
        return getUint(_getOutgoingCallKey(nonce));
    }

    function getCalls(uint256 from, uint256 to) public view override returns (uint256[] memory calls) {
        calls = new uint256[](to - from + 1);
        for (uint256 i = from; i <= to; ++i) {
            calls[i - from] = getOutgoingCall(i);
        }
    }

    function getCallsHash(
        uint256 from,
        uint256 to,
        uint256 leafSize
    ) external view override returns (bytes32 callsHash) {
        uint256[] memory calls = getCalls(from, to);
        calls = _reduceCalls(calls, leafSize);
        callsHash = keccak256(abi.encode(calls, from));
    }

    function isContractCallExecuted(string calldata sourceChain, uint256 nonce) external view override returns (bool) {
        uint256 state = _getIncomingCallState(sourceChain, nonce);
        return (state >> (nonce % 256)) & 1 > 0;
    }

    function isIncomingCallsHashValid(string calldata sourceChain, bytes32 callsHash) public view override returns (bool) {
        return getBool(_getIncomingCallsHashKey(sourceChain, callsHash));
    }

    /// @dev Returns the current `adminEpoch`.
    function adminEpoch() external view override returns (uint256) {
        return _adminEpoch();
    }

    /// @dev Returns the admin threshold for a given `adminEpoch`.
    function adminThreshold(uint256 epoch) external view override returns (uint256) {
        return _getAdminThreshold(epoch);
    }

    /// @dev Returns the array of admins within a given `adminEpoch`.
    function admins(uint256 epoch) external view override returns (address[] memory results) {
        uint256 adminCount = _getAdminCount(epoch);
        results = new address[](adminCount);

        for (uint256 i; i < adminCount; ++i) {
            results[i] = _getAdmin(epoch, i);
        }
    }

    /********************\
    |* Internal Methods *|
    \********************/

    function _checkLevel(Proof calldata proof, uint256 depth) internal pure {
        uint256 leafSize = proof.leafSize;
        uint256 index0 = proof.levels[depth].index;
        uint256 index1 = proof.levels[depth + 1].index;
        if (index1 / leafSize != index0) revert('WRONG_PROOF_INDEXING');
        uint256 arrayHash = uint256(keccak256(abi.encode(proof.levels[depth + 1].array)));
        if (arrayHash != proof.levels[depth].array[index1 % leafSize]) revert('WRONG_PROOF');
    }

    function _getPart(
        uint256[] memory array,
        uint256 from,
        uint256 to
    ) internal pure returns (uint256[] memory part) {
        part = new uint256[](to - from + 1);
        for (uint256 i = from; i <= to; ++i) {
            part[i - from] = array[i];
        }
    }

    function _hashPart(
        uint256[] memory array,
        uint256 from,
        uint256 to
    ) internal pure returns (bytes32 result) {
        result = keccak256(abi.encode(_getPart(array, from, to)));
    }

    function _getNextLever(uint256[] memory level, uint256 leafSize) internal pure returns (uint256[] memory nextLevel) {
        uint256 length = level.length;
        nextLevel = new uint256[]((length + leafSize - 1) / leafSize);
        for (uint256 i; i < nextLevel.length; ++i) {
            uint256 end = i * leafSize + leafSize - 1;
            if (end >= length) end = length - 1;
            nextLevel[i] = uint256(_hashPart(level, i * leafSize, end));
        }
    }

    function _reduceCalls(uint256[] memory level, uint256 leafSize) internal pure returns (uint256[] memory nextLevel) {
        nextLevel = level;
        while (nextLevel.length > leafSize) {
            nextLevel = _getNextLever(nextLevel, leafSize);
        }
    }

    function _getSendVal(
        bytes32 destinationChainHash,
        bytes memory from,
        bytes memory to,
        bytes32 payloadHash
    ) internal pure returns (uint256 val) {
        val = uint256(keccak256(abi.encode(destinationChainHash, from, to, payloadHash)));
    }

    function _toBytes(address a) internal pure returns (bytes memory) {
        return abi.encodePacked(a);
    }

    function _getIncomingCallState(string calldata sourceChain, uint256 nonce) internal view returns (uint256 call) {
        return getUint(_getIncomingCallKey(sourceChain, nonce));
    }

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getOutgoingCallKey(uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_OUTGOINGCALL, nonce));
    }

    function _getIncomingCallKey(string calldata sourceChain, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_INCOMING_CALL, sourceChain, nonce / 256));
    }

    function _getIncomingCallsHashKey(string memory sourceChain, bytes32 callsHash) internal pure returns (bytes32) {
        return keccak256(abi.encode(PREFIX_INCOMING_CALLS_HASH, sourceChain, callsHash));
    }

    function _getIsCommandExecutedKey(bytes32 commandId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_COMMAND_EXECUTED, commandId));
    }

    /********************\
    |* Internal Setters *|
    \********************/

    function _setNonce(uint256 nonce) internal {
        _setUint(NONCE_SLOT, nonce);
    }

    function _setOutgoingCall(uint256 nonce, uint256 val) internal {
        _setUint(_getOutgoingCallKey(nonce), val);
    }

    function _setIncomingCall(
        string calldata sourceChain,
        uint256 nonce,
        uint256 val
    ) internal {
        _setUint(_getIncomingCallKey(sourceChain, nonce), val);
    }

    function _setCommandExecuted(bytes32 commandId, bool executed) internal {
        _setBool(_getIsCommandExecutedKey(commandId), executed);
    }

    function _setImplementation(address newImplementation) internal {
        _setAddress(KEY_IMPLEMENTATION, newImplementation);
    }

    function _validateCallsHash(string memory sourceChain, bytes32 callsHash) internal {
        _setBool(_getIncomingCallsHashKey(sourceChain, callsHash), true);
    }

    /*******************\
    |* Admin Functions *|
    \*******************/

    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash,
        bytes calldata setupParams
    ) external override onlyAdmin {
        if (newImplementationCodeHash != newImplementation.codehash) revert InvalidCodeHash();

        emit Upgraded(newImplementation);

        // AUDIT: If `newImplementation.setup` performs `selfdestruct`, it will result in the loss of _this_ implementation (thereby losing the gateway)
        //        if `upgrade` is entered within the context of _this_ implementation itself.
        if (setupParams.length != 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = newImplementation.delegatecall(abi.encodeWithSelector(IAxelarGatewayBatched.setup.selector, setupParams));

            if (!success) revert SetupFailed();
        }

        _setImplementation(newImplementation);
    }

    /**********************\
    |* External Functions *|
    \**********************/

    /// @dev Not publicly accessible as overshadowed in the proxy
    function setup(bytes calldata params) external override {
        // Prevent setup from being called on a non-proxy (the implementation).
        if (implementation() == address(0)) revert NotProxy();

        (address[] memory adminAddresses, uint256 newAdminThreshold, bytes memory newOperatorsData) = abi.decode(
            params,
            (address[], uint256, bytes)
        );

        // NOTE: Admin epoch is incremented to easily invalidate current admin-related state.
        uint256 newAdminEpoch = _adminEpoch() + uint256(1);
        _setAdminEpoch(newAdminEpoch);
        _setAdmins(newAdminEpoch, adminAddresses, newAdminThreshold);

        if (newOperatorsData.length != 0) {
            IAxelarAuth(AUTH_MODULE).transferOperatorship(newOperatorsData);

            emit OperatorshipTransferred(newOperatorsData);
        }
    }

    function execute(bytes calldata input) external override {
        (bytes memory data, bytes memory proof) = abi.decode(input, (bytes, bytes));

        bytes32 messageHash = ECDSA.toEthSignedMessageHash(keccak256(data));

        // returns true for current operators
        bool allowOperatorshipTransfer = IAxelarAuth(AUTH_MODULE).validateProof(messageHash, proof);

        uint256 chainId;
        bytes32[] memory commandIds;
        string[] memory commands;
        bytes[] memory params;

        (chainId, commandIds, commands, params) = abi.decode(data, (uint256, bytes32[], string[], bytes[]));

        if (chainId != block.chainid) revert InvalidChainId();

        uint256 commandsLength = commandIds.length;

        if (commandsLength != commands.length || commandsLength != params.length) revert InvalidCommands();

        for (uint256 i; i < commandsLength; ++i) {
            bytes32 commandId = commandIds[i];

            if (isCommandExecuted(commandId)) continue; /* Ignore if duplicate commandId received */

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(commands[i]));

            if (commandHash == SELECTOR_VALIDATE_CALLS_HASH) {
                commandSelector = AxelarGatewayBatched.validateCallsHash.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                if (!allowOperatorshipTransfer) continue;

                allowOperatorshipTransfer = false;
                commandSelector = AxelarGatewayBatched.transferOperatorship.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            // Prevent a re-entrancy from executing this command before it can be marked as successful.
            _setCommandExecuted(commandId, true);
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, params[i], commandId));

            if (success) emit Executed(commandId);
            else _setCommandExecuted(commandId, false);
        }
    }

    /******************\
    |* Self Functions *|
    \******************/

    function validateCallsHash(bytes calldata params, bytes32) external onlySelf {
        (string memory sourceChain, bytes32 callsHash) = abi.decode(params, (string, bytes32));
        _validateCallsHash(sourceChain, callsHash);
    }

    function transferOperatorship(bytes calldata newOperatorsData, bytes32) external onlySelf {
        IAxelarAuth(AUTH_MODULE).transferOperatorship(newOperatorsData);

        emit OperatorshipTransferred(newOperatorsData);
    }
}
