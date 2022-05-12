// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

contract DepositReceiver {
    error NotOwner();

    address internal _owner;

    constructor() {
        _owner = msg.sender;
    }

    modifier onlyOwner() {
        if (_owner != msg.sender) revert NotOwner();
        _;
    }

    function execute(
        address callee,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (bool success, bytes memory returnData) {
        if (callee.code.length != 0) {
            (success, returnData) = callee.call{ value: value }(data);
        }
    }

    // NOTE: The gateway should always destroy the `DepositHandler` in the same runtime context that deploys it.
    function destroy(address etherDestination) external onlyOwner {
        selfdestruct(payable(etherDestination));
    }

    receive() external payable {}
}
