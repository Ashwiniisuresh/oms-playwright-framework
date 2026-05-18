import { test, expect } from '@playwright/test';

import { LoginPage } from '../pages/LoginPage';

import { OtpPage } from '../pages/OtpPage';

import { loginFlow } from '../utils/loginHelper';

test.use({ storageState: { cookies: [], origins: [] } });

test('Valid Login Test', async ({ page }) => {

    const loginPage = new LoginPage(page);

    const otpPage = new OtpPage(page);

    await loginFlow(
        loginPage,
        otpPage
    );

    await expect(page)
        .toHaveURL(/\/home\/chart/);
});