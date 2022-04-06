// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { AxelarGasReceiver } from './AxelarGasReceiver.sol';
import { Ownable } from '../Ownable.sol';


contract AxelarGasReceiverProxy is Ownable {
    error InvalidCodeHash();
    event Upgraded(address newImplementation);

    address public implementation;

    constructor(address gasReceiverImplementation) {
        implementation = gasReceiverImplementation;

    }

    function upgrade(
        address newImplementation,
        bytes32 newImplementationCodeHash
    ) external onlyOwner {
        if (newImplementationCodeHash != newImplementation.codehash) revert InvalidCodeHash();

        emit Upgraded(newImplementation);

        implementation = newImplementation;
    }

    fallback() external payable {
        address implementation_ = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())

            let result := delegatecall(gas(), implementation_, 0, calldatasize(), 0, 0)

            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {
        revert('NO_ETHER');
    }
}
