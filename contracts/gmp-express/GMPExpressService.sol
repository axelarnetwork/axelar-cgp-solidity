// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { Upgradable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradable/Upgradable.sol';
import { IExpressExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IExpressExecutable.sol';
import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { ExpressExecutableProxy } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/ExpressExecutableProxy.sol';
import { AddressToString, StringToAddress } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/AddressString.sol';
import { IGMPExpressService } from '../interfaces/IGMPExpressService.sol';
import { IAxelarGasService } from '../interfaces/IAxelarGasService.sol';
import { IERC20 } from '../interfaces/IERC20.sol';

contract GMPExpressService is Upgradable, AxelarExecutable, IGMPExpressService {
    using AddressToString for address;
    using StringToAddress for string;

    enum Command {
        DeployExpressExecutable
    }

    IAxelarGasService public immutable gasService;
    address public immutable expressOperator;
    address public immutable serviceProxy;
    bytes32 public immutable expressProxyCodeHash;
    bytes32 public immutable currentChainHash;

    // keccak256('expressCall');
    uint256 public constant PREFIX_EXPRESS_CALL = 0xb69cf1f8825a92733483adddaad491ac8f187461114a82800cd710f02221879c;
    // keccak256('expressCallWithToken');
    uint256 public constant PREFIX_EXPRESS_CALL_WITH_TOKEN = 0xb6e1623c5ea036036acb68a60ec2e4e88041d19595383b291882990df411b4dd;

    constructor(
        address gateway_,
        address gasService_,
        address expressOperator_,
        address serviceProxy_,
        string memory currentChain
    ) AxelarExecutable(gateway_) {
        if (gasService_ == address(0)) revert InvalidAddress();
        if (expressOperator_ == address(0)) revert InvalidOperator();

        gasService = IAxelarGasService(gasService_);
        expressOperator = expressOperator_;
        serviceProxy = serviceProxy_;
        expressProxyCodeHash = address(new ExpressExecutableProxy(serviceProxy, gateway_)).codehash;
        currentChainHash = keccak256(bytes(currentChain));
    }

    modifier onlyOperator() {
        if (msg.sender != expressOperator) revert NotOperator();

        _;
    }

    function call(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes calldata payload
    ) external onlyOperator {
        if (contractAddress == address(0)) revert InvalidContractAddress();

        if (commandId != bytes32(0) && gateway.isCommandExecuted(commandId)) {
            IExpressExecutable(contractAddress).execute(commandId, sourceChain, sourceAddress, payload);
        } else {
            bytes32 payloadHash = keccak256(payload);
            (bytes32 slot, uint256 count) = _getExpressCall(sourceChain, sourceAddress, contractAddress, payloadHash);

            if (contractAddress.codehash != expressProxyCodeHash) revert NotExpressProxy();

            _setExpressCall(slot, count + 1);

            IExpressExecutable(contractAddress).expressExecute(sourceChain, sourceAddress, payload);

            emit ExpressCall(sourceChain, sourceAddress, contractAddress, payloadHash);
        }
    }

    function callWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) external onlyOperator {
        if (contractAddress == address(0)) revert InvalidContractAddress();

        if (commandId != bytes32(0) && gateway.isCommandExecuted(commandId)) {
            IExpressExecutable(contractAddress).executeWithToken(commandId, sourceChain, sourceAddress, payload, tokenSymbol, amount);
        } else {
            bytes32 payloadHash = keccak256(payload);
            address token = gateway.tokenAddresses(tokenSymbol);
            (bytes32 slot, uint256 count) = _getExpressCallWithToken(
                sourceChain,
                sourceAddress,
                contractAddress,
                payloadHash,
                tokenSymbol,
                amount
            );

            if (contractAddress.codehash != expressProxyCodeHash) revert NotExpressProxy();
            if (token == address(0)) revert InvalidTokenSymbol();

            _setExpressCallWithToken(slot, count + 1);
            _safeTransfer(token, contractAddress, amount);

            IExpressExecutable(contractAddress).expressExecuteWithToken(sourceChain, sourceAddress, payload, tokenSymbol, amount);

            emit ExpressCallWithToken(sourceChain, sourceAddress, contractAddress, payloadHash, tokenSymbol, amount);
        }
    }

    function getPendingExpressCallCount(
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) external view returns (uint256 count) {
        (, count) = _getExpressCall(sourceChain, sourceAddress, contractAddress, payloadHash);
    }

    function getPendingExpressCallWithTokenCount(
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        string calldata tokenSymbol,
        uint256 amount
    ) external view returns (uint256 count) {
        (, count) = _getExpressCallWithToken(sourceChain, sourceAddress, contractAddress, payloadHash, tokenSymbol, amount);
    }

    function completeCall(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes32 payloadHash
    ) external returns (bool expressCalled) {
        (bytes32 slot, uint256 count) = _getExpressCall(sourceChain, sourceAddress, msg.sender, payloadHash);
        expressCalled = count != 0;

        if (expressCalled) {
            _setExpressCall(slot, count - 1);

            emit ExpressCallCompleted(sourceChain, sourceAddress, msg.sender, payloadHash);
        }
    }

    function completeCallWithToken(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes32 payloadHash,
        string calldata tokenSymbol,
        uint256 amount
    ) external returns (bool expressCalled) {
        (bytes32 slot, uint256 count) = _getExpressCallWithToken(sourceChain, sourceAddress, msg.sender, payloadHash, tokenSymbol, amount);
        expressCalled = count != 0;

        if (expressCalled) {
            _setExpressCallWithToken(slot, count - 1);

            emit ExpressCallWithTokenCompleted(sourceChain, sourceAddress, msg.sender, payloadHash, tokenSymbol, amount);
        }
    }

    function deployedProxyAddress(bytes32 salt, address sender) external view returns (address deployedAddress_) {
        bytes32 deploySalt = keccak256(abi.encode(sender, salt));
        deployedAddress_ = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff',
                            address(this),
                            deploySalt,
                            keccak256(abi.encodePacked(type(ExpressExecutableProxy).creationCode, abi.encode(serviceProxy, address(0))))
                        )
                    )
                )
            )
        );
    }

    function deployExpressProxy(
        bytes32 salt,
        address implementationAddress,
        address owner,
        bytes calldata setupParams
    ) external returns (address) {
        bytes32 deploySalt = keccak256(abi.encode(msg.sender, salt));
        return _deployExpressProxy(deploySalt, implementationAddress, owner, setupParams);
    }

    function deployExpressExecutable(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams
    ) external returns (address) {
        bytes32 deploySalt = keccak256(abi.encode(msg.sender, salt));
        return _deployExpressExecutable(deploySalt, implementationBytecode, owner, setupParams);
    }

    function deployExpressExecutableOnChains(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams,
        string[] calldata destinationChains,
        uint256[] calldata gasPayments,
        address gasRefundAddress
    ) external {
        bytes32 deploySalt = keccak256(abi.encode(msg.sender, salt));
        uint256 length = destinationChains.length;

        if (implementationBytecode.length == 0) revert EmptyBytecode();
        if (length != gasPayments.length) revert WrongGasAmounts();

        for (uint256 i; i < length; ++i) {
            _deployExpressExecutableOnChain(
                deploySalt,
                implementationBytecode,
                owner,
                setupParams,
                destinationChains[i],
                gasPayments[i],
                gasRefundAddress
            );
        }
    }

    function withdraw(
        address payable receiver,
        address token,
        uint256 amount
    ) external onlyOperator {
        if (receiver == address(0)) revert InvalidAddress();

        if (token == address(0)) {
            receiver.transfer(amount);
        } else {
            _safeTransfer(token, receiver, amount);
        }
    }

    /// @notice GMPExpressService is AxelarExecutable itself to support cross-chain deployments
    function _execute(
        string calldata,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        if (sourceAddress.toAddress() != address(this)) return;

        (Command command, bytes32 deploySalt, bytes memory implementationBytecode, address owner, bytes memory setupParams) = abi.decode(
            payload,
            (Command, bytes32, bytes, address, bytes)
        );

        if (command == Command.DeployExpressExecutable) _deployExpressExecutable(deploySalt, implementationBytecode, owner, setupParams);
    }

    function _getExpressCall(
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash
    ) internal view returns (bytes32 slot, uint256 count) {
        slot = keccak256(abi.encode(PREFIX_EXPRESS_CALL, sourceChain, sourceAddress, contractAddress, payloadHash));
        // solhint-disable-next-line no-inline-assembly
        assembly {
            count := sload(slot)
        }
    }

    function _setExpressCall(bytes32 slot, uint256 count) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, count)
        }
    }

    function _getExpressCallWithToken(
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes32 payloadHash,
        string calldata symbol,
        uint256 amount
    ) internal view returns (bytes32 slot, uint256 count) {
        slot = keccak256(
            abi.encode(PREFIX_EXPRESS_CALL_WITH_TOKEN, sourceChain, sourceAddress, contractAddress, payloadHash, symbol, amount)
        );
        // solhint-disable-next-line no-inline-assembly
        assembly {
            count := sload(slot)
        }
    }

    function _setExpressCallWithToken(bytes32 slot, uint256 count) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, count)
        }
    }

    function _deployExpressProxy(
        bytes32 deploySalt,
        address implementationAddress,
        address owner,
        bytes memory setupParams
    ) public returns (address) {
        // Passing address(0) for automatic gateway lookup. Allows to have the same proxy address across chains
        ExpressExecutableProxy proxy = new ExpressExecutableProxy{ salt: deploySalt }(serviceProxy, address(0));

        proxy.init(implementationAddress, owner, setupParams);

        return address(proxy);
    }

    function _deployExpressExecutable(
        bytes32 deploySalt,
        bytes memory implementationBytecode,
        address owner,
        bytes memory setupParams
    ) internal returns (address) {
        if (implementationBytecode.length == 0) revert EmptyBytecode();

        address implementation;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            implementation := create2(0, add(implementationBytecode, 32), mload(implementationBytecode), deploySalt)
        }

        if (implementation == address(0)) revert FailedDeploy();

        return _deployExpressProxy(deploySalt, implementation, owner, setupParams);
    }

    function _deployExpressExecutableOnChain(
        bytes32 deploySalt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams,
        string calldata destinationChain,
        uint256 gasPayment,
        address gasRefundAddress
    ) internal {
        if (keccak256(bytes(destinationChain)) == currentChainHash)
            _deployExpressExecutable(deploySalt, implementationBytecode, owner, setupParams);
        else {
            string memory thisAddress = address(this).toString();
            bytes memory payload = abi.encode(Command.DeployExpressExecutable, deploySalt, implementationBytecode, owner, setupParams);

            if (gasPayment > 0) {
                gasService.payNativeGasForContractCall{ value: gasPayment }(
                    address(this),
                    destinationChain,
                    thisAddress,
                    payload,
                    gasRefundAddress
                );
            }

            gateway.callContract(destinationChain, address(this).toString(), payload);
        }
    }

    function _safeTransfer(
        address tokenAddress,
        address receiver,
        uint256 amount
    ) internal {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returnData) = tokenAddress.call(abi.encodeWithSelector(IERC20.transfer.selector, receiver, amount));
        bool transferred = success && (returnData.length == uint256(0) || abi.decode(returnData, (bool)));

        if (!transferred || tokenAddress.code.length == 0) revert TransferFailed();
    }

    function contractId() external pure returns (bytes32) {
        return keccak256('axelar-gmp-express-service');
    }
}
