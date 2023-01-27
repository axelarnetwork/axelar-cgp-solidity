// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IExpressProxyDeployer } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IExpressProxyDeployer.sol';
import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { AddressToString, StringToAddress } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/AddressString.sol';
import { IAxelarGasService } from '../interfaces/IAxelarGasService.sol';
import { IExpressProxyFactory } from '../interfaces/IExpressProxyFactory.sol';

contract ExpressProxyFactory is AxelarExecutable, IExpressProxyFactory {
    using AddressToString for address;
    using StringToAddress for string;

    enum Command {
        DeployExpressExecutable
    }

    IAxelarGasService public immutable gasService;
    IExpressProxyDeployer public immutable proxyDeployer;

    constructor(
        address gateway_,
        address gasService_,
        address proxyDeployer_
    ) AxelarExecutable(gateway_) {
        if (gasService_ == address(0)) revert InvalidAddress();
        if (proxyDeployer_ == address(0)) revert InvalidAddress();

        gasService = IAxelarGasService(gasService_);
        proxyDeployer = IExpressProxyDeployer(proxyDeployer_);
    }

    function isExpressProxy(address proxyAddress) public view returns (bool) {
        return proxyDeployer.isExpressProxy(proxyAddress);
    }

    function deployedProxyAddress(bytes32 salt, address sender) external view returns (address) {
        return proxyDeployer.deployedProxyAddress(salt, sender, address(this));
    }

    function deployExpressProxy(
        bytes32 salt,
        address implementationAddress,
        address owner,
        bytes calldata setupParams
    ) external returns (address) {
        bytes32 deploySalt = keccak256(abi.encode(msg.sender, salt));
        return _deployExpressProxy(deploySalt, implementationAddress, owner, setupParams);
    }

    function deployExpressExecutable(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams
    ) external returns (address) {
        bytes32 deploySalt = keccak256(abi.encode(msg.sender, salt));
        return _deployExpressExecutable(deploySalt, implementationBytecode, owner, setupParams);
    }

    function deployExpressExecutableOnChains(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams,
        string[] calldata destinationChains,
        uint256[] calldata gasPayments,
        address gasRefundAddress
    ) external {
        bytes32 deploySalt = keccak256(abi.encode(msg.sender, salt));
        uint256 length = destinationChains.length;

        if (implementationBytecode.length == 0) revert EmptyBytecode();
        if (length != gasPayments.length) revert WrongGasAmounts();

        for (uint256 i; i < length; ++i) {
            _deployExpressExecutableOnChain(
                deploySalt,
                implementationBytecode,
                owner,
                setupParams,
                destinationChains[i],
                gasPayments[i],
                gasRefundAddress
            );
        }
    }

    function _execute(
        string calldata,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        if (sourceAddress.toAddress() != address(this)) revert InvalidSourceAddress();

        (Command command, bytes32 deploySalt, bytes memory implementationBytecode, address owner, bytes memory setupParams) = abi.decode(
            payload,
            (Command, bytes32, bytes, address, bytes)
        );

        if (command == Command.DeployExpressExecutable) {
            _deployExpressExecutable(deploySalt, implementationBytecode, owner, setupParams);
        } else {
            revert InvalidCommand();
        }
    }

    function _deployExpressProxy(
        bytes32 deploySalt,
        address implementationAddress,
        address owner,
        bytes memory setupParams
    ) internal returns (address deployedAddress) {
        (, bytes memory data) = address(proxyDeployer).delegatecall(
            abi.encodeWithSelector(IExpressProxyDeployer.deployExpressProxy.selector, deploySalt, implementationAddress, owner, setupParams)
        );
        (deployedAddress) = abi.decode(data, (address));
    }

    function _deployExpressExecutable(
        bytes32 deploySalt,
        bytes memory implementationBytecode,
        address owner,
        bytes memory setupParams
    ) internal returns (address) {
        if (implementationBytecode.length == 0) revert EmptyBytecode();

        address implementation;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            implementation := create2(0, add(implementationBytecode, 32), mload(implementationBytecode), deploySalt)
        }

        if (implementation == address(0)) revert FailedDeploy();

        return _deployExpressProxy(deploySalt, implementation, owner, setupParams);
    }

    function _deployExpressExecutableOnChain(
        bytes32 deploySalt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams,
        string calldata destinationChain,
        uint256 gasPayment,
        address gasRefundAddress
    ) internal {
        string memory thisAddress = address(this).toString();
        bytes memory payload = abi.encode(Command.DeployExpressExecutable, deploySalt, implementationBytecode, owner, setupParams);

        if (gasPayment > 0) {
            gasService.payNativeGasForContractCall{ value: gasPayment }(
                address(this),
                destinationChain,
                thisAddress,
                payload,
                gasRefundAddress
            );
        }

        gateway.callContract(destinationChain, address(this).toString(), payload);
    }
}
