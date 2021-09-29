// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IOwnable } from "./interfaces/IOwnable.sol";

abstract contract Ownable is IOwnable {

    address public override owner;

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(owner == msg.sender, 'Ownable: caller is not the owner');
        _;
    }

    function transferOwnership(address newOwner) public override virtual onlyOwner {
        require(
            newOwner != address(0),
            'Ownable: new owner is the zero address'
        );

        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

}
