module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // .kilo/ holds a separate git worktree (a full copy of the app); never test or map it
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.kilo/', '<rootDir>/dist/', '<rootDir>/releases/'],
  modulePathIgnorePatterns: ['<rootDir>/.kilo/', '<rootDir>/dist/', '<rootDir>/releases/'],
  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/.kilo/'],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 4,
      lines: 10,
      statements: 10,
    },
  },
};
