module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/utils/initDatabase.js' // Excluir inicialización
  ],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000, // 10 segundos para queries de BD
  verbose: true,
  // Forzar salida después de los tests
  forceExit: true,
  // Detectar handles abiertos pero no fallar por ellos
  detectOpenHandles: false
};
