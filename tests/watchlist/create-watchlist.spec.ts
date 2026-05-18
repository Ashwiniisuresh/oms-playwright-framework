import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';

import { OtpPage } from '../../pages/OtpPage';

import { WatchlistPage } from '../../pages/WatchlistPage';

import { users } from '../../fixtures/users';

test('Create Watchlist', async ({ page }) => {

    const watchlistPage = new WatchlistPage(page);

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    await watchlistPage.validateWatchlistPageLoaded();

    const watchlistName = `add-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create Watchlist
    await watchlistPage.createWatchlist(watchlistName);

    // Validate Watchlist
    await watchlistPage.validateWatchlistCreated(watchlistName);
});