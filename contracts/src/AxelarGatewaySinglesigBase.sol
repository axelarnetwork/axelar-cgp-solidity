// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGatewaySinglesig } from './interfaces/IAxelarGatewaySinglesig.sol';

import { ECDSA } from './ECDSA.sol';
import { AxelarGateway } from './AxelarGateway.sol';

abstract contract AxelarGatewaySinglesigBase is AxelarGateway {
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

    function _owner() internal view returns (address) {
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

    function _operator() internal view returns (address) {
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

    /*************************\
    |* Gateway Functionality *|
    \*************************/

    function _execute(bytes memory data, bytes memory sig) internal {
        address signer = ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), sig);

        (uint256 chainId, bytes32[] memory commandIds, string[] memory commands, bytes[] memory params) =
            abi.decode(data, (uint256, bytes32[], string[], bytes[]));

        require(chainId == _getChainID(), 'INV_CHAIN');

        uint256 commandsLength = commandIds.length;

        require(commandsLength == commands.length && commandsLength == params.length, 'INV_CMDS');

        for (uint256 i; i < commandsLength; i++) {
            bytes32 commandId = commandIds[i];

            if (isCommandExecuted(commandId)) continue; /* Ignore if duplicate commandId received */

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(commands[i]));

            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                commandSelector = IAxelarGatewaySinglesig.deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                commandSelector = IAxelarGatewaySinglesig.mintToken.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                commandSelector = IAxelarGatewaySinglesig.burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OWNERSHIP) {
                commandSelector = IAxelarGatewaySinglesig.transferOwnership.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                commandSelector = IAxelarGatewaySinglesig.transferOperatorship.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            (bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, signer, params[i]));
            _setCommandExecuted(commandId, success);
        }
    }
}
