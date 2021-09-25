// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import {Ownable} from './Ownable.sol';

/**
 * @title EternalStorage
 * @dev This contract holds all the necessary state variables to carry out the storage of any contract.
 */
contract EternalStorage is Ownable {
    mapping(bytes32 => uint256) uIntStorage;
    mapping(bytes32 => string) stringStorage;
    mapping(bytes32 => address) addressStorage;
    mapping(bytes32 => bytes) bytesStorage;
    mapping(bytes32 => bool) boolStorage;
    mapping(bytes32 => int256) intStorage;

    // *** Getter Methods ***
    function getUint(bytes32 key) external view returns (uint256) {
        return uIntStorage[key];
    }

    function getString(bytes32 key) external view returns (string memory) {
        return stringStorage[key];
    }

    function getAddress(bytes32 key) external view returns (address) {
        return addressStorage[key];
    }

    function getBytes(bytes32 key) external view returns (bytes memory) {
        return bytesStorage[key];
    }

    function getBool(bytes32 key) external view returns (bool) {
        return boolStorage[key];
    }

    function getInt(bytes32 key) external view returns (int256) {
        return intStorage[key];
    }

    // *** Setter Methods ***
    function setUint(bytes32 key, uint256 value) external onlyOwner {
        uIntStorage[key] = value;
    }

    function setString(bytes32 key, string memory value) external onlyOwner {
        stringStorage[key] = value;
    }

    function setAddress(bytes32 key, address value) external onlyOwner {
        addressStorage[key] = value;
    }

    function setBytes(bytes32 key, bytes memory value) external onlyOwner {
        bytesStorage[key] = value;
    }

    function setBool(bytes32 key, bool value) external onlyOwner {
        boolStorage[key] = value;
    }

    function setInt(bytes32 key, int256 value) external onlyOwner {
        intStorage[key] = value;
    }

    // *** Delete Methods ***
    function deleteUint(bytes32 key) external onlyOwner {
        delete uIntStorage[key];
    }

    function deleteString(bytes32 key) external onlyOwner {
        delete stringStorage[key];
    }

    function deleteAddress(bytes32 key) external onlyOwner {
        delete addressStorage[key];
    }

    function deleteBytes(bytes32 key) external onlyOwner {
        delete bytesStorage[key];
    }

    function deleteBool(bytes32 key) external onlyOwner {
        delete boolStorage[key];
    }

    function deleteInt(bytes32 key) external onlyOwner {
        delete intStorage[key];
    }
}
