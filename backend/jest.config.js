// ─────────────────────────────────────────────────────────────────────────────
// jest.config.js — backend test runner configuration
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.js'],

  // One mongod for the whole run; each worker gets its own database.
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',

  // Order matters: testEnv runs before any application module is required, so
  // config/env.js sees its required variables. afterEnv needs the framework
  // globals (beforeAll/afterEach) to already exist.
  setupFiles: ['<rootDir>/tests/setup/testEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEnv.js'],

  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    'config/permissions.js',
    // Excluded deliberately:
    //   config/db.js       — calls process.exit() on failure; the suite never
    //                        connects through it (see tests/globalSetup.js).
    //   seeders/**         — one-off scripts, not request-path code.
    //   server.js, app.js  — app.js is exercised through supertest but has no
    //                        branches worth measuring; server.js binds a port.
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // Serialised on purpose. Every request in the suite arrives from the same
  // loopback IP, and the rate limiters are per-IP module singletons shared by
  // the whole process — parallel workers would interleave their counters and
  // produce 429s that belong to a different test file.
  maxWorkers: 1,

  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  forceExit: false,
  detectOpenHandles: false,
};
