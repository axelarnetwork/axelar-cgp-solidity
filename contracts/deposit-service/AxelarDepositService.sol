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
    bytes32 internal constant _WRAPPED_TOKEN_SYMBOL_SLOT = 0x91d2f5305ae2a8f5b319f6c3a690eff002c3e572220774ba5f7e957f079e55df;

    bytes32 internal constant PREFIX_DEPOSIT_SEND_TOKEN = keccak256('deposit-send-token');
    bytes32 internal constant PREFIX_DEPOSIT_SEND_NATIVE = keccak256('deposit-send-native');
    bytes32 internal constant PREFIX_DEPOSIT_WITHDRAW_NATIVE = keccak256('deposit-withdraw-native');

    function depositAddressForSendToken(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address) {
        return _depositAddress(keccak256(abi.encode(PREFIX_DEPOSIT_SEND_TOKEN, salt, destinationChain, destinationAddress, tokenSymbol)));
    }

    function depositAddressForSendNative(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address) {
        return _depositAddress(keccak256(abi.encode(PREFIX_DEPOSIT_SEND_NATIVE, salt, destinationChain, destinationAddress)));
    }

    function depositAddressForWithdrawNative(bytes32 nonce, address recipient) external view returns (address) {
        return _depositAddress(keccak256(abi.encode(PREFIX_DEPOSIT_WITHDRAW_NATIVE, nonce, recipient)));
    }

    function sendToken(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external {
        address gatewayAddress = gateway();
        address tokenAddress = IAxelarGateway(gatewayAddress).tokenAddresses(tokenSymbol);

        DepositReceiver depositReceiver = new DepositReceiver{
            salt: keccak256(abi.encode(PREFIX_DEPOSIT_SEND_TOKEN, salt, destinationChain, destinationAddress, tokenSymbol))
        }();

        uint256 amount = IERC20(tokenAddress).balanceOf(address(depositReceiver));

        if (amount == 0) revert NothingDeposited();

        if (!_execute(depositReceiver, tokenAddress, 0, abi.encodeWithSelector(IERC20.approve.selector, gatewayAddress, amount)))
            revert ApproveFailed();

        bytes memory sendPayload = abi.encodeWithSelector(
            IAxelarGateway.sendToken.selector,
            destinationChain,
            destinationAddress,
            tokenSymbol,
            amount
        );

        if (!_execute(depositReceiver, gatewayAddress, 0, sendPayload)) revert TokenSendFailed();

        // NOTE: `depositReceiver` must always be destroyed in the same runtime context that it is deployed.
        depositReceiver.destroy(address(this));
    }

    function sendNative(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external {
        DepositReceiver depositReceiver = new DepositReceiver{
            salt: keccak256(abi.encode(PREFIX_DEPOSIT_SEND_NATIVE, salt, destinationChain, destinationAddress))
        }();

        uint256 amount = address(depositReceiver).balance;

        if (amount == 0) revert NothingDeposited();

        address gatewayAddress = gateway();
        string memory symbol = wrappedSymbol();
        address wrappedTokenAddress = IAxelarGateway(gatewayAddress).tokenAddresses(symbol);

        if (!_execute(depositReceiver, wrappedTokenAddress, amount, abi.encodeWithSelector(IWETH9.deposit.selector))) revert WrapFailed();

        if (!_execute(depositReceiver, wrappedTokenAddress, 0, abi.encodeWithSelector(IERC20.approve.selector, gatewayAddress, amount)))
            revert ApproveFailed();

        bytes memory sendPayload = abi.encodeWithSelector(
            IAxelarGateway.sendToken.selector,
            destinationChain,
            destinationAddress,
            symbol,
            amount
        );

        if (!_execute(depositReceiver, gatewayAddress, 0, sendPayload)) revert TokenSendFailed();

        // NOTE: `depositReceiver` must always be destroyed in the same runtime context that it is deployed.
        depositReceiver.destroy(address(this));
    }

    function withdrawNative(bytes32 salt, address payable recipient) external {
        address token = wrappedToken();

        DepositReceiver depositReceiver = new DepositReceiver{
            salt: keccak256(abi.encode(PREFIX_DEPOSIT_WITHDRAW_NATIVE, salt, recipient))
        }();
        uint256 amount = IERC20(token).balanceOf(address(depositReceiver));

        if (amount == 0) revert NothingDeposited();

        if (!_execute(depositReceiver, token, 0, abi.encodeWithSelector(IWETH9.withdraw.selector, amount))) revert UnwrapFailed();

        // NOTE: `depositReceiver` must always be destroyed in the same runtime context that it is deployed.
        depositReceiver.destroy(recipient);
    }

    function gateway() public view returns (address gatewayAddress) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            gatewayAddress := sload(_GATEWAY_SLOT)
        }
    }

    function wrappedToken() public view returns (address) {
        return IAxelarGateway(gateway()).tokenAddresses(wrappedSymbol());
    }

    function wrappedSymbol() public view returns (string memory symbol) {
        bytes32 symbolData;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            symbolData := sload(_WRAPPED_TOKEN_SYMBOL_SLOT)
        }

        // recovering string length as the last 2 bytes of the data
        uint256 length = 0xff & uint256(symbolData);

        // restoring the string with the correct length
        // solhint-disable-next-line no-inline-assembly
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

    function _depositAddress(bytes32 create2Salt) internal view returns (address) {
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
                                keccak256(abi.encodePacked(type(DepositReceiver).creationCode))
                            )
                        )
                    )
                )
            );
    }

    function _execute(
        DepositReceiver depositReceiver,
        address callee,
        uint256 nativeValue,
        bytes memory payload
    ) internal returns (bool) {
        (bool success, bytes memory returnData) = depositReceiver.execute(callee, nativeValue, payload);
        return success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));
    }

    function contractId() public pure returns (bytes32) {
        return keccak256('axelar-deposit-service');
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

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(_GATEWAY_SLOT, gatewayAddress)
            sstore(_WRAPPED_TOKEN_SYMBOL_SLOT, symbolData)
        }
    }
}
