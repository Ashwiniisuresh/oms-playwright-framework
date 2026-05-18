import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';

import { users } from '../../fixtures/users';

test('Buy Limit Order', async ({ page }) => {

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
    await watchlistPage.createWatchlist('wl-limit');

    // Select watchlist
    await watchlistPage.selectWatchlist('wl-limit');

    // Search stock
    await watchlistPage.searchStock('1010');

    // Select stock
    await watchlistPage.selectStock('Riyad Bank');

    // Add stock
    await watchlistPage.addStock();



    // Open Market
    await page.getByRole('link', {
        name: 'Market'
    }).click();

    // Back to Watchlist
    await page.getByRole('link', {
        name: 'Watchlist'
    }).click();

    // Wait for watchlist page to load
    await watchlistPage.validateWatchlistPageLoaded();

    // Select watchlist again since navigating away resets the active tab
    await watchlistPage.selectWatchlist('wl-limit');

    // Open Buy Window
    await watchlistPage.openBuyWindow();

    // Validate Popup
    await buyOrderPage
        .validateBuyWindowOpened();

    // Portfolio
    await buyOrderPage
        .selectPortfolio('-1-AshwiniPF');

    // Limit Order
    await buyOrderPage
        .selectLimitOrder();

    // Enter Price
    await buyOrderPage
        .enterPrice('2.70');

    // Place Order
    await buyOrderPage
        .placeBuyOrder();
});