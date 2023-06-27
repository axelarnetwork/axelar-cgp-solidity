module.exports = {
    skipFiles: ['test', 'Timelock.sol'],
    mocha: {
        grep: '@skip-on-coverage', // Add to test description to skip coverage from being run some tests, such as bytecode checks
        invert: true,
    },
};
