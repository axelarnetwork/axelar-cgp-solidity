// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IBurnableMintableCappedERC20 } from "./interfaces/IBurnableMintableCappedERC20.sol";

import { ERC20 } from './ERC20.sol';
import { Ownable } from './Ownable.sol';
import { Burner } from './Burner.sol';

contract BurnableMintableCappedERC20 is IBurnableMintableCappedERC20, ERC20, Ownable {

    bool public override allTokensFrozen;
    mapping(string => bool) public tokenFrozen;

    uint256 public override cap;

    mapping (address => bool) public override blacklisted;

    modifier onlyBurner(bytes32 salt) {
        bytes memory burnerInitCode =
            abi.encodePacked(
                type(Burner).creationCode,
                abi.encode(address(this)),
                salt
            );

        bytes32 burnerInitCodeHash = keccak256(burnerInitCode);

        /* Convert a hash which is bytes32 to an address which is 20-byte long
        according to https://docs.soliditylang.org/en/v0.8.1/control-structures.html?highlight=create2#salted-contract-creations-create2 */
        address burnerAddress =
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                owner,
                                salt,
                                burnerInitCodeHash
                            )
                        )
                    )
                )
            );

        require(
            msg.sender == burnerAddress,
            'BurnableMintableCappedERC20: sender not burner'
        );

        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 capacity
    ) ERC20(name, symbol, decimals) Ownable() {
        cap = capacity;
    }

    function mint(address account, uint256 amount) public override onlyOwner {
        require(
            totalSupply + amount <= cap,
            'BurnableMintableCappedERC20: cap exceeded'
        );

        _mint(account, amount);
    }

    function burn(bytes32 salt) public override onlyBurner(salt) {
        address account = msg.sender;

        _burn(account, balanceOf[account]);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256
    ) internal view override {
        require(
            !allTokensFrozen,
            'BurnableMintableCappedERC20: all tokens are frozen'
        );
        require(
            !tokenFrozen[symbol],
            'BurnableMintableCappedERC20: token is frozen'
        );
        require(
            !blacklisted[from],
            'BurnableMintableCappedERC20: from account is blacklisted'
        );
        require(
            !blacklisted[to],
            'BurnableMintableCappedERC20: to account is blacklisted'
        );
    }
}
