// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';

import './Ownable.sol';

contract BurnableMintableCappedERC20 is ERC20, Ownable {
    using SafeMath for uint256;

    uint256 private _cap;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 cap
    ) ERC20(name, symbol) Ownable() {
        _setupDecimals(decimals);
        _cap = cap;
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
