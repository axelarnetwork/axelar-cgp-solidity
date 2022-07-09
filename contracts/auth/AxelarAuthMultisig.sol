// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarAuthMultisig } from '../interfaces/IAxelarAuthMultisig.sol';
import { ECDSA } from '../ECDSA.sol';
import { Ownable } from '../Ownable.sol';

contract AxelarAuthMultisig is Ownable, IAxelarAuthMultisig {
    uint256 public currentEpoch;
    mapping(uint256 => bytes32) public hashForEpoch;
    mapping(bytes32 => uint256) public epochForHash;

    uint8 internal constant OLD_KEY_RETENTION = 16;

    constructor(bytes[] memory recentOperators) {
        for (uint256 i; i < recentOperators.length; ++i) {
            _transferOperatorship(recentOperators[i]);
        }
    }

    /**************************\
    |* External Functionality *|
    \**************************/

    function validateProof(bytes32 messageHash, bytes calldata proof) external view virtual returns (bool currentOperators) {
        (address[] memory operators, bytes[] memory signatures) = abi.decode(proof, (address[], bytes[]));

        bytes32 operatorsHash = keccak256(abi.encode(operators, signatures.length));
        uint256 operatorsEpoch = epochForHash[operatorsHash];
        uint256 epoch = currentEpoch;

        if (operatorsEpoch == 0 || epoch - operatorsEpoch >= OLD_KEY_RETENTION) revert InvalidOperators();

        _validateSignatures(messageHash, operators, signatures);

        currentOperators = operatorsEpoch == epoch;
    }

    /***********************\
    |* Owner Functionality *|
    \***********************/

    function transferOperatorship(bytes calldata params) external onlyOwner {
        _transferOperatorship(params);
    }

    /**************************\
    |* Internal Functionality *|
    \**************************/

    function _transferOperatorship(bytes memory params) internal {
        _checkOperatorship(params);

        bytes32 newOperatorsHash = keccak256(params);

        if (epochForHash[newOperatorsHash] > 0) revert SameOperators();

        uint256 epoch = currentEpoch + 1;
        currentEpoch = epoch;
        hashForEpoch[epoch] = newOperatorsHash;
        epochForHash[newOperatorsHash] = epoch;
    }

    function _checkOperatorship(bytes memory params) internal virtual {
        (address[] memory newOperators, uint256 newThreshold) = abi.decode(params, (address[], uint256));
        uint256 operatorsLength = newOperators.length;

        if (operatorsLength == 0 || !_isSortedAscAndContainsNoDuplicate(newOperators)) revert InvalidOperators();

        if (newThreshold == 0 || operatorsLength < newThreshold) revert InvalidThreshold();

        emit OperatorshipTransferred(newOperators, newThreshold);
    }

    function _validateSignatures(
        bytes32 messageHash,
        address[] memory operators,
        bytes[] memory signatures
    ) internal pure virtual {
        uint256 operatorsLength = operators.length;
        uint256 operatorIndex = 0;
        // looking for signers within operators
        // assuming that both operators and signatures are sorted
        for (uint256 i = 0; i < signatures.length; ++i) {
            address signer = ECDSA.recover(messageHash, signatures[i]);
            // looping through remaining operators to find a match
            for (; operatorIndex < operatorsLength && signer != operators[operatorIndex]; ++operatorIndex) {}
            // checking if we are out of operators
            if (operatorIndex == operatorsLength) revert MalformedSigners();
            // increasing operators index if match was found
            ++operatorIndex;
        }
    }

    function _isSortedAscAndContainsNoDuplicate(address[] memory accounts) internal pure returns (bool) {
        for (uint256 i; i < accounts.length - 1; ++i) {
            if (accounts[i] >= accounts[i + 1]) {
                return false;
            }
        }

        return accounts[0] != address(0);
    }
}
