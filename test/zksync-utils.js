'use strict';

const { ethers } = require('hardhat');
const { expect } = require('chai');

/**
 * zkSync-specific utility functions for event checking
 *
 * zkSync bootloader (0x0000000000000000000000000000000000008001) adds fee/refund events
 * that shift event indices in transaction receipts. This causes .to.emit() assertions to fail
 * because they expect events at specific positions.
 *
 * These utilities check for events at any index rather than specific positions.
 */

/**
 * Check if a specific event was emitted at any index in the transaction receipt
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to look for
 * @param {string} contractAddress - Address of the contract that should emit the event
 * @returns {Object|null} - The event object if found, null otherwise
 */
function findEvent(receipt, eventName, contractAddress = null) {
    const events = receipt.events || [];
    const filteredEvents = events.filter((e) => {
        const nameMatch = e.event === eventName;
        const addressMatch = contractAddress ? e.address === contractAddress : true;
        return nameMatch && addressMatch;
    });

    return filteredEvents.length > 0 ? filteredEvents[0] : null;
}

/**
 * Check if a specific event was emitted with specific arguments at any index
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to look for
 * @param {Array} expectedArgs - Expected arguments for the event
 * @param {string} contractAddress - Address of the contract that should emit the event
 * @returns {Object|null} - The event object if found, null otherwise
 */
function findEventWithArgs(receipt, eventName, expectedArgs, contractAddress = null) {
    const events = receipt.events || [];
    const filteredEvents = events.filter((e) => {
        const nameMatch = e.event === eventName;
        const addressMatch = contractAddress ? e.address === contractAddress : true;

        if (!nameMatch || !addressMatch) return false;

        // Check if all expected arguments match
        if (!e.args || e.args.length < expectedArgs.length) return false;

        for (let i = 0; i < expectedArgs.length; i++) {
            if (expectedArgs[i] !== undefined) {
                // Handle both BigNumber and regular values
                const actual = e.args[i];
                const expected = expectedArgs[i];

                if (actual.eq && expected.eq) {
                    // Both are BigNumbers
                    if (!actual.eq(expected)) return false;
                } else if (actual.eq) {
                    // Actual is BigNumber, expected is not
                    if (!actual.eq(expected)) return false;
                } else if (expected.eq) {
                    // Expected is BigNumber, actual is not
                    if (!expected.eq(actual)) return false;
                } else {
                    // Both are regular values
                    if (actual !== expected) return false;
                }
            }
        }

        return true;
    });

    return filteredEvents.length > 0 ? filteredEvents[0] : null;
}

/**
 * Check if a Transfer event was emitted with specific parameters
 * Handles manual parsing for zkSync where ethers.js doesn't parse Transfer events correctly
 * @param {Object} receipt - Transaction receipt
 * @param {string} tokenAddress - Address of the token contract
 * @param {string} from - Expected 'from' address
 * @param {string} to - Expected 'to' address
 * @param {string|number} amount - Expected amount
 * @returns {Object|null} - The event object if found, null otherwise
 */
function findTransferEvent(receipt, tokenAddress, from, to, amount) {
    const events = receipt.events || [];

    // Transfer event signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    const transferEvents = events.filter((e) => {
        return (
            e.address === tokenAddress && e.topics && e.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );
    });

    return transferEvents.find((e) => {
        const eventFrom = '0x' + e.topics[1].slice(26);
        const eventTo = '0x' + e.topics[2].slice(26);
        const eventAmount = ethers.BigNumber.from(e.data);

        return eventFrom.toLowerCase() === from.toLowerCase() && eventTo.toLowerCase() === to.toLowerCase() && eventAmount.eq(amount);
    });
}

/**
 * Assert that a specific event was emitted at any index
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to look for
 * @param {string} contractAddress - Address of the contract that should emit the event
 * @param {string} message - Optional error message
 */
function expectEventEmitted(receipt, eventName, contractAddress = null, message = null) {
    const event = findEvent(receipt, eventName, contractAddress);
    const errorMsg = message || `Expected event "${eventName}" to be emitted`;
    expect(event, errorMsg).to.not.be.null;
}

/**
 * Assert that a specific event was emitted with specific arguments at any index
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to look for
 * @param {Array} expectedArgs - Expected arguments for the event
 * @param {string} contractAddress - Address of the contract that should emit the event
 * @param {string} message - Optional error message
 */
function expectEventEmittedWithArgs(receipt, eventName, expectedArgs, contractAddress = null, message = null) {
    const event = findEventWithArgs(receipt, eventName, expectedArgs, contractAddress);
    const errorMsg = message || `Expected event "${eventName}" to be emitted with specified arguments`;
    expect(event, errorMsg).to.not.be.null;
}

/**
 * Assert that a Transfer event was emitted with specific parameters
 * @param {Object} receipt - Transaction receipt
 * @param {string} tokenAddress - Address of the token contract
 * @param {string} from - Expected 'from' address
 * @param {string} to - Expected 'to' address
 * @param {string|number} amount - Expected amount
 * @param {string} message - Optional error message
 */
function expectTransferEvent(receipt, tokenAddress, from, to, amount, message = null) {
    const event = findTransferEvent(receipt, tokenAddress, from, to, amount);
    const errorMsg = message || `Expected Transfer event from ${from} to ${to} with amount ${amount}`;
    expect(event, errorMsg).to.not.be.null;
}

/**
 * Assert that an event was NOT emitted
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to check for
 * @param {string} contractAddress - Address of the contract that should not emit the event
 * @param {string} message - Optional error message
 */
function expectEventNotEmitted(receipt, eventName, contractAddress = null, message = null) {
    const event = findEvent(receipt, eventName, contractAddress);
    const errorMsg = message || `Expected event "${eventName}" to NOT be emitted`;
    expect(event, errorMsg).to.be.null;
}

/**
 * Get all events of a specific type from a transaction receipt
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to look for
 * @param {string} contractAddress - Address of the contract that should emit the event
 * @returns {Array} - Array of event objects
 */
function getAllEvents(receipt, eventName, contractAddress = null) {
    const events = receipt.events || [];
    return events.filter((e) => {
        const nameMatch = e.event === eventName;
        const addressMatch = contractAddress ? e.address === contractAddress : true;
        return nameMatch && addressMatch;
    });
}

/**
 * Check if we're running on zkSync network
 * @returns {boolean} - True if running on zkSync
 */
function isZkSync() {
    const { network } = require('hardhat');
    return network.name === 'zksync';
}

module.exports = {
    findEvent,
    findEventWithArgs,
    findTransferEvent,
    expectEventEmitted,
    expectEventEmittedWithArgs,
    expectTransferEvent,
    expectEventNotEmitted,
    getAllEvents,
    isZkSync,
};
