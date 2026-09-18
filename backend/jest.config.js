module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/testEnv.js'],
  testTimeout: 15000,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'validators/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
};
