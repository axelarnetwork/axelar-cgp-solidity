// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IAxelarAuthModule {
    function validateSignatureData(bytes32 messageHash, bytes calldata signatureData) external returns (bool currentOperators);

    function transferOperatorship(bytes calldata params) external;

    function gateway() external returns (address);

    function setGateway(address gateway) external;
}
