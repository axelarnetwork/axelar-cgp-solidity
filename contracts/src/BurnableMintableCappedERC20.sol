// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import './ERC20.sol';
import './SafeMath.sol';
import './Ownable.sol';

contract BurnableMintableCappedERC20 is ERC20, Ownable {
    using SafeMath for uint256;

    uint256 private _cap;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 capacity
    ) ERC20(name, symbol) Ownable() {
        _setupDecimals(decimals);
        _cap = capacity;
    }

    function mint(address account, uint256 amount) public onlyOwner {
        require(
            totalSupply().add(amount) <= _cap,
            'BurnableMintableCappedERC20: cap exceeded'
        );

        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }

    function cap() public view returns (uint256) {
        return _cap;
    }
}
