// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarDepositService } from '../interfaces/IAxelarDepositService.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';
import { Upgradable } from '../util/Upgradable.sol';
import { DepositReceiver } from './DepositReceiver.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarDepositService is Upgradable, IAxelarDepositService {
    address public immutable gateway;
    bytes32 internal immutable wrappedSymbolBytes;

    // stored and deleted withing the same transaction
    address public refundToken;

    constructor(address gateway_, string memory wrappedSymbol_) {
        if (gateway_ == address(0)) revert InvalidAddress();

        gateway = gateway_;

        if (IAxelarGateway(gateway_).tokenAddresses(wrappedSymbol_) == address(0)) revert InvalidSymbol();

        bytes memory symbolBytes = bytes(wrappedSymbol_);

        if (symbolBytes.length == 0 || symbolBytes.length > 31) revert InvalidSymbol();

        uint256 symbolNumber = uint256(bytes32(symbolBytes));

        // storing string length as the last byte of the data
        symbolNumber |= 0xff & symbolBytes.length;
        wrappedSymbolBytes = bytes32(abi.encodePacked(symbolNumber));
    }

    function sendNative(string calldata destinationChain, string calldata destinationAddress) external payable {
        address wrappedTokenAddress = wrappedToken();
        uint256 amount = msg.value;

        if (amount == 0) revert NothingDeposited();

        IWETH9(wrappedTokenAddress).deposit{ value: amount }();
        IERC20(wrappedTokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, wrappedSymbol(), amount);
    }

    function depositAddressForTransferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address) {
        return
            _depositAddress(
                salt,
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferToken.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress,
                    tokenSymbol
                )
            );
    }

    function depositAddressForTransferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address) {
        return
            _depositAddress(
                salt,
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferNative.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress
                )
            );
    }

    function depositAddressForWithdrawNative(
        bytes32 salt,
        address refundAddress,
        address recipient
    ) external view returns (address) {
        return
            _depositAddress(salt, abi.encodeWithSelector(AxelarDepositService.receiveAndWithdrawNative.selector, refundAddress, recipient));
    }

    function transferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external {
        // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
        new DepositReceiver{ salt: salt }(
            abi.encodeWithSelector(
                AxelarDepositService.receiveAndTransferToken.selector,
                refundAddress,
                destinationChain,
                destinationAddress,
                tokenSymbol
            )
        );
    }

    function refundFromTransferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol,
        address[] calldata refundTokens
    ) external {
        for (uint256 i; i < refundTokens.length; i++) {
            refundToken = refundTokens[i];
            // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
            new DepositReceiver{ salt: salt }(
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferToken.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress,
                    tokenSymbol
                )
            );
        }

        refundToken = address(0);
    }

    function receiveAndTransferToken(
        address payable refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata symbol
    ) external {
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address tokenAddress = IAxelarGateway(gateway).tokenAddresses(symbol);
        address refund = AxelarDepositService(msg.sender).refundToken();
        if (refund != address(0)) {
            if (refund == tokenAddress) return;
            IERC20(refund).transfer(refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(tokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        IERC20(tokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, symbol, amount);
    }

    function transferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
        new DepositReceiver{ salt: salt }(
            abi.encodeWithSelector(
                AxelarDepositService.receiveAndTransferNative.selector,
                refundAddress,
                destinationChain,
                destinationAddress
            )
        );
    }

    function refundFromTransferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        address[] calldata refundTokens
    ) external {
        for (uint256 i; i < refundTokens.length; i++) {
            refundToken = refundTokens[i];
            // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
            new DepositReceiver{ salt: salt }(
                abi.encodeWithSelector(
                    AxelarDepositService.receiveAndTransferNative.selector,
                    refundAddress,
                    destinationChain,
                    destinationAddress
                )
            );
        }

        refundToken = address(0);
    }

    function receiveAndTransferNative(
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        address refund = AxelarDepositService(msg.sender).refundToken();
        if (refund != address(0)) {
            IERC20(refund).transfer(refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        address wrappedTokenAddress = wrappedToken();
        uint256 amount = address(this).balance;

        if (amount == 0) revert NothingDeposited();

        IWETH9(wrappedTokenAddress).deposit{ value: amount }();
        IERC20(wrappedTokenAddress).approve(gateway, amount);
        IAxelarGateway(gateway).sendToken(destinationChain, destinationAddress, wrappedSymbol(), amount);
    }

    function withdrawNative(
        bytes32 salt,
        address refundAddress,
        address payable recipient
    ) external {
        // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
        new DepositReceiver{ salt: salt }(
            abi.encodeWithSelector(AxelarDepositService.receiveAndWithdrawNative.selector, refundAddress, recipient)
        );
    }

    function refundFromWithdrawNative(
        bytes32 salt,
        address refundAddress,
        address payable recipient,
        address[] calldata refundTokens
    ) external {
        for (uint256 i; i < refundTokens.length; i++) {
            refundToken = refundTokens[i];
            // NOTE: `DepositReceiver` is destroyed in the same runtime context that it is deployed.
            new DepositReceiver{ salt: salt }(
                abi.encodeWithSelector(AxelarDepositService.receiveAndWithdrawNative.selector, refundAddress, recipient)
            );
        }

        refundToken = address(0);
    }

    function receiveAndWithdrawNative(address payable refundAddress, address payable recipient) external {
        if (address(this).balance > 0) refundAddress.transfer(address(this).balance);

        address wrappedTokenAddress = wrappedToken();
        address refund = AxelarDepositService(msg.sender).refundToken();
        if (refund != address(0)) {
            if (refund == wrappedTokenAddress) return;
            IERC20(refund).transfer(refundAddress, IERC20(refund).balanceOf(address(this)));
            return;
        }

        uint256 amount = IERC20(wrappedTokenAddress).balanceOf(address(this));

        if (amount == 0) revert NothingDeposited();

        IWETH9(wrappedTokenAddress).withdraw(amount);
        recipient.transfer(amount);
    }

    function wrappedToken() public view returns (address) {
        return IAxelarGateway(gateway).tokenAddresses(wrappedSymbol());
    }

    function wrappedSymbol() public view returns (string memory symbol) {
        bytes32 symbolData = wrappedSymbolBytes;

        // recovering string length as the last byte of the data
        uint256 length = 0xff & uint256(symbolData);

        // restoring the string with the correct length
        assembly {
            symbol := mload(0x40)
            // new "memory end" including padding (the string isn't larger than 32 bytes)
            mstore(0x40, add(symbol, 0x40))
            // store length in memory
            mstore(symbol, length)
            // write actual data
            mstore(add(symbol, 0x20), symbolData)
        }
    }

    function _depositAddress(bytes32 create2Salt, bytes memory delegateData) internal view returns (address) {
        /* Convert a hash which is bytes32 to an address which is 20-byte long
        according to https://docs.soliditylang.org/en/v0.8.1/control-structures.html?highlight=create2#salted-contract-creations-create2 */
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                create2Salt,
                                keccak256(abi.encodePacked(type(DepositReceiver).creationCode, abi.encode(delegateData)))
                            )
                        )
                    )
                )
            );
    }

    function contractId() public pure returns (bytes32) {
        return keccak256('axelar-deposit-service');
    }
}
