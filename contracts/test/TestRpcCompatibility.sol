// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract TestRpcCompatibility {
    uint256 private value;
    uint256 private subscribeValue;

    event ValueUpdated(uint256 indexed value);
    event ValueUpdatedForSubscribe(uint256 indexed value);

    function getValue() public view returns (uint256) {
        return value;
    }

    function updateValue(uint256 newValue) external {
        value = newValue;
        emit ValueUpdated(newValue);
    }

    function updateValueForSubscribe(uint256 newValue) external {
        subscribeValue = newValue;
        emit ValueUpdatedForSubscribe(newValue);
    }
}
