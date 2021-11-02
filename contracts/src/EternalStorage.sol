// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

/**
 * @title EternalStorage
 * @dev This contract holds all the necessary state variables to carry out the storage of any contract.
 */
contract EternalStorage {
    mapping(bytes32 => uint256) private uIntStorage;
    mapping(bytes32 => string) private stringStorage;
    mapping(bytes32 => address) private addressStorage;
    mapping(bytes32 => bytes) private bytesStorage;
    mapping(bytes32 => bool) private boolStorage;
    mapping(bytes32 => int256) private intStorage;

    // *** Getter Methods ***
    function getUint(bytes32 key) public view returns (uint256) {
        return uIntStorage[key];
    }

    function getString(bytes32 key) public view returns (string memory) {
        return stringStorage[key];
    }

    function getAddress(bytes32 key) public view returns (address) {
        return addressStorage[key];
    }

    function getBytes(bytes32 key) public view returns (bytes memory) {
        return bytesStorage[key];
    }

    function getBool(bytes32 key) public view returns (bool) {
        return boolStorage[key];
    }

    function getInt(bytes32 key) public view returns (int256) {
        return intStorage[key];
    }

    // *** Setter Methods ***
    function setUint(bytes32 key, uint256 value) internal {
        uIntStorage[key] = value;
    }

    function setString(bytes32 key, string memory value) internal {
        stringStorage[key] = value;
    }

    function setAddress(bytes32 key, address value) internal {
        addressStorage[key] = value;
    }

    function setBytes(bytes32 key, bytes memory value) internal {
        bytesStorage[key] = value;
    }

    function setBool(bytes32 key, bool value) internal {
        boolStorage[key] = value;
    }

    function setInt(bytes32 key, int256 value) internal {
        intStorage[key] = value;
    }

    // *** Delete Methods ***
    function deleteUint(bytes32 key) internal {
        delete uIntStorage[key];
    }

    function deleteString(bytes32 key) internal {
        delete stringStorage[key];
    }

    function deleteAddress(bytes32 key) internal {
        delete addressStorage[key];
    }

    function deleteBytes(bytes32 key) internal {
        delete bytesStorage[key];
    }

    function deleteBool(bytes32 key) internal {
        delete boolStorage[key];
    }

    function deleteInt(bytes32 key) internal {
        delete intStorage[key];
    }
}
