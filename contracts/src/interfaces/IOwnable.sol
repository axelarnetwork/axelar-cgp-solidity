// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

interface IOwnable {

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    function owner() external returns (address);

    function transferOwnership(address newOwner) external;

}
