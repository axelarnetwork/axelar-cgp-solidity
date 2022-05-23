// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

contract ConstAddressDeployer {
    error FailedInit();

    event Deployed(bytes32 bytecodeHash, bytes32 salt, address deployedAddress);
    
    function deploy(bytes memory bytecode, bytes32 salt) external returns (address deployedAddress_) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            deployedAddress_ := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        emit Deployed(keccak256(bytecode), salt, deployedAddress_);
    }

    function deployAndInit(bytes memory bytecode, bytes32 salt, bytes calldata init) external returns (address deployedAddress_) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            deployedAddress_ := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        (bool success, ) = deployedAddress_.call(init);
        if(!success) revert FailedInit();
        emit Deployed(keccak256(bytecode), salt, deployedAddress_);
    }

    function deployedAddress(bytes calldata bytecode, bytes32 salt) external view returns (address deployedAddress_) {
        deployedAddress_ = address(uint160(uint256(keccak256(abi.encodePacked(
            hex'ff',
            address(this),
            salt,
            keccak256(bytecode) // init code hash
        )))));
    }
}
