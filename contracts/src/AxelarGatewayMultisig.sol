// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGatewayMultisig } from './interfaces/IAxelarGatewayMultisig.sol';

import { ECDSA } from './ECDSA.sol';
import { AxelarGatewayMultisigBase } from './AxelarGatewayMultisigBase.sol';

contract AxelarGatewayMultisig is IAxelarGatewayMultisig, AxelarGatewayMultisigBase {
    /// @dev Returns the array of owners within the current `ownerEpoch`.
    function owners() external view override returns (address[] memory results) {
        return _owners();
    }

    /// @dev Returns the array of operators within the current `operatorEpoch`.
    function operators() external view override returns (address[] memory results) {
        return _operators();
    }

    /**********************\
    |* Self Functionality *|
    \**********************/

    function deployToken(address[] memory signers, bytes memory params) external override onlySelf {
        (string memory name, string memory symbol, uint8 decimals, uint256 cap) =
            abi.decode(params, (string, string, uint8, uint256));

        require(_areValidRecentOwners(signers), 'INV_SIGNERS');

        _deployToken(name, symbol, decimals, cap);
    }

    function mintToken(address[] memory signers, bytes memory params) external override onlySelf {
        (string memory symbol, address account, uint256 amount) = abi.decode(params, (string, address, uint256));

        require(_areValidRecentOwners(signers) || _areValidRecentOperators(signers), 'INV_SIGNERS');

        _mintToken(symbol, account, amount);
    }

    function burnToken(address[] memory signers, bytes memory params) external override onlySelf {
        (string memory symbol, bytes32 salt) = abi.decode(params, (string, bytes32));

        require(_areValidRecentOwners(signers) || _areValidRecentOperators(signers), 'INV_SIGNERS');

        _burnToken(symbol, salt);
    }

    function transferOwnership(address[] memory signers, bytes memory params) external override onlySelf {
        (address[] memory newOwners, uint256 newThreshold) = abi.decode(params, (address[], uint256));

        uint256 ownerEpoch = _ownerEpoch();
        require(_areValidOwnersInEpoch(ownerEpoch, signers), 'INV_SIGNERS');

        emit OwnershipTransferred(_owners(), _getOwnerThreshold(ownerEpoch), newOwners, newThreshold);

        _setOwnerEpoch(++ownerEpoch);
        _setOwners(ownerEpoch, newOwners, newThreshold);
    }

    function transferOperatorship(address[] memory signers, bytes memory params) external override onlySelf {
        (address[] memory newOperators, uint256 newThreshold) = abi.decode(params, (address[], uint256));

        uint256 ownerEpoch = _ownerEpoch();
        require(_areValidOwnersInEpoch(ownerEpoch, signers), 'INV_SIGNERS');

        emit OperatorshipTransferred(_operators(), _getOperatorThreshold(ownerEpoch), newOperators, newThreshold);

        uint256 operatorEpoch = _operatorEpoch();
        _setOperatorEpoch(++operatorEpoch);
        _setOperators(operatorEpoch, newOperators, newThreshold);
    }

    /**************************\
    |* External Functionality *|
    \**************************/

    function setup(bytes memory params) external override {
        (
            address[] memory adminAddresses,
            uint256 adminThreshold,
            address[] memory ownerAddresses,
            uint256 ownerThreshold,
            address[] memory operatorAddresses,
            uint256 operatorThreshold
        ) = abi.decode(params, (address[], uint256, address[], uint256, address[], uint256));

        uint256 adminEpoch = _adminEpoch() + uint256(1);
        _setAdminEpoch(adminEpoch);
        _setAdmins(adminEpoch, adminAddresses, adminThreshold);

        uint256 ownerEpoch = _ownerEpoch() + uint256(1);
        _setOwnerEpoch(ownerEpoch);
        _setOwners(ownerEpoch, ownerAddresses, ownerThreshold);

        uint256 operatorEpoch = _operatorEpoch() + uint256(1);
        _setOperatorEpoch(operatorEpoch);
        _setOperators(operatorEpoch, operatorAddresses, operatorThreshold);

        emit OwnershipTransferred(new address[](uint256(0)), uint256(0), ownerAddresses, ownerThreshold);
        emit OperatorshipTransferred(new address[](uint256(0)), uint256(0), operatorAddresses, operatorThreshold);
    }

    function execute(bytes memory input) external override {
        (bytes memory data, bytes[] memory signatures) = abi.decode(input, (bytes, bytes[]));

        _execute(data, signatures);
    }
}
