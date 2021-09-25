// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import {ERC20} from './ERC20.sol';
import {Ownable} from './Ownable.sol';
import {Burner} from './Burner.sol';
import {EternalStorage} from './EternalStorage.sol';

contract BurnableMintableCappedERC20 is ERC20, Ownable {
    uint256 public cap;
    EternalStorage private _eternalStorage;

    bytes32 private constant PREFIX_TOKEN_FROZEN = keccak256('token-frozen');
    bytes32 private constant PREFIX_ACCOUNT_BLACKLISTED =
        keccak256('account-blacklisted');
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

    function setEternalStorage(address eternalStorageAddr) public onlyOwner {
        _eternalStorage = EternalStorage(eternalStorageAddr);
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

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256
    ) internal view override {
        require(
            !_eternalStorage.getBool(KEY_ALL_TOKENS_FROZEN),
            'BurnableMintableCappedERC20: all tokens are frozen'
        );
        require(
            !_eternalStorage.getBool(
                keccak256(abi.encodePacked(PREFIX_TOKEN_FROZEN, symbol))
            ),
            'BurnableMintableCappedERC20: token is frozen'
        );
        require(
            !_eternalStorage.getBool(
                keccak256(abi.encodePacked(PREFIX_ACCOUNT_BLACKLISTED, from))
            ),
            'BurnableMintableCappedERC20: from account is blacklisted'
        );
        require(
            !_eternalStorage.getBool(
                keccak256(abi.encodePacked(PREFIX_ACCOUNT_BLACKLISTED, to))
            ),
            'BurnableMintableCappedERC20: to account is blacklisted'
        );
    }
}
