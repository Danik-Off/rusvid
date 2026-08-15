module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
