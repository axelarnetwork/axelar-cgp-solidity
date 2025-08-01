// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TestDeployTokenCall {
    event TestEvent(string message, bool success);

    // Mimic the deployToken function signature
    function deployToken(bytes calldata params, bytes32 commandId) external {
        // Decode the parameters like deployToken does
        (string memory name, string memory symbol, uint8 decimals, uint256 cap, address tokenAddress, uint256 mintLimit) = abi.decode(
            params,
            (string, string, uint8, uint256, address, uint256)
        );

        emit TestEvent('deployToken called successfully', true);
    }

    function callDeployToken() external {
        // Mimic the exact call pattern from AxelarGateway
        bytes memory params = abi.encode(
            'Test Token', // name
            'TEST', // symbol
            18, // decimals
            10000, // cap
            address(0), // tokenAddress
            1000 // mintLimit
        );
        bytes32 commandId = bytes32('test-command-id');

        (bool success, bytes memory data) = address(this).call(abi.encodeWithSelector(this.deployToken.selector, params, commandId));

        emit TestEvent('Internal call result', success);
    }
}
