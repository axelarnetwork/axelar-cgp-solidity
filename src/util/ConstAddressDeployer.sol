// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

contract ConstAddressDeployer {
    error FailedInit();

    event Deployed(bytes32 bytecodeHash, bytes32 salt, address deployedAddress);

    function deploy(bytes memory bytecode, bytes32 salt) external returns (address deployedAddress_) {
        bytes32 newSalt = keccak256(abi.encode(msg.sender, salt));
        // solhint-disable-next-line no-inline-assembly
        assembly {
            deployedAddress_ := create2(0, add(bytecode, 32), mload(bytecode), newSalt)
        }
        emit Deployed(keccak256(bytecode), salt, deployedAddress_);
    }

    function deployAndInit(
        bytes memory bytecode,
        bytes32 salt,
        bytes calldata init
    ) external returns (address deployedAddress_) {
        bytes32 newSalt = keccak256(abi.encode(msg.sender, salt));
        // solhint-disable-next-line no-inline-assembly
        assembly {
            deployedAddress_ := create2(0, add(bytecode, 32), mload(bytecode), newSalt)
        }
        (bool success, ) = deployedAddress_.call(init);
        if (!success) revert FailedInit();
        emit Deployed(keccak256(bytecode), salt, deployedAddress_);
    }

    function deployedAddress(bytes calldata bytecode, address sender, bytes32 salt) external view returns (address deployedAddress_) {
        bytes32 newSalt = keccak256(abi.encode(sender, salt));
        deployedAddress_ = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff',
                            address(this),
                            newSalt,
                            keccak256(bytecode) // init code hash
                        )
                    )
                )
            )
        );
    }
}
