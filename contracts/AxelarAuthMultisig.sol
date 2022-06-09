// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { ECDSA } from './ECDSA.sol';
import { IAxelarAuthMultisig } from './interfaces/IAxelarAuthMultisig.sol';

contract AxelarAuthMultisig is IAxelarAuthMultisig {
    error NotGateway();
    error InvalidOperators();
    error InvalidThreshold();
    error SameOperators();
    error MalformedSigners();

    address public gateway;
    uint256 public currentEpoch;
    mapping(uint256 => bytes32) public hashForEpoch;
    mapping(bytes32 => uint256) public epochForHash;

    uint8 internal constant OLD_KEY_RETENTION = 16;

    constructor(address gatewayAddress, bytes memory operatorsData) {
        bytes[] memory operatorsWithThresholds = abi.decode(operatorsData, (bytes[]));
        uint256 operatorsLength = operatorsWithThresholds.length;

        for (uint256 i; i < operatorsLength; ++i) {
            _transferOperatorship(operatorsWithThresholds[i]);
        }

        gateway = gatewayAddress;
    }

    modifier onlyGateway() {
        if (msg.sender != gateway) revert NotGateway();

        _;
    }

    /**************************\
    |* External Functionality *|
    \**************************/

    function validateSignatureData(bytes32 messageHash, bytes calldata signatureData) external view returns (bool currentOperators) {
        (bytes memory operatorsWithThreshold, bytes[] memory signatures) = abi.decode(signatureData, (bytes, bytes[]));
        (address[] memory operators, uint256 threshold) = abi.decode(operatorsWithThreshold, (address[], uint256));

        bytes32 operatorsHash = keccak256(operatorsWithThreshold);
        uint256 epoch = currentEpoch;
        uint256 operatorsEpoch = epochForHash[operatorsHash];

        if (operatorsEpoch == 0 || epoch - operatorsEpoch > OLD_KEY_RETENTION) revert InvalidOperators();
        // TODO ask if we can have invalid signers mixed with valid ones
        if (signatures.length < threshold) revert MalformedSigners();

        _validateSignatures(messageHash, operators, signatures);

        currentOperators = operatorsEpoch == epoch;
    }

    /*************************\
    |* Gateway Functionality *|
    \*************************/

    function transferOperatorship(bytes calldata params) external onlyGateway {
        _transferOperatorship(params);
    }

    function setGateway(address gatewayAddress) external onlyGateway {
        gateway = gatewayAddress;
    }

    /**************************\
    |* Internal Functionality *|
    \**************************/

    function _transferOperatorship(bytes memory params) internal {
        (address[] memory newOperators, uint256 newThreshold) = abi.decode(params, (address[], uint256));
        uint256 epoch = currentEpoch;
        uint256 operatorsLength = newOperators.length;

        if (operatorsLength == 0 || !_isSortedAscAndContainsNoDuplicate(newOperators)) revert InvalidOperators();

        if (newThreshold == 0 || operatorsLength < newThreshold) revert InvalidThreshold();

        bytes32 newOperatorsHash = keccak256(params);

        if (newOperatorsHash == hashForEpoch[epoch]) revert SameOperators();

        ++epoch;
        currentEpoch = epoch;
        hashForEpoch[epoch] = newOperatorsHash;
        epochForHash[newOperatorsHash] = epoch;

        emit OperatorshipTransferred(newOperatorsHash, newOperators, newThreshold);
    }

    function _validateSignatures(
        bytes32 messageHash,
        address[] memory operators,
        bytes[] memory signatures
    ) internal pure {
        uint256 operatorsCount = operators.length;
        uint256 operatorsIndex = 0;
        uint256 signatureCount = signatures.length;

        // looking for signers within operators
        // assuming that both operators and signers are sorted
        for (uint256 i; i < signatureCount; ++i) {
            address signer = ECDSA.recover(messageHash, signatures[i]);
            if (signer == operators[operatorsIndex]) {
                ++operatorsIndex;
            } else {
                // keep looping through operators to find the signer
                while (operatorsIndex < operatorsCount) {
                    ++operatorsIndex;
                    if (signer == operators[operatorsIndex]) break;
                }
                // check if we ran out of operators
                if (operatorsIndex < operatorsCount) {
                    ++operatorsIndex;
                } else {
                    revert MalformedSigners();
                }
            }
        }
    }

    function _isSortedAscAndContainsNoDuplicate(address[] memory accounts) internal pure returns (bool) {
        for (uint256 i; i < accounts.length - 1; ++i) {
            if (accounts[i] >= accounts[i + 1] || accounts[i + 1] == address(0)) {
                return false;
            }
        }

        return accounts[0] != address(0);
    }
}
