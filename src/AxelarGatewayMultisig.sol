// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGatewayMultisig } from './interfaces/IAxelarGatewayMultisig.sol';

import { ECDSA } from './ECDSA.sol';
import { AxelarGateway } from './AxelarGateway.sol';

contract AxelarGatewayMultisig is IAxelarGatewayMultisig, AxelarGateway {
    // AUDIT: slot names should be prefixed with some standard string
    // AUDIT: constants should be literal and their derivation should be in comments
    bytes32 internal constant KEY_OWNER_EPOCH = keccak256('owner-epoch');

    bytes32 internal constant PREFIX_OWNER = keccak256('owner');
    bytes32 internal constant PREFIX_OWNER_COUNT = keccak256('owner-count');
    bytes32 internal constant PREFIX_OWNER_THRESHOLD = keccak256('owner-threshold');
    bytes32 internal constant PREFIX_IS_OWNER = keccak256('is-owner');

    bytes32 internal constant KEY_OPERATOR_EPOCH = keccak256('operator-epoch');

    bytes32 internal constant PREFIX_OPERATOR = keccak256('operator');
    bytes32 internal constant PREFIX_OPERATOR_COUNT = keccak256('operator-count');
    bytes32 internal constant PREFIX_OPERATOR_THRESHOLD = keccak256('operator-threshold');
    bytes32 internal constant PREFIX_IS_OPERATOR = keccak256('is-operator');

    constructor(address tokenDeployer) AxelarGateway(tokenDeployer) {}

    function _isSortedAscAndContainsNoDuplicate(address[] memory accounts) internal pure returns (bool) {
        for (uint256 i; i < accounts.length - 1; ++i) {
            if (accounts[i] >= accounts[i + 1]) {
                return false;
            }
        }

        return true;
    }

    /************************\
    |* Owners Functionality *|
    \************************/

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getOwnerKey(uint256 ownerEpoch, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OWNER, ownerEpoch, index));
    }

    function _getOwnerCountKey(uint256 ownerEpoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OWNER_COUNT, ownerEpoch));
    }

    function _getOwnerThresholdKey(uint256 ownerEpoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OWNER_THRESHOLD, ownerEpoch));
    }

    function _getIsOwnerKey(uint256 ownerEpoch, address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_IS_OWNER, ownerEpoch, account));
    }

    /***********\
    |* Getters *|
    \***********/

    function _ownerEpoch() internal view returns (uint256) {
        return getUint(KEY_OWNER_EPOCH);
    }

    function _getOwner(uint256 ownerEpoch, uint256 index) internal view returns (address) {
        return getAddress(_getOwnerKey(ownerEpoch, index));
    }

    function _getOwnerCount(uint256 ownerEpoch) internal view returns (uint256) {
        return getUint(_getOwnerCountKey(ownerEpoch));
    }

    function _getOwnerThreshold(uint256 ownerEpoch) internal view returns (uint256) {
        return getUint(_getOwnerThresholdKey(ownerEpoch));
    }

    function _isOwner(uint256 ownerEpoch, address account) internal view returns (bool) {
        return getBool(_getIsOwnerKey(ownerEpoch, account));
    }

    /// @dev Returns true if a sufficient quantity of `accounts` are owners within the last `OLD_KEY_RETENTION + 1` owner epochs (excluding the current one).
    function _areValidPreviousOwners(address[] memory accounts) internal view returns (bool) {
        uint256 ownerEpoch = _ownerEpoch();
        uint256 recentEpochs = OLD_KEY_RETENTION + uint256(1);
        uint256 lowerBoundOwnerEpoch = ownerEpoch > recentEpochs ? ownerEpoch - recentEpochs : uint256(0);

        --ownerEpoch;
        while (ownerEpoch > lowerBoundOwnerEpoch) {
            if (_areValidOwnersInEpoch(ownerEpoch--, accounts)) return true;
        }

        return false;
    }

    /// @dev Returns true if a sufficient quantity of `accounts` are owners in the `ownerEpoch`.
    function _areValidOwnersInEpoch(uint256 ownerEpoch, address[] memory accounts) internal view returns (bool) {
        uint256 threshold = _getOwnerThreshold(ownerEpoch);
        uint256 validSignerCount;

        for (uint256 i; i < accounts.length; i++) {
            if (_isOwner(ownerEpoch, accounts[i]) && ++validSignerCount >= threshold) return true;
        }

        return false;
    }

    /// @dev Returns the array of owners within the current `ownerEpoch`.
    function owners() public view override returns (address[] memory results) {
        uint256 ownerEpoch = _ownerEpoch();
        uint256 ownerCount = _getOwnerCount(ownerEpoch);
        results = new address[](ownerCount);

        for (uint256 i; i < ownerCount; i++) {
            results[i] = _getOwner(ownerEpoch, i);
        }
    }

    /***********\
    |* Setters *|
    \***********/

    function _setOwnerEpoch(uint256 ownerEpoch) internal {
        _setUint(KEY_OWNER_EPOCH, ownerEpoch);
    }

    function _setOwner(
        uint256 ownerEpoch,
        uint256 index,
        address account
    ) internal {
        require(account != address(0), 'ZERO_ADDR');
        _setAddress(_getOwnerKey(ownerEpoch, index), account);
    }

    function _setOwnerCount(uint256 ownerEpoch, uint256 ownerCount) internal {
        _setUint(_getOwnerCountKey(ownerEpoch), ownerCount);
    }

    function _setOwners(
        uint256 ownerEpoch,
        address[] memory accounts,
        uint256 threshold
    ) internal {
        uint256 accountLength = accounts.length;

        require(accountLength >= threshold, 'INV_OWNERS');
        require(threshold > uint256(0), 'INV_OWNER_THLD');

        _setOwnerThreshold(ownerEpoch, threshold);
        _setOwnerCount(ownerEpoch, accountLength);

        for (uint256 i; i < accountLength; i++) {
            address account = accounts[i];

            // Check that the account wasn't already set as an owner for this ownerEpoch.
            require(!_isOwner(ownerEpoch, account), 'DUP_OWNER');

            // Set this account as the i-th owner in this ownerEpoch (needed to we can get all the owners for `owners`).
            _setOwner(ownerEpoch, i, account);
            _setIsOwner(ownerEpoch, account, true);
        }
    }

    function _setOwnerThreshold(uint256 ownerEpoch, uint256 ownerThreshold) internal {
        _setUint(_getOwnerThresholdKey(ownerEpoch), ownerThreshold);
    }

    function _setIsOwner(
        uint256 ownerEpoch,
        address account,
        bool isOwner
    ) internal {
        _setBool(_getIsOwnerKey(ownerEpoch, account), isOwner);
    }

    /**************************\
    |* Operator Functionality *|
    \**************************/

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getOperatorKey(uint256 operatorEpoch, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OPERATOR, operatorEpoch, index));
    }

    function _getOperatorCountKey(uint256 operatorEpoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OPERATOR_COUNT, operatorEpoch));
    }

    function _getOperatorThresholdKey(uint256 operatorEpoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_OPERATOR_THRESHOLD, operatorEpoch));
    }

    function _getIsOperatorKey(uint256 operatorEpoch, address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_IS_OPERATOR, operatorEpoch, account));
    }

    /***********\
    |* Getters *|
    \***********/

    function _operatorEpoch() internal view returns (uint256) {
        return getUint(KEY_OPERATOR_EPOCH);
    }

    function _getOperator(uint256 operatorEpoch, uint256 index) internal view returns (address) {
        return getAddress(_getOperatorKey(operatorEpoch, index));
    }

    function _getOperatorCount(uint256 operatorEpoch) internal view returns (uint256) {
        return getUint(_getOperatorCountKey(operatorEpoch));
    }

    function _getOperatorThreshold(uint256 operatorEpoch) internal view returns (uint256) {
        return getUint(_getOperatorThresholdKey(operatorEpoch));
    }

    function _isOperator(uint256 operatorEpoch, address account) internal view returns (bool) {
        return getBool(_getIsOperatorKey(operatorEpoch, account));
    }

    /// @dev Returns true if a sufficient quantity of `accounts` are operator in the same `operatorEpoch`, within the last `OLD_KEY_RETENTION + 1` operator epochs.
    function _areValidRecentOperators(address[] memory accounts) internal view returns (bool) {
        uint256 operatorEpoch = _operatorEpoch();
        uint256 recentEpochs = OLD_KEY_RETENTION + uint256(1);
        uint256 lowerBoundOperatorEpoch = operatorEpoch > recentEpochs ? operatorEpoch - recentEpochs : uint256(0);

        while (operatorEpoch > lowerBoundOperatorEpoch) {
            if (_areValidOperatorsInEpoch(operatorEpoch--, accounts)) return true;
        }

        return false;
    }

    /// @dev Returns true if a sufficient quantity of `accounts` are operator in the `operatorEpoch`.
    function _areValidOperatorsInEpoch(uint256 operatorEpoch, address[] memory accounts) internal view returns (bool) {
        uint256 threshold = _getOperatorThreshold(operatorEpoch);
        uint256 validSignerCount;

        for (uint256 i; i < accounts.length; i++) {
            if (_isOperator(operatorEpoch, accounts[i]) && ++validSignerCount >= threshold) return true;
        }

        return false;
    }

    /// @dev Returns the array of operators within the current `operatorEpoch`.
    function operators() public view override returns (address[] memory results) {
        uint256 operatorEpoch = _operatorEpoch();
        uint256 operatorCount = _getOperatorCount(operatorEpoch);
        results = new address[](operatorCount);

        for (uint256 i; i < operatorCount; i++) {
            results[i] = _getOperator(operatorEpoch, i);
        }
    }

    /***********\
    |* Setters *|
    \***********/

    function _setOperatorEpoch(uint256 operatorEpoch) internal {
        _setUint(KEY_OPERATOR_EPOCH, operatorEpoch);
    }

    function _setOperator(
        uint256 operatorEpoch,
        uint256 index,
        address account
    ) internal {
        // AUDIT: Should have `require(account != address(0), 'ZERO_ADDR');` like Singlesig?
        _setAddress(_getOperatorKey(operatorEpoch, index), account);
    }

    function _setOperatorCount(uint256 operatorEpoch, uint256 operatorCount) internal {
        _setUint(_getOperatorCountKey(operatorEpoch), operatorCount);
    }

    function _setOperators(
        uint256 operatorEpoch,
        address[] memory accounts,
        uint256 threshold
    ) internal {
        uint256 accountLength = accounts.length;

        require(accountLength >= threshold, 'INV_OPERATORS');
        require(threshold > uint256(0), 'INV_OPERATOR_THLD');

        _setOperatorThreshold(operatorEpoch, threshold);
        _setOperatorCount(operatorEpoch, accountLength);

        for (uint256 i; i < accountLength; i++) {
            address account = accounts[i];

            // Check that the account wasn't already set as an operator for this operatorEpoch.
            require(!_isOperator(operatorEpoch, account), 'DUP_OPERATOR');

            // Set this account as the i-th operator in this operatorEpoch (needed to we can get all the operators for `operators`).
            _setOperator(operatorEpoch, i, account);
            _setIsOperator(operatorEpoch, account, true);
        }
    }

    function _setOperatorThreshold(uint256 operatorEpoch, uint256 operatorThreshold) internal {
        _setUint(_getOperatorThresholdKey(operatorEpoch), operatorThreshold);
    }

    function _setIsOperator(
        uint256 operatorEpoch,
        address account,
        bool isOperator
    ) internal {
        _setBool(_getIsOperatorKey(operatorEpoch, account), isOperator);
    }

    /**********************\
    |* Self Functionality *|
    \**********************/

    function deployToken(bytes calldata params, bytes32) external onlySelf {
        (string memory name, string memory symbol, uint8 decimals, uint256 cap, address tokenAddr) = abi.decode(
            params,
            (string, string, uint8, uint256, address)
        );

        _deployToken(name, symbol, decimals, cap, tokenAddr);
    }

    function mintToken(bytes calldata params, bytes32) external onlySelf {
        (string memory symbol, address account, uint256 amount) = abi.decode(params, (string, address, uint256));

        _mintToken(symbol, account, amount);
    }

    function burnToken(bytes calldata params, bytes32) external onlySelf {
        (string memory symbol, bytes32 salt) = abi.decode(params, (string, bytes32));

        _burnToken(symbol, salt);
    }

    function approveContractCall(bytes calldata params, bytes32 commandId) external onlySelf {
        (string memory sourceChain, string memory sourceAddress, address contractAddress, bytes32 payloadHash) = abi
            .decode(params, (string, string, address, bytes32));

        _approveContractCall(commandId, sourceChain, sourceAddress, contractAddress, payloadHash);
    }

    function approveContractCallWithMint(bytes calldata params, bytes32 commandId) external onlySelf {
        (
            string memory sourceChain,
            string memory sourceAddress,
            address contractAddress,
            bytes32 payloadHash,
            string memory symbol,
            uint256 amount
        ) = abi.decode(params, (string, string, address, bytes32, string, uint256));

        _approveContractCallWithMint(
            commandId,
            sourceChain,
            sourceAddress,
            contractAddress,
            payloadHash,
            symbol,
            amount
        );
    }

    function transferOwnership(bytes calldata params, bytes32) external onlySelf {
        (address[] memory newOwners, uint256 newThreshold) = abi.decode(params, (address[], uint256));

        uint256 ownerEpoch = _ownerEpoch();

        emit OwnershipTransferred(owners(), _getOwnerThreshold(ownerEpoch), newOwners, newThreshold);

        _setOwnerEpoch(++ownerEpoch);
        _setOwners(ownerEpoch, newOwners, newThreshold);
    }

    function transferOperatorship(bytes calldata params, bytes32) external onlySelf {
        (address[] memory newOperators, uint256 newThreshold) = abi.decode(params, (address[], uint256));

        uint256 ownerEpoch = _ownerEpoch();

        emit OperatorshipTransferred(operators(), _getOperatorThreshold(ownerEpoch), newOperators, newThreshold);

        uint256 operatorEpoch = _operatorEpoch();
        _setOperatorEpoch(++operatorEpoch);
        _setOperators(operatorEpoch, newOperators, newThreshold);
    }

    /**************************\
    |* External Functionality *|
    \**************************/

    function setup(bytes calldata params) external override {
        // Prevent setup from being called on a non-proxy (the implementation).
        require(implementation() != address(0), 'NOT_PROXY');

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

    function execute(bytes calldata input) external override {
        (bytes memory data, bytes[] memory signatures) = abi.decode(input, (bytes, bytes[]));

        _execute(data, signatures);
    }

    function _execute(bytes memory data, bytes[] memory signatures) internal {
        uint256 signatureCount = signatures.length;

        address[] memory signers = new address[](signatureCount);

        for (uint256 i; i < signatureCount; i++) {
            signers[i] = ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(data)), signatures[i]);
        }

        (
            uint256 chainId,
            Role signersRole,
            bytes32[] memory commandIds,
            string[] memory commands,
            bytes[] memory params
        ) = abi.decode(data, (uint256, Role, bytes32[], string[], bytes[]));

        require(chainId == block.chainid, 'INV_CHAIN');
        require(_isSortedAscAndContainsNoDuplicate(signers), 'DUP_SIGNERS');

        uint256 commandsLength = commandIds.length;

        require(commandsLength == commands.length && commandsLength == params.length, 'INV_CMDS');

        bool areValidCurrentOwners;
        bool areValidRecentOwners;
        bool areValidRecentOperators;

        if (signersRole == Role.Owner) {
            areValidCurrentOwners = _areValidOwnersInEpoch(_ownerEpoch(), signers);
            areValidRecentOwners = areValidCurrentOwners || _areValidPreviousOwners(signers);
        } else if (signersRole == Role.Operator) {
            areValidRecentOperators = _areValidRecentOperators(signers);
        }

        for (uint256 i; i < commandsLength; i++) {
            bytes32 commandId = commandIds[i];

            if (isCommandExecuted(commandId)) continue; /* Ignore if duplicate commandId received */

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(commands[i]));

            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                if (!areValidRecentOwners) continue;

                commandSelector = AxelarGatewayMultisig.deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                if (!areValidRecentOperators && !areValidRecentOwners) continue;

                commandSelector = AxelarGatewayMultisig.mintToken.selector;
            } else if (commandHash == SELECTOR_APPROVE_CONTRACT_CALL) {
                if (!areValidRecentOperators && !areValidRecentOwners) continue;

                commandSelector = AxelarGatewayMultisig.approveContractCall.selector;
            } else if (commandHash == SELECTOR_APPROVE_CONTRACT_CALL_WITH_MINT) {
                if (!areValidRecentOperators && !areValidRecentOwners) continue;

                commandSelector = AxelarGatewayMultisig.approveContractCallWithMint.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                if (!areValidRecentOperators && !areValidRecentOwners) continue;

                commandSelector = AxelarGatewayMultisig.burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OWNERSHIP) {
                if (!areValidCurrentOwners) continue;

                commandSelector = AxelarGatewayMultisig.transferOwnership.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                if (!areValidCurrentOwners) continue;

                commandSelector = AxelarGatewayMultisig.transferOperatorship.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            // Prevent a re-entrancy from executing this command before it can be marked as successful.
            _setCommandExecuted(commandId, true);
            (bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, params[i], commandId));
            _setCommandExecuted(commandId, success);

            if (success) {
                emit Executed(commandId);
            }
        }
    }
}
