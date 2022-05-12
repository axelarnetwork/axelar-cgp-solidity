// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { DepositHandler } from "../DepositHandler.sol";

contract DepositReceiver is DepositHandler {
    receive() external payable {}
}
