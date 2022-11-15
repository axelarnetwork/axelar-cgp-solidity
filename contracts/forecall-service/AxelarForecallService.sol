// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;
import { IAxelarForecallable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarForecallable.sol';
import { Upgradable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradables/Upgradable.sol';
import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { IAxelarForecallService } from '../interfaces/IAxelarForecallService.sol';
import { IERC20 } from '../interfaces/IERC20.sol';

// This should be owned by the microservice that is paying for gas.
contract AxelarForecallService is Upgradable, IAxelarForecallService {
    IAxelarGateway public immutable gateway;
    address public immutable forecallOperator;

    constructor(address gateway_, address forecallOperator_) {
        gateway = IAxelarGateway(gateway_);
        forecallOperator = forecallOperator_;
    }

    modifier onlyOperator() {
        if (msg.sender != forecallOperator) revert NotOperator();

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

        if (commandId == bytes32(0)) {
            IAxelarForecallable(contractAddress).forecall(sourceChain, sourceAddress, payload);
        } else {
            if (gateway.isCommandExecuted(commandId)) {
                bytes32 payloadHash = keccak256(payload);

                if (gateway.isContractCallApproved(commandId, sourceChain, sourceAddress, contractAddress, payloadHash)) {
                    IAxelarForecallable(contractAddress).execute(commandId, sourceChain, sourceAddress, payload);
                } else {
                    revert AlreadyExecuted();
                }
            } else {
                IAxelarForecallable(contractAddress).forecall(sourceChain, sourceAddress, payload);
            }
        }
    }

    function callWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes calldata payload,
        string calldata tokenSymbolA,
        uint256 amount
    ) external onlyOperator {
        if (contractAddress == address(0)) revert InvalidContractAddress();

        if (commandId == bytes32(0)) {
            IAxelarForecallable(contractAddress).forecallWithToken(sourceChain, sourceAddress, payload, tokenSymbolA, amount);
        } else {
            if (gateway.isCommandExecuted(commandId)) {
                bytes32 payloadHash = keccak256(payload);

                if (
                    gateway.isContractCallAndMintApproved(
                        commandId,
                        sourceChain,
                        sourceAddress,
                        contractAddress,
                        payloadHash,
                        tokenSymbolA,
                        amount
                    )
                ) {
                    IAxelarForecallable(contractAddress).executeWithToken(
                        commandId,
                        sourceChain,
                        sourceAddress,
                        payload,
                        tokenSymbolA,
                        amount
                    );
                } else {
                    revert AlreadyExecuted();
                }
            } else {
                IAxelarForecallable(contractAddress).forecallWithToken(sourceChain, sourceAddress, payload, tokenSymbolA, amount);
            }
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
        return keccak256('axelar-forecaller-service');
    }
}
