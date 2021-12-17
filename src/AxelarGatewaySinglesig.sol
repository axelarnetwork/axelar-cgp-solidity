// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGatewaySinglesig } from './interfaces/IAxelarGatewaySinglesig.sol';

import { ECDSA } from './ECDSA.sol';
import { AxelarGateway } from './AxelarGateway.sol';

contract AxelarGatewaySinglesig is IAxelarGatewaySinglesig, AxelarGateway {
    bytes32 internal constant KEY_OWNER_EPOCH = keccak256('owner-epoch');

    bytes32 internal constant PREFIX_OWNER = keccak256('owner');

    bytes32 internal constant KEY_OPERATOR_EPOCH = keccak256('operator-epoch');

    bytes32 internal constant PREFIX_OPERATOR = keccak256('operator');

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getOwnerKey(uint256 ownerEpoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OWNER, ownerEpoch));
    }

    function _getOperatorKey(uint256 operatorEpoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OPERATOR, operatorEpoch));
    }

    /***********\
    |* Getters *|
    \***********/

    function _ownerEpoch() internal view returns (uint256) {
        return getUint(KEY_OWNER_EPOCH);
    }

    function _getOwner(uint256 ownerEpoch) internal view returns (address) {
        return getAddress(_getOwnerKey(ownerEpoch));
    }

    /// @dev Returns true if a `account` is owner within the last `OLD_KEY_RETENTION + 1` owner epochs.
    function _isValidRecentOwner(address account) internal view returns (bool) {
        uint256 ownerEpoch = _ownerEpoch();
        uint256 recentEpochs = OLD_KEY_RETENTION + uint256(1);
        uint256 lowerBoundOwnerEpoch = ownerEpoch > recentEpochs ? ownerEpoch - recentEpochs : uint256(0);

        while (ownerEpoch > lowerBoundOwnerEpoch) {
            if (account == _getOwner(ownerEpoch--)) return true;
        }

        return false;
    }

    function owner() public view override returns (address) {
        return _getOwner(_ownerEpoch());
    }

    function _operatorEpoch() internal view returns (uint256) {
        return getUint(KEY_OPERATOR_EPOCH);
    }

    function _getOperator(uint256 operatorEpoch) internal view returns (address) {
        return getAddress(_getOperatorKey(operatorEpoch));
    }

    /// @dev Returns true if a `account` is operator within the last `OLD_KEY_RETENTION + 1` operator epochs.
    function _isValidRecentOperator(address account) internal view returns (bool) {
        uint256 operatorEpoch = _operatorEpoch();
        uint256 recentEpochs = OLD_KEY_RETENTION + uint256(1);
        uint256 lowerBoundOperatorEpoch = operatorEpoch > recentEpochs ? operatorEpoch - recentEpochs : uint256(0);

        while (operatorEpoch > lowerBoundOperatorEpoch) {
            if (account == _getOperator(operatorEpoch--)) return true;
        }

        return false;
    }

    function operator() public view override returns (address) {
        return _getOperator(_operatorEpoch());
    }

    /***********\
    |* Setters *|
    \***********/

    function _setOwnerEpoch(uint256 ownerEpoch) internal {
        _setUint(KEY_OWNER_EPOCH, ownerEpoch);
    }

    function _setOwner(uint256 ownerEpoch, address account) internal {
        _setAddress(_getOwnerKey(ownerEpoch), account);
    }

    function _setOperatorEpoch(uint256 operatorEpoch) internal {
        _setUint(KEY_OPERATOR_EPOCH, operatorEpoch);
    }

    function _setOperator(uint256 operatorEpoch, address account) internal {
        _setAddress(_getOperatorKey(operatorEpoch), account);
    }

    /**********************\
    |* Self Functionality *|
    \**********************/

    function deployToken(bytes calldata params) external onlySelf {
        (string memory name, string memory symbol, uint8 decimals, uint256 cap) = abi.decode(
            params,
            (string, string, uint8, uint256)
        );

        _deployToken(name, symbol, decimals, cap);
    }

    function mintToken(bytes calldata params) external onlySelf {
        (string memory symbol, address account, uint256 amount) = abi.decode(params, (string, address, uint256));

        _mintToken(symbol, account, amount);
    }

    function burnToken(bytes calldata params) external onlySelf {
        (string memory symbol, bytes32 salt) = abi.decode(params, (string, bytes32));

        _burnToken(symbol, salt);
    }

    function transferOwnership(bytes calldata params) external onlySelf {
        address newOwner = abi.decode(params, (address));
        uint256 ownerEpoch = _ownerEpoch();

        require(newOwner != address(0), 'ZERO_ADDR');

        emit OwnershipTransferred(_getOwner(ownerEpoch), newOwner);

        _setOwnerEpoch(++ownerEpoch);
        _setOwner(ownerEpoch, newOwner);
    }

    function transferOperatorship(bytes calldata params) external onlySelf {
        address newOperator = abi.decode(params, (address));

        require(newOperator != address(0), 'ZERO_ADDR');

        emit OperatorshipTransferred(operator(), newOperator);

        uint256 operatorEpoch = _operatorEpoch();
        _setOperatorEpoch(++operatorEpoch);
        _setOperator(operatorEpoch, newOperator);
    }

    /**************************\
    |* External Functionality *|
    \**************************/

    function setup(bytes calldata params) external override {
        // Prevent setup from being called on a non-proxy (the implementation).
        require(implementation() != address(0), 'NOT_PROXY');

        (address[] memory adminAddresses, uint256 adminThreshold, address ownerAddress, address operatorAddress) = abi
            .decode(params, (address[], uint256, address, address));

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

    function execute(bytes calldata input) external override {
        (bytes memory data, bytes memory signature) = abi.decode(input, (bytes, bytes));

        _execute(data, signature);
    }

    function _execute(bytes memory data, bytes memory sig) internal {
        address signer = ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), sig);

        (uint256 chainId, bytes32[] memory commandIds, string[] memory commands, bytes[] memory params) = abi.decode(
            data,
            (uint256, bytes32[], string[], bytes[])
        );

        require(chainId == _getChainID(), 'INV_CHAIN');

        uint256 commandsLength = commandIds.length;

        require(commandsLength == commands.length && commandsLength == params.length, 'INV_CMDS');

        bool isCurrentOwner = signer == owner();
        bool isValidRecentOwner = isCurrentOwner || _isValidRecentOwner(signer);
        bool isValidRecentOperator = _isValidRecentOperator(signer);

        for (uint256 i; i < commandsLength; i++) {
            bytes32 commandId = commandIds[i];

            if (isCommandExecuted(commandId)) continue; /* Ignore if duplicate commandId received */

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(commands[i]));

            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                if (!isValidRecentOwner) continue;

                commandSelector = AxelarGatewaySinglesig.deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                if (!isValidRecentOperator && !isValidRecentOwner) continue;

                commandSelector = AxelarGatewaySinglesig.mintToken.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                if (!isValidRecentOperator && !isValidRecentOwner) continue;

                commandSelector = AxelarGatewaySinglesig.burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OWNERSHIP) {
                if (!isCurrentOwner) continue;

                commandSelector = AxelarGatewaySinglesig.transferOwnership.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                if (!isCurrentOwner) continue;

                commandSelector = AxelarGatewaySinglesig.transferOperatorship.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            // Prevent a re-entrancy from executing this command before it can be marked as successful.
            _setCommandExecuted(commandId, true);
            (bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, params[i]));
            _setCommandExecuted(commandId, success);
        }
    }
}
