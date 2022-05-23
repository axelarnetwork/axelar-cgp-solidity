// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IBurnableMintableCappedERC20 } from '../interfaces/IBurnableMintableCappedERC20.sol';

import { MintableCappedERC20 } from '../MintableCappedERC20.sol';
import { DepositHandler } from '../DepositHandler.sol';

contract BurnableMintableCappedERC20Init is IBurnableMintableCappedERC20, MintableCappedERC20 {
    // keccak256('token-frozen')
    bytes32 private constant PREFIX_TOKEN_FROZEN =
        bytes32(0x1a7261d3a36c4ce4235d10859911c9444a6963a3591ec5725b96871d9810626b);

    // keccak256('all-tokens-frozen')
    bytes32 private constant KEY_ALL_TOKENS_FROZEN =
        bytes32(0x75a31d1ce8e5f9892188befc328d3b9bd3fa5037457e881abc21f388471b8d96);

    // keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    bytes32 private constant DOMAIN_TYPE_SIGNATURE_HASH =
        bytes32(0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f);

    constructor(
        uint8 decimals,
        uint256 cap
    ) MintableCappedERC20('', '', decimals, cap) {}

    function init(
        string memory name_,
        string memory symbol_
    ) external {
        name = name_;
        symbol = symbol_;
    }

    function depositAddress(bytes32 salt) public view returns (address) {
        /* Convert a hash which is bytes32 to an address which is 20-byte long
        according to https://docs.soliditylang.org/en/v0.8.1/control-structures.html?highlight=create2#salted-contract-creations-create2 */
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                owner,
                                salt,
                                keccak256(abi.encodePacked(type(DepositHandler).creationCode))
                            )
                        )
                    )
                )
            );
    }

    function burn(bytes32 salt) external onlyOwner {
        address account = depositAddress(salt);
        _burn(account, balanceOf[account]);
    }

    function burnFrom(address account, uint256 amount) external onlyOwner {
        _approve(account, owner, allowance[account][owner] - amount);
        _burn(account, amount);
    }

    function _beforeTokenTransfer(
        address,
        address,
        uint256
    ) internal view override {
        if (IAxelarGateway(owner).allTokensFrozen() || IAxelarGateway(owner).tokenFrozen(symbol)) revert IsFrozen();
    }
}
