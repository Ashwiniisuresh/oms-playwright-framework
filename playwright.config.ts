import { defineConfig } from '@playwright/test';

export default defineConfig({

  testDir: './tests',

  timeout: 60000,

  workers: 1,

  fullyParallel: false,

  use: {

    baseURL: 'https://api.cse.com.sa/oms-channel/',

    browserName: 'chromium',

    headless: false,

    screenshot: 'only-on-failure',

    video: 'retain-on-failure',

    trace: 'retain-on-failure'
  }
});