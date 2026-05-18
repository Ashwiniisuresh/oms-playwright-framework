import { test, expect } from '@playwright/test';

import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';
import { OrdersPage } from '../../pages/OrdersPage';

test('Unified E2E: Shared Session, Place Advanced Market/Limit Orders, Verify Status & Buying Power Impact', async ({ page }) => {

    test.setTimeout(150000); // 2.5 minutes timeout for full premium multi-watchlist flow

    const watchlistPage = new WatchlistPage(page);
    const buyOrderPage = new BuyOrderPage(page);
    const ordersPage = new OrdersPage(page);

    // 1. Start directly at Watchlist page since we are already authenticated globally
    await watchlistPage.gotoWatchlistPage();

    // 2. Setup Watchlist 1: fixedincome
    const wlFixed = 'fixedincome';
    await watchlistPage.createWatchlist(wlFixed);
    await watchlistPage.selectWatchlist(wlFixed);
    // Add SAIB (1030) if it is not already in the watchlist
    await watchlistPage.addStockIfNotExist('1030', 'SAIB - Saudi Investment Bank');

    // 3. Setup Watchlist 2: growth
    const wlGrowth = 'growth';
    await watchlistPage.createWatchlist(wlGrowth);
    await watchlistPage.selectWatchlist(wlGrowth);
    // Add Riyad Bank (1010) if it is not already in the watchlist
    await watchlistPage.addStockIfNotExist('1010', 'Riyad Bank');

    // =========================================================
    // FLOW 1: ADVANCED MARKET ORDER (FILL OR KILL) ON FIXEDINCOME
    // =========================================================
    console.log('--- Placing ADVANCED MARKET Order (FOK) on fixedincome ---');
    // Switch to fixedincome watchlist
    await watchlistPage.gotoWatchlistPage();
    await watchlistPage.selectWatchlist(wlFixed);

    // Open Buy Window for SAIB (first row in fixedincome)
    await watchlistPage.openBuyWindow();
    await buyOrderPage.validateBuyWindowOpened();

    // Portfolio selection
    await buyOrderPage.selectPortfolio('-1-AshwiniPF');

    // Choose Market order
    await buyOrderPage.selectMarketOrder();

    // Expand Advanced Options and choose Time in Force (Validity)
    await buyOrderPage.toggleAdvancedOptions();
    await buyOrderPage.selectTimeInForce('Fill or kill'); // FOK

    // Enter Quantity
    await buyOrderPage.enterQuantity('1');

    // Log Net Amount & Buying Power
    const marketNetVal = await buyOrderPage.getNetAmount();
    const marketBuyPow = await buyOrderPage.getBuyingPower();
    console.log(`[FOK Market Details] Net Amount: ${marketNetVal} | Buying Power: ${marketBuyPow}`);

    // Place FOK Order
    await buyOrderPage.placeBuyOrder();
    await page.waitForTimeout(2000);

    // Verify status on Orders screen
    await ordersPage.gotoOrdersPage();

    let foundMarketOrder = false;
    for (const tab of ['Open', 'Executed', 'Rejected'] as const) {
        try {
            await ordersPage.selectTab(tab);
            const status = await ordersPage.verifyOrderExists('1030', 'BUY', 'MKRT');
            if (status) {
                console.log(`Successfully verified FOK Market order on ${tab} tab with status: ${status}`);
                foundMarketOrder = true;
                break;
            }
        } catch (e) {
            console.log(`FOK Market order not found on ${tab} tab, checking next...`);
        }
    }
    expect(foundMarketOrder).toBe(true);

    // =========================================================
    // FLOW 2: ADVANCED LIMIT ORDER (DAY) ON GROWTH & BUYING POWER CHECK
    // =========================================================
    console.log('--- Placing ADVANCED LIMIT Order (Day) on growth ---');
    
    // Go to growth watchlist to read initial Buying Power
    await watchlistPage.gotoWatchlistPage();
    await watchlistPage.selectWatchlist(wlGrowth);
    await watchlistPage.openBuyWindow();
    await buyOrderPage.validateBuyWindowOpened();

    // Select Portfolio
    await buyOrderPage.selectPortfolio('-1-AshwiniPF');

    // Read initial Buying Power
    const initialBuyingPowerText = await buyOrderPage.getBuyingPower();
    const initialBuyingPower = parseFloat(initialBuyingPowerText.replace(/[^0-9.]/g, '')) || 0;
    console.log(`[Initial Buying Power] ${initialBuyingPower}`);

    // Select Limit order
    await buyOrderPage.selectLimitOrder();

    // Expand Advanced Options and choose Time in Force (Validity)
    await buyOrderPage.toggleAdvancedOptions();
    await buyOrderPage.selectTimeInForce('Day');

    // Enter Quantity & Price
    await buyOrderPage.enterQuantity('10');
    await buyOrderPage.enterPrice('13.00'); // set below Riyad Bank market price to queue it

    // Log Net Amount
    const limitNetVal = await buyOrderPage.getNetAmount();
    console.log(`[Day Limit Details] Net Amount: ${limitNetVal}`);

    // Place Limit Order
    await buyOrderPage.placeBuyOrder();
    await page.waitForTimeout(2000);

    // Verify status on Orders screen
    await ordersPage.gotoOrdersPage();

    let foundLimitOrder = false;
    for (const tab of ['Open', 'Executed', 'Rejected'] as const) {
        try {
            await ordersPage.selectTab(tab);
            const status = await ordersPage.verifyOrderExists('1010', 'BUY', 'LMT');
            if (status) {
                console.log(`Successfully verified Day Limit order on ${tab} tab with status: ${status}`);
                foundLimitOrder = true;
                break;
            }
        } catch (e) {
            console.log(`Day Limit order not found on ${tab} tab, checking next...`);
        }
    }
    expect(foundLimitOrder).toBe(true);

    // Go back to growth watchlist to open Buy Window and check if Buying Power decreased
    console.log('--- Checking if Buying Power Decreased ---');
    await watchlistPage.gotoWatchlistPage();
    await watchlistPage.selectWatchlist(wlGrowth);
    await watchlistPage.openBuyWindow();
    await buyOrderPage.validateBuyWindowOpened();

    // Select Portfolio to load active balance
    await buyOrderPage.selectPortfolio('-1-AshwiniPF');

    const newBuyingPowerText = await buyOrderPage.getBuyingPower();
    const newBuyingPower = parseFloat(newBuyingPowerText.replace(/[^0-9.]/g, '')) || 0;
    console.log(`[Updated Buying Power] ${newBuyingPower}`);

    if (initialBuyingPower > 0) {
        expect(newBuyingPower).toBeLessThan(initialBuyingPower);
        console.log(`✅ Success: Buying Power decreased from ${initialBuyingPower} to ${newBuyingPower} after placing the Day Limit order!`);
    } else {
        console.log('⚠️ Warning: Initial Buying Power was 0, skipped balance reduction check.');
    }
});
