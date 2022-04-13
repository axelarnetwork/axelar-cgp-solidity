// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { AxelarGasReceiver } from './AxelarGasReceiver.sol';

contract AxelarGasReceiverProxy {
    error SetupFailed();

    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address gasReceiverImplementation, bytes memory params) {
        assembly {
            sstore(_IMPLEMENTATION_SLOT, gasReceiverImplementation)
        }
        (bool success, ) = gasReceiverImplementation.delegatecall(
            abi.encodeWithSelector(AxelarGasReceiver.setup.selector, params)
        );

        if (!success) revert SetupFailed();
    }

    function implementation() public view returns (address implementation_) {
        assembly {
            implementation_ := sload(_IMPLEMENTATION_SLOT)
        }
    }

    function setup(bytes calldata data) public {}

    fallback() external payable {
        address implementaion_ = implementation();
        assembly {
            calldatacopy(0, 0, calldatasize())

            let result := delegatecall(gas(), implementaion_, 0, calldatasize(), 0, 0)
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
