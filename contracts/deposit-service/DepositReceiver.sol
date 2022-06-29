// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

contract DepositReceiver {
    error NotOwner();
    error NotContract();

    address internal _owner;

    constructor() {
        _owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    function execute(
        address callee,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (bool success, bytes memory returnData) {
        if (callee.code.length == 0) revert NotContract();

        // solhint-disable-next-line avoid-low-level-calls
        (success, returnData) = callee.call{ value: value }(data);
    }

    // NOTE: The gateway should always destroy the `DepositHandler` in the same runtime context that deploys it.
    function destroy(address etherDestination) external onlyOwner {
        selfdestruct(payable(etherDestination));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
