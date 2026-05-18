import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';

import { users } from '../../fixtures/users';

test('Buy Limit Order', async ({ page }) => {

    test.setTimeout(120000);

    const watchlistPage = new WatchlistPage(page);

    const buyOrderPage = new BuyOrderPage(page);

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    const watchlistName = `wl-limit-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create unique watchlist
    await watchlistPage.createWatchlist(watchlistName);

    // Select watchlist
    await watchlistPage.selectWatchlist(watchlistName);

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
    await watchlistPage.selectWatchlist(watchlistName);

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

    // Enter Quantity
    await buyOrderPage
        .enterQuantity('10');

    // Enter Price
    await buyOrderPage
        .enterPrice('2.70');

    // Place Order
    await buyOrderPage
        .placeBuyOrder();
});