// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { ECDSA } from './ECDSA.sol';
import { IAxelarGatewayMultisig } from './IAxelarGatewayMultisig.sol';
import { AxelarGateway } from './AxelarGateway.sol';

contract AxelarGatewayMultisig is IAxelarGatewayMultisig, AxelarGateway {
    bytes32 internal constant PREFIX_OWNERS = keccak256('owners');
    bytes32 internal constant PREFIX_OPERATORS = keccak256('operators');
    bytes32 internal constant PREFIX_OWNERS_COUNT = keccak256('owners-count');
    bytes32 internal constant PREFIX_OPERATORS_COUNT =
        keccak256('operators-count');
    bytes32 internal constant PREFIX_OWNERS_THRESHOLD =
        keccak256('owner-threshold');
    bytes32 internal constant PREFIX_OPERATORS_THRESHOLD =
        keccak256('operator-threshold');
    bytes32 internal constant PREFIX_IS_OWNER = keccak256('is-owner');
    bytes32 internal constant PREFIX_IS_OPERATOR = keccak256('is-operator');

    bytes32 internal constant KEY_OWNERS_INDEX = keccak256('owners-index');
    bytes32 internal constant KEY_OPERATORS_INDEX =
        keccak256('operators-index');

    function owners() public view override returns (address[] memory) {
        return _owners(_getOwnersIndex());
    }

    function _owners(uint256 ownersIndex)
        internal
        view
        returns (address[] memory)
    {
        uint256 ownerCount =
            getUint(
                keccak256(abi.encodePacked(PREFIX_OWNERS_COUNT, ownersIndex))
            );
        address[] memory results = new address[](ownerCount);

        for (uint8 i = 0; i < ownerCount; i++) {
            results[i] = getAddress(
                keccak256(abi.encodePacked(PREFIX_OWNERS, ownersIndex, i))
            );
        }

        return results;
    }

    function operators() public view override returns (address[] memory) {
        return _operators(_getOperatorsIndex());
    }

    function _operators(uint256 operatorsIndex)
        internal
        view
        returns (address[] memory)
    {
        uint256 operatorCount =
            getUint(
                keccak256(
                    abi.encodePacked(PREFIX_OPERATORS_COUNT, operatorsIndex)
                )
            );
        address[] memory results = new address[](operatorCount);

        for (uint8 i = 0; i < operatorCount; i++) {
            results[i] = getAddress(
                keccak256(abi.encodePacked(PREFIX_OPERATORS, operatorsIndex, i))
            );
        }

        return results;
    }

    function setup(bytes memory params) external override {
        (
            address[] memory adminAddrs,
            uint8 adminThreshold,
            address[] memory ownerAddrs,
            uint8 ownerThreshold,
            address[] memory operatorAddrs,
            uint8 operatorThreshold
        ) =
            abi.decode(
                params,
                (address[], uint8, address[], uint8, address[], uint8)
            );

        _setAdmins(adminAddrs, adminThreshold);
        _setOwners(ownerAddrs, ownerThreshold);
        _setOperators(operatorAddrs, operatorThreshold);

        emit OwnershipTransferred(
            new address[](0),
            0,
            ownerAddrs,
            ownerThreshold
        );
        emit OperatorshipTransferred(
            new address[](0),
            0,
            operatorAddrs,
            operatorThreshold
        );
    }

    function execute(bytes memory input) external override {
        (bytes memory data, bytes[] memory sigs) =
            abi.decode(input, (bytes, bytes[]));

        _execute(data, sigs);
    }

    function _execute(bytes memory data, bytes[] memory sigs) internal {
        address[] memory signers = new address[](sigs.length);
        for (uint256 i = 0; i < sigs.length; i++) {
            signers[i] = ECDSA.recover(
                ECDSA.toEthSignedMessageHash(keccak256(data)),
                sigs[i]
            );
        }

        (
            uint256 chainId,
            bytes32[] memory commandIds,
            string[] memory commands,
            bytes[] memory params
        ) = abi.decode(data, (uint256, bytes32[], string[], bytes[]));

        require(chainId == _getChainID(), 'INV_CHAIN');

        uint256 commandsLength = commandIds.length;

        require(
            commandsLength == commands.length &&
                commandsLength == params.length,
            'INV_CMDS'
        );

        for (uint256 i = 0; i < commandsLength; i++) {
            bytes32 commandId = commandIds[i];
            string memory command = commands[i];

            if (_isCommandExecuted(commandId)) {
                continue; /* Ignore if duplicate commandId received */
            }

            bytes4 commandSelector;
            bytes32 commandHash = keccak256(abi.encodePacked(command));
            if (commandHash == SELECTOR_DEPLOY_TOKEN) {
                commandSelector = AxelarGatewayMultisig.deployToken.selector;
            } else if (commandHash == SELECTOR_MINT_TOKEN) {
                commandSelector = AxelarGatewayMultisig.mintToken.selector;
            } else if (commandHash == SELECTOR_BURN_TOKEN) {
                commandSelector = AxelarGatewayMultisig.burnToken.selector;
            } else if (commandHash == SELECTOR_TRANSFER_OWNERSHIP) {
                commandSelector = AxelarGatewayMultisig
                    .transferOwnership
                    .selector;
            } else if (commandHash == SELECTOR_TRANSFER_OPERATORSHIP) {
                commandSelector = AxelarGatewayMultisig
                    .transferOperatorship
                    .selector;
            } else if (commandHash == SELECTOR_UPDATE) {
                commandSelector = AxelarGatewayMultisig.update.selector;
            } else {
                continue; /* Ignore if unknown command received */
            }

            (bool success, ) =
                address(this).call(
                    abi.encodeWithSelector(commandSelector, signers, params[i])
                );
            _setCommandExecuted(commandId, success);
        }
    }

    function deployToken(address[] memory signers, bytes memory params)
        external
        onlySelf
    {
        (
            string memory name,
            string memory symbol,
            uint8 decimals,
            uint256 cap
        ) = abi.decode(params, (string, string, uint8, uint256));

        require(_areValidOwners(signers), 'INV_SIGNERS');

        _deployToken(name, symbol, decimals, cap);
    }

    function mintToken(address[] memory signers, bytes memory params)
        external
        onlySelf
    {
        (string memory symbol, address account, uint256 amount) =
            abi.decode(params, (string, address, uint256));

        require(
            _areValidOwners(signers) || _areValidOperators(signers),
            'INV_SIGNERS'
        );

        _mintToken(symbol, account, amount);
    }

    function burnToken(address[] memory signers, bytes memory params)
        external
        onlySelf
    {
        (string memory symbol, bytes32 salt) =
            abi.decode(params, (string, bytes32));

        require(
            _areValidOwners(signers) || _areValidOperators(signers),
            'INV_SIGNERS'
        );

        _burnToken(symbol, salt);
    }

    function transferOwnership(address[] memory signers, bytes memory params)
        external
        onlySelf
    {
        (address[] memory newOwners, uint8 newThreshold) =
            abi.decode(params, (address[], uint8));

        uint256 ownersIndex = _getOwnersIndex();
        require(_areValidOwners(ownersIndex, signers), 'INV_SIGNERS');
        uint8 threshold =
            uint8(
                getUint(
                    keccak256(
                        abi.encodePacked(PREFIX_OWNERS_THRESHOLD, ownersIndex)
                    )
                )
            );

        emit OwnershipTransferred(owners(), threshold, newOwners, newThreshold);

        _setOwners(newOwners, newThreshold);
    }

    function transferOperatorship(address[] memory signers, bytes memory params)
        external
        onlySelf
    {
        (address[] memory newOperators, uint8 newThreshold) =
            abi.decode(params, (address[], uint8));

        require(_areValidOwners(_getOwnersIndex(), signers), 'INV_SIGNERS');
        uint8 threshold =
            uint8(
                getUint(
                    keccak256(
                        abi.encodePacked(
                            PREFIX_OPERATORS_THRESHOLD,
                            _getOperatorsIndex()
                        )
                    )
                )
            );

        emit OperatorshipTransferred(
            operators(),
            threshold,
            newOperators,
            newThreshold
        );

        _setOperators(newOperators, newThreshold);
    }

    function update(address[] memory signers, bytes memory params)
        external
        onlySelf
    {
        (address newVersion, bytes memory setupParams) =
            abi.decode(params, (address, bytes));

        require(_areValidOwners(_getOwnersIndex(), signers), 'INV_SIGNERS');

        _update(newVersion, setupParams);
    }

    function _areValidOwners(address[] memory signers)
        internal
        view
        returns (bool)
    {
        uint256 ownerIndex = _getOwnersIndex();
        for (
            uint256 i = ownerIndex;
            i > 0 &&
                (ownerIndex <= OLD_KEY_RETENTION ||
                    i >= ownerIndex - OLD_KEY_RETENTION);
            i--
        ) {
            if (_areValidOwners(i, signers)) {
                return true;
            }
        }

        return false;
    }

    function _areValidOwners(uint256 index, address[] memory signers)
        internal
        view
        returns (bool)
    {
        return _areValidSigners(index, signers, true);
    }

    function _areValidOperators(address[] memory signers)
        internal
        view
        returns (bool)
    {
        uint256 operatorIndex = _getOperatorsIndex();
        for (
            uint256 i = operatorIndex;
            i > 0 &&
                (operatorIndex <= OLD_KEY_RETENTION ||
                    i >= operatorIndex - OLD_KEY_RETENTION);
            i--
        ) {
            if (_areValidOperators(i, signers)) {
                return true;
            }
        }

        return false;
    }

    function _areValidOperators(uint256 index, address[] memory signers)
        internal
        view
        returns (bool)
    {
        return _areValidSigners(index, signers, false);
    }

    function _areValidSigners(
        uint256 index,
        address[] memory signers,
        bool areValidOwners
    ) internal view returns (bool) {
        bytes32 prefixThreshold;
        bytes32 prefixIs;

        if (areValidOwners) {
            prefixThreshold = PREFIX_OWNERS_THRESHOLD;
            prefixIs = PREFIX_IS_OWNER;
        } else {
            prefixThreshold = PREFIX_OPERATORS_THRESHOLD;
            prefixIs = PREFIX_IS_OPERATOR;
        }

        uint256 threshold =
            getUint(keccak256(abi.encodePacked(prefixThreshold, index)));
        if (signers.length < threshold) {
            return false;
        }

        uint256 validSignerCount = 0;
        for (uint8 i = 0; i < signers.length; i++) {
            bool isDuplicate = false;

            for (uint8 j = i + 1; j < signers.length; j++) {
                if (signers[i] == signers[j]) {
                    isDuplicate = true;
                    break;
                }
            }

            if (isDuplicate) {
                continue;
            }

            bool isValidSigner =
                getBool(
                    keccak256(abi.encodePacked(prefixIs, index, signers[i]))
                );
            if (isValidSigner && ++validSignerCount >= threshold) {
                return true;
            }
        }

        return false;
    }

    function _getOwnersIndex() internal view returns (uint256) {
        return getUint(KEY_OWNERS_INDEX);
    }

    function _getOperatorsIndex() internal view returns (uint256) {
        return getUint(KEY_OPERATORS_INDEX);
    }

    function _setOwners(address[] memory addrs, uint8 threshold) internal {
        _setSigners(addrs, threshold, true);
    }

    function _setOperators(address[] memory addrs, uint8 threshold) internal {
        _setSigners(addrs, threshold, false);
    }

    function _setSigners(
        address[] memory addrs,
        uint8 threshold,
        bool isOwner
    ) internal {
        require(addrs.length >= threshold, 'INV_SIGNERS');
        require(threshold > 0, 'INV_SIGNER_THLD');

        uint256 signersIndex;
        bytes32 isSignerPrefix;
        bytes32 signersPrefix;
        bytes32 signersCountPrefix;
        bytes32 signersThresholdPrefix;
        bytes32 signersIndexKey;

        if (isOwner) {
            signersIndex = _getOwnersIndex() + 1;
            isSignerPrefix = PREFIX_IS_OWNER;
            signersPrefix = PREFIX_OWNERS;
            signersCountPrefix = PREFIX_OWNERS_COUNT;
            signersThresholdPrefix = PREFIX_OWNERS_THRESHOLD;
            signersIndexKey = KEY_OWNERS_INDEX;
        } else {
            signersIndex = _getOperatorsIndex() + 1;
            isSignerPrefix = PREFIX_IS_OPERATOR;
            signersPrefix = PREFIX_OPERATORS;
            signersCountPrefix = PREFIX_OPERATORS_COUNT;
            signersThresholdPrefix = PREFIX_OPERATORS_THRESHOLD;
            signersIndexKey = KEY_OPERATORS_INDEX;
        }

        for (uint8 i = 0; i < addrs.length; i++) {
            bytes32 isSignerKey =
                keccak256(
                    abi.encodePacked(isSignerPrefix, signersIndex, addrs[i])
                );
            require(!getBool(isSignerKey), 'DUP_SIGNER');

            setAddress(
                keccak256(abi.encodePacked(signersPrefix, signersIndex, i)),
                addrs[i]
            );
            setBool(isSignerKey, true);
        }
        setUint(
            keccak256(abi.encodePacked(signersCountPrefix, signersIndex)),
            addrs.length
        );
        setUint(
            keccak256(abi.encodePacked(signersThresholdPrefix, signersIndex)),
            threshold
        );
        setUint(signersIndexKey, signersIndex);
    }
}
