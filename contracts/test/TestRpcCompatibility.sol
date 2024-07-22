// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract TestRpcCompatibility {
    uint256 private value;
    uint256 private subscribeValue;

    event ValueUpdated(uint256 indexed value);
    event ValueUpdatedForSubscribe(uint256 indexed value);
    event ContractCallWithToken(
        address indexed sender,
        string destinationChain,
        string destinationContractAddress,
        bytes32 indexed payloadHash,
        bytes payload,
        string symbol,
        uint256 amount
    );

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

    function emitCallContractWithToken(
        string calldata destinationChain,
        string calldata destinationContractAddress,
        bytes32 payloadHash,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount
    ) external {
        emit ContractCallWithToken(msg.sender, destinationChain, destinationContractAddress, payloadHash, payload, symbol, amount);
    }
}
