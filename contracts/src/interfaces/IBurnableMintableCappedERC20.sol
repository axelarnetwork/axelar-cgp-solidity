// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IERC20 } from './IERC20.sol';
import { IOwnable } from './IOwnable.sol';

interface IBurnableMintableCappedERC20 is IERC20, IOwnable {

    event Frozen(address indexed owner);
    event Unfrozen(address indexed owner);

    function allTokensFrozen() external returns (bool);

    function tokenFrozen(string) external returns (bool);

    function cap() external returns (uint256);

    function blacklisted(address) external returns (bool);

    function mint(address account, uint256 amount) external;

    function burn(bytes32 salt) external;

}
