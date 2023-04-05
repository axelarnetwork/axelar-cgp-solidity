// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol';

// This should be owned by the microservice that is paying for gas.
interface IExpressProxyFactory is IAxelarExecutable {
    error NotExpressProxy();
    error InvalidSourceAddress();
    error InvalidCommand();
    error FailedDeploy();
    error EmptyBytecode();
    error WrongGasAmounts();

    function isExpressProxy(address proxyAddress) external view returns (bool);

    function deployedProxyAddress(bytes32 salt, address sender) external view returns (address deployedAddress);

    function deployExpressProxy(
        bytes32 salt,
        address implementationAddress,
        address owner,
        bytes calldata setupParams
    ) external returns (address);

    function deployExpressExecutable(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams
    ) external returns (address);

    function deployExpressExecutableOnChains(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams,
        string[] calldata destinationChains,
        uint256[] calldata gasPayments,
        address gasRefundAddress
    ) external;
}
