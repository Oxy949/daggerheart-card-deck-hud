const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.cjs',
    fullyParallel: true,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 1280, height: 800 },
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node tests/server.cjs',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI
    }
});
