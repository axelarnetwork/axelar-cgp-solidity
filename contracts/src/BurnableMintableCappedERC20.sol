// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import './ERC20.sol';
import './Ownable.sol';
import './Burner.sol';

contract BurnableMintableCappedERC20 is ERC20, Ownable {
    uint256 public cap;

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

    function mint(address account, uint256 amount) public onlyOwner {
        require(
            totalSupply + amount <= cap,
            'BurnableMintableCappedERC20: cap exceeded'
        );

        _mint(account, amount);
    }

    function burn(bytes32 salt) public onlyBurner(salt) {
        address account = msg.sender;

        _burn(account, balanceOf[account]);
    }
}
