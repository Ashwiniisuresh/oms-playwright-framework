import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  
  // Shared options for all projects
  use: {
    baseURL: 'https://api.cse.com.sa/oms-channel/',
    browserName: 'chromium',
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  
  projects: [
    // Project to run authentication setup first
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Main test project utilizing the saved authentication state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Load the shared login session state
        storageState: 'playwright/.auth/user.json',
      },
      // Ensure the authentication runs before functional tests
      dependencies: ['setup'],
    },
  ],
});