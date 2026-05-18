import { test as setup, expect } from '@playwright/test';

import { LoginPage } from '../pages/LoginPage';
import { OtpPage } from '../pages/OtpPage';
import { loginFlow } from '../utils/loginHelper';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {

    const loginPage = new LoginPage(page);
    const otpPage = new OtpPage(page);

    // Perform complete login sequence
    await loginFlow(loginPage, otpPage);

    // Validate login was successful
    await expect(page).toHaveURL(/\/home\/chart/, { timeout: 20000 });

    // Save session storage and cookies to auth file
    await page.context().storageState({ path: authFile });

    console.log('--- Global authentication completed successfully and saved to storageState ---');
});
