// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { EternalStorage } from './EternalStorage.sol';

contract AxelarGatewayProxy is EternalStorage {
    bytes32 internal constant KEY_IMPLEMENTATION = keccak256('implementation');

    function setup(bytes memory) external pure {}

    fallback() external payable {
        address implementation = getAddress(KEY_IMPLEMENTATION);

        assembly {
            calldatacopy(0, 0, calldatasize())

            let result := delegatecall(
                gas(),
                implementation,
                0,
                calldatasize(),
                0,
                0
            )

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
