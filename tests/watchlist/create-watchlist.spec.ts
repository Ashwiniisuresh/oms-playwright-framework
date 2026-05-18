import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';

import { OtpPage } from '../../pages/OtpPage';

import { WatchlistPage } from '../../pages/WatchlistPage';

import { users } from '../../fixtures/users';

test('Create Watchlist', async ({ page }) => {

    const loginPage = new LoginPage(page);

    const otpPage = new OtpPage(page);

    const watchlistPage = new WatchlistPage(page);

    // Login
    await loginPage.gotoLoginPage();

    await loginPage.login(
        users.validUser.username,
        users.validUser.password
    );

    // OTP
    await otpPage.validateOtpPageLoaded();

    await otpPage.enterOtp(users.validUser.otp);

    // Wait for login redirection to complete
    await expect(page).toHaveURL(/\/home\/chart/, { timeout: 15000 });

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    await watchlistPage.validateWatchlistPageLoaded();

    // Create Watchlist
    await watchlistPage.createWatchlist('add1');

    // Validate Watchlist
    await watchlistPage.validateWatchlistCreated('add1');
});