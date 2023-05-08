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
}
