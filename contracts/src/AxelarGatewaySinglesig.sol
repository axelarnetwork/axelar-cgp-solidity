// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGatewaySinglesig } from './interfaces/IAxelarGatewaySinglesig.sol';

import { ECDSA } from './ECDSA.sol';
import { AxelarGatewaySinglesigBase } from './AxelarGatewaySinglesigBase.sol';

contract AxelarGatewaySinglesig is IAxelarGatewaySinglesig, AxelarGatewaySinglesigBase {
    /// @dev Returns the owner within the current `ownerEpoch`.
    function owner() public view override returns (address) {
        return _owner();
    }

    /// @dev Returns the operator within the current `operatorEpoch`.
    function operator() public view override returns (address) {
        return _operator();
    }

    /**********************\
    |* Self Functionality *|
    \**********************/

    function deployToken(address signer, bytes memory params) external override onlySelf {
        (string memory name, string memory symbol, uint8 decimals, uint256 cap) =
            abi.decode(params, (string, string, uint8, uint256));

        require(_isValidRecentOwner(signer), 'INV_SIGNER');

        _deployToken(name, symbol, decimals, cap);
    }

    function mintToken(address signer, bytes memory params) external override onlySelf {
        (string memory symbol, address account, uint256 amount) = abi.decode(params, (string, address, uint256));

        require(_isValidRecentOwner(signer) || _isValidRecentOperator(signer), 'INV_SIGNER');

        _mintToken(symbol, account, amount);
    }

    function burnToken(address signer, bytes memory params) external override onlySelf {
        (string memory symbol, bytes32 salt) = abi.decode(params, (string, bytes32));

        require(_isValidRecentOwner(signer) || _isValidRecentOperator(signer), 'INV_SIGNER');

        _burnToken(symbol, salt);
    }

    function transferOwnership(address signer, bytes memory params) external override onlySelf {
        address newOwner = abi.decode(params, (address));
        uint256 ownerEpoch = _ownerEpoch();
        address currentOwner = _getOwner(ownerEpoch);

        require(newOwner != address(0), 'ZERO_ADDR');
        require(signer == currentOwner, 'INV_SIGNER');

        emit OwnershipTransferred(currentOwner, newOwner);

        _setOwnerEpoch(++ownerEpoch);
        _setOwner(ownerEpoch, newOwner);
    }

    function transferOperatorship(address signer, bytes memory params) external override onlySelf {
        address newOperator = abi.decode(params, (address));

        require(newOperator != address(0), 'ZERO_ADDR');
        require(signer == _owner(), 'INV_SIGNER');

        emit OperatorshipTransferred(_operator(), newOperator);

        uint256 operatorEpoch = _operatorEpoch();
        _setOperatorEpoch(++operatorEpoch);
        _setOperator(operatorEpoch, newOperator);
    }

    /**************************\
    |* External Functionality *|
    \**************************/

    function setup(bytes memory params) external override {
        (address[] memory adminAddresses, uint256 adminThreshold, address ownerAddress, address operatorAddress) =
            abi.decode(params, (address[], uint256, address, address));

        uint256 adminEpoch = _adminEpoch() + uint256(1);
        _setAdminEpoch(adminEpoch);
        _setAdmins(adminEpoch, adminAddresses, adminThreshold);

        uint256 ownerEpoch = _ownerEpoch() + uint256(1);
        _setOwnerEpoch(ownerEpoch);
        _setOwner(ownerEpoch, ownerAddress);

        uint256 operatorEpoch = _operatorEpoch() + uint256(1);
        _setOperatorEpoch(operatorEpoch);
        _setOperator(operatorEpoch, operatorAddress);

        emit OwnershipTransferred(address(0), ownerAddress);
        emit OperatorshipTransferred(address(0), operatorAddress);
    }

    function execute(bytes memory input) external override {
        (bytes memory data, bytes memory signature) = abi.decode(input, (bytes, bytes));

        _execute(data, signature);
    }
}
