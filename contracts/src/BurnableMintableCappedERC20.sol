// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { ERC20 } from './ERC20.sol';
import { Ownable } from './Ownable.sol';
import { Burner } from './Burner.sol';
import { EternalStorage } from './EternalStorage.sol';

contract BurnableMintableCappedERC20 is ERC20, Ownable {
    uint256 public cap;

    bytes32 private constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');
    bytes32 private constant KEY_ALL_TOKENS_FROZEN =
        keccak256('all-tokens-frozen');

    event Frozen(address indexed owner);
    event Unfrozen(address indexed owner);

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

        require(msg.sender == burnerAddress, 'NOT_BURNER');

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
        require(totalSupply + amount <= cap, 'CAP_EXCEEDED');

        _mint(account, amount);
    }

    function burn(bytes32 salt) public onlyBurner(salt) {
        address account = msg.sender;

        _burn(account, balanceOf[account]);
    }

    function _beforeTokenTransfer(
        address,
        address,
        uint256
    ) internal view override {
        require(
            !EternalStorage(owner).getBool(KEY_ALL_TOKENS_FROZEN),
            'IS_FROZEN'
        );
        require(
            !EternalStorage(owner).getBool(
                keccak256(abi.encodePacked(PREFIX_TOKEN_FROZEN, symbol))
            ),
            'IS_FROZEN'
        );
    }
}
