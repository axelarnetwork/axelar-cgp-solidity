// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarAuth } from '../interfaces/IAxelarAuth.sol';
import { IAxelarAuthWeighted } from '../interfaces/IAxelarAuthWeighted.sol';
import { ECDSA } from '../ECDSA.sol';
import { AxelarAuthMultisig } from './AxelarAuthMultisig.sol';

contract AxelarAuthWeighted is AxelarAuthMultisig, IAxelarAuthWeighted {
    constructor(bytes[] memory recentOperators) AxelarAuthMultisig(recentOperators) {}

    /**************************\
    |* External Functionality *|
    \**************************/

    function validateProof(bytes32 messageHash, bytes calldata proof)
        external
        view
        override(AxelarAuthMultisig, IAxelarAuth)
        returns (bool currentOperators)
    {
        (address[] memory operators, uint256[] memory weights, uint256 threshold, bytes[] memory signatures) = abi.decode(
            proof,
            (address[], uint256[], uint256, bytes[])
        );

        bytes32 operatorsHash = keccak256(abi.encode(operators, weights, threshold));
        uint256 operatorsEpoch = epochForHash[operatorsHash];
        uint256 epoch = currentEpoch;

        if (operatorsEpoch == 0 || epoch - operatorsEpoch >= OLD_KEY_RETENTION) revert InvalidOperators();

        _validateSignatures(messageHash, operators, weights, threshold, signatures);

        currentOperators = operatorsEpoch == epoch;
    }

    /**************************\
    |* Internal Functionality *|
    \**************************/

    function _checkOperatorship(bytes memory params) internal override {
        (address[] memory newOperators, uint256[] memory newWeights, uint256 newThreshold) = abi.decode(
            params,
            (address[], uint256[], uint256)
        );
        uint256 operatorsLength = newOperators.length;
        uint256 weightsLength = newWeights.length;

        if (operatorsLength == 0 || !_isSortedAscAndContainsNoDuplicate(newOperators)) revert InvalidOperators();

        if (weightsLength != operatorsLength) revert InvalidWeights();

        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weightsLength; ++i) {
            totalWeight += newWeights[i];
        }
        if (newThreshold == 0 || totalWeight < newThreshold) revert InvalidThreshold();

        emit WeightedOperatorshipTransferred(newOperators, newWeights, newThreshold);
    }

    function _validateSignatures(
        bytes32 messageHash,
        address[] memory operators,
        uint256[] memory weights,
        uint256 threshold,
        bytes[] memory signatures
    ) internal pure virtual {
        uint256 operatorsLength = operators.length;
        uint256 operatorIndex = 0;
        uint256 weight = 0;
        // looking for signers within operators
        // assuming that both operators and signatures are sorted
        for (uint256 i = 0; i < signatures.length; ++i) {
            address signer = ECDSA.recover(messageHash, signatures[i]);
            // looping through remaining operators to find a match
            for (; operatorIndex < operatorsLength && signer != operators[operatorIndex]; ++operatorIndex) {}
            // checking if we are out of operators
            if (operatorIndex == operatorsLength) revert MalformedSigners();
            // return if weight sum above threshold
            weight += weights[operatorIndex];
            if (weight >= threshold) return;
            // increasing operators index if match was found
            ++operatorIndex;
        }
        // if weight sum below threshold
        revert MalformedSigners();
    }
}
