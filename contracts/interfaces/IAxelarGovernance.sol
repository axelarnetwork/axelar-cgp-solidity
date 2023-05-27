// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IUpgradable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IUpgradable.sol';
import { IAxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol';
import { IAdminMultisig } from './IAdminMultisig.sol';

// This should be owned by the microservice that is paying for gas.
interface IAxelarGovernance is IAxelarExecutable, IAdminMultisig {
    error NotGovernance();
    error InvalidCommand();
    error ExecutionFailed();
    error TokenNotSupported();

    function setGatewayMintLimits(string[] calldata symbols, uint256[] calldata limits) external;

    function rotateAdmins(address[] memory adminAddresses, uint256 newAdminThreshold) external;
}
