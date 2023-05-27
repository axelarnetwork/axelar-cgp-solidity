// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { Upgradable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradable/Upgradable.sol';
import { IAxelarGateway } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol';
import { IAxelarGovernance } from '../interfaces/IAxelarGovernance.sol';
import { AdminMultisigBase } from './AdminMultisigBase.sol';

contract AxelarGovernance is Upgradable, AdminMultisigBase, IAxelarGovernance {
    enum Command {
        Upgrade,
        SetMintLimits
    }

    IAxelarGateway public immutable gateway;
    bytes32 public immutable governanceChainHash;
    bytes32 public immutable governanceAddressHash;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address gatewayAddress,
        string memory governanceChain_,
        string memory governanceAddress_
    ) {
        gateway = IAxelarGateway(gatewayAddress);
        governanceChainHash = keccak256(bytes(governanceChain_));
        governanceAddressHash = keccak256(bytes(governanceAddress_));
    }

    function execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) external onlyAdmins {
        bytes32 payloadHash = keccak256(payload);

        if (keccak256(bytes(sourceChain)) != governanceChainHash || keccak256(bytes(sourceAddress)) != governanceAddressHash)
            revert NotGovernance();
        if (!gateway.validateContractCall(commandId, sourceChain, sourceAddress, payloadHash)) revert NotApprovedByGateway();

        (Command command, address targetContract, bytes memory callData) = abi.decode(payload, (Command, address, bytes));

        bytes4 methodSelector = bytes4(callData);

        if (command == Command.Upgrade) {
            if (methodSelector != Upgradable.upgrade.selector) revert InvalidCommand();
        } else if (command == Command.SetMintLimits) {
            if (methodSelector != IAxelarGateway.setTokenMintLimits.selector) revert InvalidCommand();
        } else {
            revert InvalidCommand();
        }

        (bool success, ) = targetContract.call(callData);

        if (!success) {
            revert ExecutionFailed();
        }
    }

    function setGatewayMintLimits(string[] calldata symbols, uint256[] calldata limits) external onlyAdmins {
        gateway.setTokenMintLimits(symbols, limits);
    }

    function rotateAdmins(address[] memory adminAddresses, uint256 newAdminThreshold) external onlyAdmins {
        // NOTE: Admin epoch is incremented to easily invalidate current admin-related state.
        uint256 newAdminEpoch = _adminEpoch() + uint256(1);
        _setAdminEpoch(newAdminEpoch);
        _setAdmins(newAdminEpoch, adminAddresses, newAdminThreshold);
    }

    function executeWithToken(
        bytes32, /* commandId */
        string calldata, /* sourceChain */
        string calldata, /* sourceAddress */
        bytes calldata, /* payload */
        string calldata, /* tokenSymbol */
        uint256 /* amount */
    ) external pure {
        revert TokenNotSupported();
    }

    function contractId() external pure returns (bytes32) {
        return keccak256('axelar-governance');
    }
}
