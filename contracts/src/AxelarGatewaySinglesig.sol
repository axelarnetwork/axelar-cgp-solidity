// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { ECDSA } from './ECDSA.sol';
import { IAxelarGatewaySinglesig } from './IAxelarGatewaySinglesig.sol';
import { AxelarGateway } from './AxelarGateway.sol';

contract AxelarGatewaySinglesig is IAxelarGatewaySinglesig, AxelarGateway {
    bytes32 internal constant PREFIX_OWNER = keccak256('owner');
    bytes32 internal constant PREFIX_OPERATOR = keccak256('operator');
    bytes32 internal constant PREFIX_OWNER_INDEX = keccak256('owner-index');
    bytes32 internal constant PREFIX_OPERATOR_INDEX = keccak256('operator-index');
    bytes32 internal constant KEY_OWNER_COUNT = keccak256('owner-count');
    bytes32 internal constant KEY_OPERATOR_COUNT = keccak256('operator-count');

    function owner() public view override returns (address) {
        return getAddress(keccak256(abi.encodePacked(PREFIX_OWNER, _getOwnerCount())));
    }

    function operator() public view override returns (address) {
        return getAddress(keccak256(abi.encodePacked(PREFIX_OPERATOR, _getOperatorCount())));
    }

    function setup(bytes memory params) external override {
        (address[] memory adminAddrs, uint8 adminThreshold, address ownerAddr, address operatorAddr) =
            abi.decode(params, (address[], uint8, address, address));

        _setAdmins(adminAddrs, adminThreshold);
        _setOwner(ownerAddr);
        _setOperator(operatorAddr);

        emit OwnershipTransferred(address(0), ownerAddr);
        emit OperatorshipTransferred(address(0), operatorAddr);
    }

    function execute(bytes memory input) external override {
        (bytes memory data, bytes memory sig) = abi.decode(input, (bytes, bytes));

        _execute(data, sig);
    }

    function _execute(bytes memory data, bytes memory sig) internal {
        address signer = ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), sig);

        (uint256 chainId, bytes32[] memory commandIds, string[] memory commands, bytes[] memory params) =
            abi.decode(data, (uint256, bytes32[], string[], bytes[]));

        require(chainId == _getChainID(), 'INV_CHAIN');

        uint256 commandsLength = commandIds.length;

        require(commandsLength == commands.length && commandsLength == params.length, 'INV_CMDS');

        for (uint256 i = 0; i < commandsLength; i++) {
            bytes32 commandId = commandIds[i];
            string memory command = commands[i];

            if (_isCommandExecuted(commandId)) continue; /* Ignore if duplicate commandId received */

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(command));

            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                commandSelector = AxelarGatewaySinglesig.deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                commandSelector = AxelarGatewaySinglesig.mintToken.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                commandSelector = AxelarGatewaySinglesig.burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OWNERSHIP) {
                commandSelector = AxelarGatewaySinglesig.transferOwnership.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                commandSelector = AxelarGatewaySinglesig.transferOperatorship.selector;
            } else if (commandHash == SELECTOR_UPDATE) {
                commandSelector = AxelarGatewaySinglesig.update.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            (bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, signer, params[i]));
            _setCommandExecuted(commandId, success);
        }
    }

    function deployToken(address signer, bytes memory params) external onlySelf {
        (string memory name, string memory symbol, uint8 decimals, uint256 cap) =
            abi.decode(params, (string, string, uint8, uint256));

        require(_isValidOwner(signer), 'INV_SIGNER');

        _deployToken(name, symbol, decimals, cap);
    }

    function mintToken(address signer, bytes memory params) external onlySelf {
        (string memory symbol, address account, uint256 amount) = abi.decode(params, (string, address, uint256));

        require(_isValidOwner(signer) || _isValidOperator(signer), 'INV_SIGNER');

        _mintToken(symbol, account, amount);
    }

    function burnToken(address signer, bytes memory params) external onlySelf {
        (string memory symbol, bytes32 salt) = abi.decode(params, (string, bytes32));

        require(_isValidOwner(signer) || _isValidOperator(signer), 'INV_SIGNER');

        _burnToken(symbol, salt);
    }

    function transferOwnership(address signer, bytes memory params) external onlySelf {
        address newOwner = abi.decode(params, (address));
        address currOwner = owner();

        require(newOwner != address(0), 'ZERO_ADDR');
        require(signer == currOwner, 'INV_SIGNER');

        emit OwnershipTransferred(currOwner, newOwner);

        _setOwner(newOwner);
    }

    function transferOperatorship(address signer, bytes memory params) external onlySelf {
        address newOperator = abi.decode(params, (address));
        address currOperator = operator();

        require(newOperator != address(0), 'ZERO_ADDR');
        require(signer == owner(), 'INV_SIGNER');

        emit OperatorshipTransferred(currOperator, newOperator);

        _setOperator(newOperator);
    }

    function update(address signer, bytes memory params) external onlySelf {
        (address newVersion, bytes memory setupParams) = abi.decode(params, (address, bytes));

        require(signer == owner(), 'INV_SIGNER');

        _update(newVersion, setupParams);
    }

    function _isValidOwner(address addr) internal view returns (bool) {
        uint256 ownerIndex = getUint(keccak256(abi.encodePacked(PREFIX_OWNER_INDEX, addr)));

        return ownerIndex > 0 && (_getOwnerCount() - ownerIndex) <= OLD_KEY_RETENTION;
    }

    function _isValidOperator(address addr) internal view returns (bool) {
        uint256 operatorIndex = getUint(keccak256(abi.encodePacked(PREFIX_OPERATOR_INDEX, addr)));

        return operatorIndex > 0 && (_getOperatorCount() - operatorIndex) <= OLD_KEY_RETENTION;
    }

    function _setOwner(address ownerAddr) internal {
        uint256 ownerCount = _getOwnerCount();
        setAddress(keccak256(abi.encodePacked(PREFIX_OWNER, ++ownerCount)), ownerAddr);
        setUint(keccak256(abi.encodePacked(PREFIX_OWNER_INDEX, ownerAddr)), ownerCount);
        setUint(KEY_OWNER_COUNT, ownerCount);
    }

    function _setOperator(address operatorAddr) internal {
        uint256 operatorCount = _getOperatorCount();
        setAddress(keccak256(abi.encodePacked(PREFIX_OPERATOR, ++operatorCount)), operatorAddr);
        setUint(keccak256(abi.encodePacked(PREFIX_OPERATOR_INDEX, operatorAddr)), operatorCount);
        setUint(KEY_OPERATOR_COUNT, operatorCount);
    }

    function _getOwnerCount() internal view returns (uint256) {
        return getUint(KEY_OWNER_COUNT);
    }

    function _getOperatorCount() internal view returns (uint256) {
        return getUint(KEY_OPERATOR_COUNT);
    }
}
