import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';

import { users } from '../../fixtures/users';

test('Open Buy Window', async ({ page }) => {

    const loginPage = new LoginPage(page);

    const otpPage = new OtpPage(page);

    const watchlistPage = new WatchlistPage(page);

    const buyOrderPage = new BuyOrderPage(page);

    // Login
    await loginPage.gotoLoginPage();

    await loginPage.login(
        users.validUser.username,
        users.validUser.password
    );

    // OTP
    await otpPage.validateOtpPageLoaded();

    await otpPage.enterOtp(
        users.validUser.otp
    );

    // Wait for login redirection to complete
    await expect(page).toHaveURL(/\/home\/chart/, { timeout: 15000 });

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    // Create unique watchlist
    await watchlistPage.createWatchlist('wl-window');

    // Select Watchlist
    await watchlistPage.selectWatchlist('wl-window');

    // Search Stock
    await watchlistPage.searchStock('1030');

    // Select Stock
    await watchlistPage.selectStock(
        'SAIB - Saudi Investment Bank'
    );

    // Add Stock
    await watchlistPage.addStock();

    // Open Buy Window
    await watchlistPage.openBuyWindow();

    // Validate Buy Window
    await buyOrderPage
        .validateBuyWindowOpened();
});