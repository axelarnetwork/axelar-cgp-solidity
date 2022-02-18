// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

contract DepositHandler {
    uint256 internal constant IS_NOT_LOCKED = uint256(0);
    uint256 internal constant IS_LOCKED = uint256(1);

    uint256 internal _lockedStatus = IS_NOT_LOCKED;

    function execute(address callee, bytes calldata data) external returns (bool success, bytes memory returnData) {
        // Reentrancy Guard
        require(_lockedStatus == IS_NOT_LOCKED);
        _lockedStatus = IS_LOCKED;

        (success, returnData) = callee.call(data);

        _lockedStatus = IS_NOT_LOCKED;
    }

    function destroy(address etherDestination) external {
        selfdestruct(payable(etherDestination));
    }
}
