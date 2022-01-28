// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

contract DepositHandler {
    function execute(address callee, bytes calldata data) external returns (bool success, bytes memory returnData) {
        (success, returnData) = callee.call(data);
    }

    function destroy(address etherDestination) external {
        selfdestruct(payable(etherDestination));
    }
}
