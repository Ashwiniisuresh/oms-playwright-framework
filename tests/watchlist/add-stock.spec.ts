import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';

import { OtpPage } from '../../pages/OtpPage';

import { WatchlistPage } from '../../pages/WatchlistPage';

import { users } from '../../fixtures/users';

test('Add Stock To Watchlist', async ({ page }) => {

    const watchlistPage = new WatchlistPage(page);

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    const watchlistName = `growth-${Math.floor(1000 + Math.random() * 9000)}`;

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

    // Validate Stock Added
    await watchlistPage.validateStockAdded('1030');
});