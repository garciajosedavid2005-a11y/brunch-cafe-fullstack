import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        globalSetup: ['./tests/helpers/globalSetup.js'],
        setupFiles: ['./tests/helpers/setup.js'],
        include: ['tests/**/*.test.js'],
        testTimeout: 20000,
        hookTimeout: 120000,
    },
})
