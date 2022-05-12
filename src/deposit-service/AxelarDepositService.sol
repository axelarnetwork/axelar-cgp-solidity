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
    // keccak256('gateway-address')
    bytes32 internal constant _GATEWAY_SLOT = 0xf8e5d679403ca38329d1356aeb2f53b4e3a6e4b021834581c8be7443db16066f;
    // keccak256('wrapped-token-symbol')
    bytes32 internal constant _WRAPPED_TOKEN_SYMBOL_SLOT =
        0x91d2f5305ae2a8f5b319f6c3a690eff002c3e572220774ba5f7e957f079e55df;

    bytes32 internal constant PREFIX_DEPOSIT_SEND_TOKEN = keccak256('deposit-send-token');
    bytes32 internal constant PREFIX_DEPOSIT_SEND_NATIVE = keccak256('deposit-send-native');
    bytes32 internal constant PREFIX_DEPOSIT_WITHDRAW_NATIVE = keccak256('deposit-withdraw-native');

    function depositAddressForSendToken(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address) {
        bytes32 salt = keccak256(
            abi.encode(PREFIX_DEPOSIT_SEND_TOKEN, nonce, destinationChain, destinationAddress, tokenSymbol)
        );
        return _depositAddress(salt);
    }

    function depositAddressForSendNative(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(PREFIX_DEPOSIT_SEND_NATIVE, nonce, destinationChain, destinationAddress));
        return _depositAddress(salt);
    }

    function depositAddressForWithdrawNative(bytes32 nonce, address recipient) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(PREFIX_DEPOSIT_WITHDRAW_NATIVE, nonce, recipient));
        return _depositAddress(salt);
    }

    function sendToken(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external {
        address gatewayAddress = gateway();
        address tokenAddress = IAxelarGateway(gatewayAddress).tokenAddresses(tokenSymbol);

        DepositReceiver depositReceiver = new DepositReceiver{
            salt: keccak256(
                abi.encode(PREFIX_DEPOSIT_SEND_TOKEN, nonce, destinationChain, destinationAddress, tokenSymbol)
            )
        }();

        uint256 amount = IERC20(tokenAddress).balanceOf(address(depositReceiver));

        if (amount == 0) revert NothingDeposited();

        (bool success, bytes memory returnData) = depositReceiver.execute(
            tokenAddress,
            0,
            abi.encodeWithSelector(IERC20.approve.selector, gatewayAddress, amount)
        );

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        bytes memory sendPayload = abi.encodeWithSelector(
            IAxelarGateway.sendToken.selector,
            destinationChain,
            destinationAddress,
            tokenSymbol,
            amount
        );

        (success, returnData) = depositReceiver.execute(gatewayAddress, 0, sendPayload);

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        // NOTE: `depositReceiver` must always be destroyed in the same runtime context that it is deployed.
        depositReceiver.destroy(address(this));
    }

    function sendNative(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        bytes32 salt = keccak256(abi.encode(PREFIX_DEPOSIT_SEND_NATIVE, nonce, destinationChain, destinationAddress));

        DepositReceiver depositReceiver = new DepositReceiver{ salt: salt }();

        uint256 amount = address(depositReceiver).balance;

        if (amount == 0) revert NothingDeposited();

        address gatewayAddress = gateway();
        string memory symbol = wrappedSymbol();
        address wrappedTokenAddress = IAxelarGateway(gatewayAddress).tokenAddresses(symbol);

        (bool success, bytes memory returnData) = depositReceiver.execute(
            wrappedTokenAddress,
            amount,
            abi.encodeWithSelector(IWETH9.deposit.selector)
        );

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        (success, returnData) = depositReceiver.execute(
            wrappedTokenAddress,
            0,
            abi.encodeWithSelector(IERC20.approve.selector, gatewayAddress, amount)
        );

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        bytes memory sendPayload = abi.encodeWithSelector(
            IAxelarGateway.sendToken.selector,
            destinationChain,
            destinationAddress,
            symbol,
            amount
        );

        (success, returnData) = depositReceiver.execute(gatewayAddress, 0, sendPayload);

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        // NOTE: `depositReceiver` must always be destroyed in the same runtime context that it is deployed.
        depositReceiver.destroy(address(this));
    }

    function withdrawNative(bytes32 nonce, address payable recipient) external {
        bytes32 salt = keccak256(abi.encode(PREFIX_DEPOSIT_WITHDRAW_NATIVE, nonce, recipient));
        address token = wrappedToken();

        DepositReceiver depositReceiver = new DepositReceiver{ salt: salt }();
        uint256 amount = IERC20(token).balanceOf(address(depositReceiver));

        if (amount == 0) revert NothingDeposited();

        (bool success, bytes memory returnData) = depositReceiver.execute(
            token,
            0,
            abi.encodeWithSelector(IWETH9.withdraw.selector, amount)
        );

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        // NOTE: `depositReceiver` must always be destroyed in the same runtime context that it is deployed.
        depositReceiver.destroy(recipient);
    }

    function gateway() public view returns (address gatewayAddress) {
        assembly {
            gatewayAddress := sload(_GATEWAY_SLOT)
        }
    }

    function wrappedToken() public view returns (address) {
        return IAxelarGateway(gateway()).tokenAddresses(wrappedSymbol());
    }

    function wrappedSymbol() public view returns (string memory symbol) {
        bytes32 symbolData;

        assembly {
            symbolData := sload(_WRAPPED_TOKEN_SYMBOL_SLOT)
        }

        // recovering string length as the last 2 bytes of the data
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

    function _depositAddress(bytes32 salt) internal view returns (address) {
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
                                salt,
                                keccak256(abi.encodePacked(type(DepositReceiver).creationCode))
                            )
                        )
                    )
                )
            );
    }

    function contractId() public pure returns (bytes32) {
        return keccak256(abi.encodePacked('axelar-deposit-service'));
    }

    function _setup(bytes calldata data) internal override {
        (address gatewayAddress, string memory symbol) = abi.decode(data, (address, string));

        if (gatewayAddress == address(0)) revert InvalidAddress();

        if (IAxelarGateway(gatewayAddress).tokenAddresses(symbol) == address(0)) revert InvalidSymbol();

        bytes memory symbolBytes = bytes(symbol);

        if (symbolBytes.length == 0 || symbolBytes.length > 30) revert InvalidSymbol();

        uint256 symbolNumber = uint256(bytes32(symbolBytes));

        // storing string length as last 2 bytes of the data
        symbolNumber |= 0xff & symbolBytes.length;
        bytes32 symbolData = bytes32(abi.encodePacked(symbolNumber));

        assembly {
            sstore(_GATEWAY_SLOT, gatewayAddress)
            sstore(_WRAPPED_TOKEN_SYMBOL_SLOT, symbolData)
        }
    }
}
