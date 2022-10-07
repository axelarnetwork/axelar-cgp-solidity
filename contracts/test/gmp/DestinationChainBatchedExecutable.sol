// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarExecutableBatched } from '../../interfaces/IAxelarExecutableBatched.sol';
import { IERC20 } from '../../interfaces/IERC20.sol';
import { DestinationChainTokenSwapper } from './DestinationChainTokenSwapper.sol';

contract DestinationChainBatchedExecutable is IAxelarExecutableBatched {
    uint256 public val;
    string public lastSenderChain;
    address public lastSenderAddress;

    constructor(address gatewayAddress) IAxelarExecutableBatched(gatewayAddress) {
        val = 1;
        lastSenderChain = 'ChainZ';
        lastSenderAddress = address(this);
    }

    function bytesToAddress(bytes memory bys) private pure returns (address addr) {
        assembly {
            addr := mload(add(bys, 20))
        }
    }

    function _execute(
        string memory sourceChain,
        bytes memory sourceAddress,
        bytes calldata payload
    ) internal override {
        uint256 receivedVal = abi.decode(payload, (uint256));

        val = receivedVal;
        lastSenderAddress = bytesToAddress(sourceAddress);
        lastSenderChain = sourceChain;
    }
}
