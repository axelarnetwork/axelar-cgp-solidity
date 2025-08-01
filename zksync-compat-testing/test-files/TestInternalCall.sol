// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TestInternalCall {
    event DirectCallResult(bool success, bytes data);
    event InternalCallResult(bool success, bytes data);
    event SuccessCheck(bool directCallSuccess, bool internalCallSuccess);

    bool public lastInternalCallSuccess;
    bool public lastDirectCallSuccess;

    function testDirectCall() external returns (bool) {
        lastDirectCallSuccess = true;
        emit DirectCallResult(true, abi.encode('direct call successful'));
        return true;
    }

    function testInternalCall() external returns (bool) {
        // This mimics the pattern used in AxelarGateway
        (bool success, bytes memory data) = address(this).call(abi.encodeWithSelector(this.testDirectCall.selector));

        lastInternalCallSuccess = success;
        emit InternalCallResult(success, data);

        // Emit a comparison event
        emit SuccessCheck(lastDirectCallSuccess, success);

        return success;
    }

    // Function to check both results
    function checkResults() external view returns (bool directSuccess, bool internalSuccess) {
        return (lastDirectCallSuccess, lastInternalCallSuccess);
    }
}
