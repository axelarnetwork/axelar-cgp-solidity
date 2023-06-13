// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IOperators } from '../interfaces/IOperators.sol';
import { Ownable } from '../Ownable.sol';

/**
 * @title Operators
 * @dev Contract module which provides an access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions, and an operator that can execute arbitrary functions
 * on any smart contract.
 *
 * The owner account is initially set as the deployer address.
 */
contract Operators is Ownable, IOperators {
    mapping(address => bool) public operators;

    /**
     * @dev Sets the deployer as the initial owner.
     */
    constructor() Ownable() {}

    /**
     * @dev Modifier that requires the "msg.sender" to be an operator.
     * Emits a NotOperator error if the condition is not met.
     */
    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    /**
     * @dev Returns whether an address is an operator.
     * @param account Address to check
     * @return boolean whether the address is an operator
     */
    function isOperator(address account) external view returns (bool) {
        return operators[account];
    }

    /**
     * @dev Adds an address as an operator.
     * Can only be called by the current owner.
     * @param operator address to be added as operator
     */
    function addOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert InvalidOperator();
        if (operators[operator]) revert OperatorAlreadyAdded();

        operators[operator] = true;

        emit OperatorAdded(operator);
    }

    /**
     * @dev Removes an address as an operator.
     * Can only be called by the current owner.
     * @param operator address to be removed as operator
     */
    function removeOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert InvalidOperator();
        if (!operators[operator]) revert NotAnOperator();

        operators[operator] = false;

        emit OperatorRemoved(operator);
    }

    /**
     * @dev Allows an operator to execute arbitrary functions on any smart contract.
     * Can only be called by an operator.
     * @param target address of the contract to execute the function on
     * @param callData ABI encoded function call to execute on target
     * @return data return data from executed function call
     */
    function execute(address target, bytes calldata callData) external onlyOperator returns (bytes memory) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory data) = target.call(callData);
        if (!success) {
            revert ExecutionFailed();
        }

        return data;
    }
}
