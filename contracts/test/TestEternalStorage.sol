// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { EternalStorage } from '../EternalStorage.sol';

contract TestEternalStorage is EternalStorage {
    // *** Set Methods ***
    function setUint(bytes32 key, uint256 value) external {
        _setUint(key, value);
    }

    function setString(bytes32 key, string memory value) external {
        _setString(key, value);
    }

    function setAddress(bytes32 key, address value) external {
        _setAddress(key, value);
    }

    function setBytes(bytes32 key, bytes memory value) external {
        _setBytes(key, value);
    }

    function setBool(bytes32 key, bool value) external {
        _setBool(key, value);
    }

    function setInt(bytes32 key, int256 value) external {
        _setInt(key, value);
    }

    // *** Delete Methods ***
    function deleteUint(bytes32 key) external {
        _deleteUint(key);
    }

    function deleteString(bytes32 key) external {
        _deleteString(key);
    }

    function deleteAddress(bytes32 key) external {
        _deleteAddress(key);
    }

    function deleteBytes(bytes32 key) external {
        _deleteBytes(key);
    }

    function deleteBool(bytes32 key) external {
        _deleteBool(key);
    }

    function deleteInt(bytes32 key) external {
        _deleteInt(key);
    }
}
