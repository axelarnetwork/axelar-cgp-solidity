// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { StringToAddress, AddressToString } from './StringAddressUtils.sol';

contract UtilTest {
    using AddressToString for address;
    using StringToAddress for string;

    function addressToString(address address_) external pure returns (string memory) {
        return address_.toString();
    }

    function stringToAddress(string calldata string_) external pure returns (address) {
        return string_.toAddress();
    }
}
