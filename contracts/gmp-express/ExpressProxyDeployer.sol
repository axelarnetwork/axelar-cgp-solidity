// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IExpressExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IExpressExecutable.sol';
import { ExpressProxy } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/express/ExpressProxy.sol';

contract ExpressProxyDeployer {
    error InvalidAddress();

    bytes32 public immutable expressProxyCodeHash;
    bytes32 public immutable expressRegistryCodeHash;

    constructor(address gateway_) {
        if (gateway_ == address(0)) revert InvalidAddress();

        ExpressProxy proxy = new ExpressProxy(gateway_, address(0));
        proxy.deployRegistry();

        expressProxyCodeHash = address(proxy).codehash;
        expressRegistryCodeHash = address(proxy.registry()).codehash;
    }

    function isExpressProxy(address proxyAddress) external view returns (bool) {
        address expressRegistry = address(IExpressExecutable(proxyAddress).registry());

        return proxyAddress.codehash == expressProxyCodeHash && expressRegistry.codehash == expressRegistryCodeHash;
    }

    function deployedProxyAddress(
        bytes32 salt,
        address sender,
        address deployer
    ) external pure returns (address deployedAddress) {
        bytes32 deploySalt = keccak256(abi.encode(sender, salt));
        deployedAddress = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff',
                            deployer,
                            deploySalt,
                            keccak256(abi.encodePacked(type(ExpressProxy).creationCode, abi.encode(address(0), deployer)))
                        )
                    )
                )
            )
        );
    }

    function deployExpressProxy(
        bytes32 deploySalt,
        address implementationAddress,
        address owner,
        bytes memory setupParams
    ) public returns (address) {
        // Passing address(0) for automatic gateway lookup. Allows to have the same proxy address across chains
        ExpressProxy proxy = new ExpressProxy{ salt: deploySalt }(address(0), address(this));

        proxy.deployRegistry();
        proxy.init(implementationAddress, owner, setupParams);

        return address(proxy);
    }
}
