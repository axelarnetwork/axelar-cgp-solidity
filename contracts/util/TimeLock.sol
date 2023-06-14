// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { ITimeLock } from '../interfaces/ITimeLock.sol';

contract TimeLock is ITimeLock {
    mapping(bytes32 => uint256) public timeLockQueue;

    uint256 public immutable MINIMUM_TIME_LOCK_DELAY;

    constructor(uint256 minimumTimeDelay) {
        MINIMUM_TIME_LOCK_DELAY = minimumTimeDelay;
    }

    function _scheduleTimeLock(bytes32 hash, uint256 eta) internal {
        if (hash == 0) revert InvalidTimeLockHash();

        uint256 minimumEta = block.timestamp + MINIMUM_TIME_LOCK_DELAY;

        if (eta < minimumEta) eta = minimumEta;

        if (timeLockQueue[hash] != 0) revert TimeLockAlreadyScheduled();

        timeLockQueue[hash] = eta;
    }

    function _cancelTimeLock(bytes32 hash) internal {
        if (hash == 0) revert InvalidTimeLockHash();

        timeLockQueue[hash] = 0;
    }

    function _executeTimeLock(bytes32 hash) internal {
        uint256 eta = timeLockQueue[hash];

        if (hash == 0 || eta == 0) revert InvalidTimeLockHash();

        if (block.timestamp < eta) revert TimeLockNotReady();

        timeLockQueue[hash] = 0;
    }
}
