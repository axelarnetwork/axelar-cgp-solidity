// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';
import { DepositBase } from './DepositBase.sol';

// This should be owned by the microservice that is paying for gas.
contract ReceiverImplementation is DepositBase {
    constructor(address gateway, string memory wrappedSymbol) DepositBase(gateway, wrappedSymbol) {}

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: msg.sender == AxelarDepositService, this == DepositReceiver
    function receiveAndSendToken(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata symbol
    ) external {
        // Always refunding native otherwise it's sent on DepositReceiver self destruction
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address tokenAddress = IAxelarGateway(gateway).tokenAddresses(symbol);
        // Checking with AxelarDepositService if need to refund a token
        address refund = DepositBase(msg.sender).refundToken();
        if (refund != address(0)) {
            _safeTransfer(refund, refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(tokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        // Sending the token trough the gateway
        IERC20(tokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, symbol, amount);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: msg.sender == AxelarDepositService, this == DepositReceiver
    function receiveAndSendNative(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        address refund = DepositBase(msg.sender).refundToken();
        if (refund != address(0)) {
            if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

            _safeTransfer(refund, refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        address wrappedTokenAddress = wrappedToken();
        uint256 amount = address(this).balance;

        if (amount == 0) revert NothingDeposited();

        // Wrapping the native currency and sending WETH-like token through the gateway
        IWETH9(wrappedTokenAddress).deposit{ value: amount }();
        IERC20(wrappedTokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, wrappedSymbol(), amount);
    }

    // @dev This function is used for delegate by DepositReceiver deployed above
    // Context: msg.sender == DepositBase, this == DepositReceiver
    function receiveAndUnwrapNative(address payable refundAddress, address payable recipient) external {
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address wrappedTokenAddress = wrappedToken();
        address refund = DepositBase(msg.sender).refundToken();
        if (refund != address(0)) {
            _safeTransfer(refund, refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(wrappedTokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        // Unwrapping the token into native currency and sending it to the recipient
        IWETH9(wrappedTokenAddress).withdraw(amount);
        recipient.transfer(amount);
    }
}
