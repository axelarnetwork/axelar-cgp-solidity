// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ECDSA } from '../ECDSA.sol';

contract TestECDSA {
    using ECDSA for bytes32;

    function recover(bytes32 hash, bytes memory signature) external pure returns (address) {
        return hash.recover(signature);
    }

    function toEthSignedMessageHashPublic(bytes32 hash) external pure returns (bytes32) {
        return hash.toEthSignedMessageHash();
    }
}
