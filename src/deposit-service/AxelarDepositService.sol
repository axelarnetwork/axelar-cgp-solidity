// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarDepositService } from '../interfaces/IAxelarDepositService.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IERC20 } from '../interfaces/IERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';
import { Upgradable } from '../util/Upgradable.sol';
import { DepositHandler } from '../DepositHandler.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarDepositService is Upgradable, IAxelarDepositService {
    // keccak256('gateway-address')
    bytes32 internal constant _GATEWAY_SLOT = 0xf8e5d679403ca38329d1356aeb2f53b4e3a6e4b021834581c8be7443db16066f;
    // keccak256('wrapped-token-address')
    bytes32 internal constant _WRAPPED_TOKEN_SLOT = 0xf99806ed7f861e13d2c7230c9b9fc0214512600ad6d46d466caa9337155cb808;
    // keccak256('wrapped-token-symbol')
    bytes32 internal constant _TOKEN_SYMBOL_SLOT = 0x91d2f5305ae2a8f5b319f6c3a690eff002c3e572220774ba5f7e957f079e55df;

    bytes32 internal constant PREFIX_DEPOSIT_TOKEN_SEND = keccak256('deposit-token-send');
    bytes32 internal constant PREFIX_DEPOSIT_NATIVE_SEND = keccak256('deposit-native-send');
    bytes32 internal constant PREFIX_DEPOSIT_TOKEN_UNWRAP = keccak256('deposit-token-unwrap');

    function depositAddressForTokenSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress,
        string calldata tokenSymbol
    ) external view returns (address) {
        bytes32 salt = keccak256(
            abi.encode(PREFIX_DEPOSIT_TOKEN_SEND, destinationChain, destinationAddress, senderAddress, tokenSymbol)
        );
        return _depositAddress(salt);
    }

    function depositAddressForNativeSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress
    ) external view returns (address) {
        bytes32 salt = keccak256(
            abi.encode(PREFIX_DEPOSIT_NATIVE_SEND, destinationChain, destinationAddress, senderAddress)
        );
        return _depositAddress(salt);
    }

    function depositAddressForTokenUnwrap(address recipient, string calldata senderAddress)
        external
        view
        returns (address)
    {
        bytes32 salt = keccak256(abi.encode(PREFIX_DEPOSIT_TOKEN_UNWRAP, recipient, senderAddress));
        return _depositAddress(salt);
    }

    function handleTokenSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress,
        string calldata tokenSymbol,
        address tokenAddress
    ) external {
        DepositHandler depositHandler = new DepositHandler{
            salt: keccak256(
                abi.encode(PREFIX_DEPOSIT_TOKEN_SEND, destinationChain, destinationAddress, senderAddress, tokenSymbol)
            )
        }();
        uint256 amount = IERC20(tokenAddress).balanceOf(address(depositHandler));

        if (amount == 0) revert NothingDeposited();

        (bool success, bytes memory returnData) = depositHandler.execute(
            tokenAddress,
            abi.encodeWithSelector(IERC20.transfer.selector, address(this), amount)
        );

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        // NOTE: `depositHandler` must always be destroyed in the same runtime context that it is deployed.
        depositHandler.destroy(address(this));

        address gatewayAddress = gateway();

        IERC20(tokenAddress).approve(gatewayAddress, amount);
        IAxelarGateway(gatewayAddress).sendToken(destinationChain, destinationAddress, tokenSymbol, amount);
    }

    function handleNativeSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress
    ) external {
        uint256 oldBalance = address(this).balance;
        bytes32 salt = keccak256(
            abi.encode(PREFIX_DEPOSIT_NATIVE_SEND, destinationChain, destinationAddress, senderAddress)
        );

        DepositHandler depositHandler = new DepositHandler{ salt: salt }();
        // NOTE: `depositHandler` must always be destroyed in the same runtime context that it is deployed.
        depositHandler.destroy(address(this));

        uint256 amount = address(this).balance - oldBalance;

        if (amount == 0) revert NothingDeposited();

        address gatewayAddress = gateway();
        address token = wrappedToken();
        string memory symbol = wrappedSymbol();

        IWETH9(token).deposit{ value: amount }();
        IERC20(token).approve(gatewayAddress, amount);
        IAxelarGateway(gatewayAddress).sendToken(destinationChain, destinationAddress, symbol, amount);
    }

    function handleTokenUnwrap(address payable recipient, string calldata senderAddress) external {
        bytes32 salt = keccak256(abi.encode(PREFIX_DEPOSIT_TOKEN_UNWRAP, recipient, senderAddress));
        address token = wrappedToken();

        DepositHandler depositHandler = new DepositHandler{ salt: salt }();
        uint256 amount = IERC20(token).balanceOf(address(depositHandler));

        if (amount == 0) revert NothingDeposited();

        (bool success, bytes memory returnData) = depositHandler.execute(
            token,
            abi.encodeWithSelector(IERC20.transfer.selector, address(this), amount)
        );

        if (!success || (returnData.length != uint256(0) && !abi.decode(returnData, (bool)))) revert TransferFailed();

        // NOTE: `depositHandler` must always be destroyed in the same runtime context that it is deployed.
        depositHandler.destroy(address(this));

        IWETH9(token).withdraw(amount);
        recipient.transfer(amount);
    }

    function gateway() public view returns (address gatewayAddress) {
        assembly {
            gatewayAddress := sload(_GATEWAY_SLOT)
        }
    }

    function wrappedToken() public view returns (address token) {
        assembly {
            token := sload(_WRAPPED_TOKEN_SLOT)
        }
    }

    function wrappedSymbol() public view returns (string memory symbol) {
        bytes32 symbolData;

        assembly {
            symbolData := sload(_TOKEN_SYMBOL_SLOT)
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
                                keccak256(abi.encodePacked(type(DepositHandler).creationCode))
                            )
                        )
                    )
                )
            );
    }

    function _setup(bytes calldata data) internal override {
        (address gatewayAddress, address token, string memory symbol) = abi.decode(data, (address, address, string));

        if (gatewayAddress == address(0)) revert InvalidAddress();
        if (token == address(0)) revert InvalidAddress();

        bytes32 symbolData = bytes32(abi.encodePacked(symbol));
        uint256 symbolNumber = uint256(symbolData);

        // storing string length as last 2 bytes of the data
        symbolNumber |= 0xff & bytes(symbol).length;
        symbolData = bytes32(abi.encodePacked(symbolNumber));

        assembly {
            sstore(_GATEWAY_SLOT, gatewayAddress)
            sstore(_WRAPPED_TOKEN_SLOT, token)
            sstore(_TOKEN_SYMBOL_SLOT, symbolData)
        }
    }
}
