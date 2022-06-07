// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { AddressFormat } from './AddressFormat.sol';
import { StringToAddress } from './StringToAddress.sol';

contract UtilTest {
    using AddressFormat for address;
    using StringToAddress for string;

    function addressToString(address address_) external pure returns (string memory) {
        return address_.toLowerString();
    }

    function stringToAddress(string calldata string_) external pure returns (address) {
        return string_.toAddress();
    }
}
