import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        globalSetup: ['./tests/helpers/globalSetup.js'],
        setupFiles: ['./tests/helpers/setup.js'],
        include: ['tests/**/*.test.js'],
        testTimeout: 20000,
        hookTimeout: 120000,
        // En Windows (Node 24) los workers en paralelo mueren a veces con 0xC0000409
        // (3221226505) sin fallar ningún test. En serie no ocurre (~40 s en vez de ~15 s).
        // En Linux/CI se mantiene el paralelo.
        fileParallelism: process.platform !== 'win32',
    },
})
