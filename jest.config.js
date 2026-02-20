module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    collectCoverageFrom: [
        'app/**/*.ts',
        '!app/**/*.d.ts',
        '!app/**/*.test.ts',
    ],
    coverageDirectory: 'coverage',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json'
        }]
    },
    testTimeout: 30000,
};
