import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';

import { users } from '../../fixtures/users';

test('Open Buy Window', async ({ page }) => {

    const watchlistPage = new WatchlistPage(page);

    const buyOrderPage = new BuyOrderPage(page);

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    const watchlistName = `wl-window-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create unique watchlist
    await watchlistPage.createWatchlist(watchlistName);

    // Select Watchlist
    await watchlistPage.selectWatchlist(watchlistName);

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