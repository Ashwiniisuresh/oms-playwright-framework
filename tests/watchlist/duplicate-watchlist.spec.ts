import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';

import { OtpPage } from '../../pages/OtpPage';

import { WatchlistPage } from '../../pages/WatchlistPage';

import { users } from '../../fixtures/users';

test('Duplicate Watchlist Validation', async ({ page }) => {

    const watchlistPage = new WatchlistPage(page);

    const watchlistName = `wl-dup-${Math.floor(100 + Math.random() * 900)}`;

    // Watchlist
    await watchlistPage.gotoWatchlistPage();

    // First Creation
    await watchlistPage.createWatchlist(watchlistName);

    // Count Before
    const beforeCount =
        await watchlistPage.getWatchlistCount(
            watchlistName
        );

    // Try Duplicate Creation
    await watchlistPage.createWatchlist(watchlistName);

    // Count After
    const afterCount =
        await watchlistPage.getWatchlistCount(
            watchlistName
        );

    // Validation
    expect(afterCount).toBe(beforeCount);
});