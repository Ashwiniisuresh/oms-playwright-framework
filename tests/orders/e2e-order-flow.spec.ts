import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';
import { OrdersPage } from '../../pages/OrdersPage';

import { loginFlow } from '../../utils/loginHelper';

test.use({ storageState: { cookies: [], origins: [] } });

test('Unified E2E: single-flow login, 2 watchlists, 2 stocks, market + limit orders, TIF coverage', async ({ page }) => {

    test.setTimeout(180000);

    const loginPage = new LoginPage(page);
    const otpPage = new OtpPage(page);
    const watchlistPage = new WatchlistPage(page);
    const buyOrderPage = new BuyOrderPage(page);
    const ordersPage = new OrdersPage(page);
    const portfolioName = '-1-AshwiniPF';

    async function verifyOrderAcrossTabs(symbol: string, side: 'BUY' | 'SELL', category: string) {

        for (const tab of ['Open', 'Executed', 'Rejected'] as const) {

            try {

                await ordersPage.selectTab(tab);

                const status = await ordersPage.verifyOrderExists(symbol, side, category);

                return { tab, status };

            } catch (error) {

                console.log(`Order ${symbol}/${category} not found on ${tab} tab, checking next tab...`);
            }
        }

        throw new Error(`Unable to verify order for symbol ${symbol} with category ${category} on Open, Executed, or Rejected tabs.`);
    }

    async function openOrderWindowAndReadBuyingPower(watchlistName: string) {

        await watchlistPage.gotoWatchlistPage();
        await watchlistPage.selectWatchlist(watchlistName);
        await watchlistPage.openBuyWindow();
        await buyOrderPage.validateBuyWindowOpened();
        await buyOrderPage.selectPortfolio(portfolioName);

        const buyingPowerText = await buyOrderPage.getBuyingPower();
        const buyingPower = parseFloat(buyingPowerText.replace(/[^0-9.]/g, '')) || 0;

        return buyingPower;
    }

    async function ensureWatchlistReady(watchlistName: string, stockCode: string, stockName: string) {

        const watchlistCount = await watchlistPage.getWatchlistCount(watchlistName);

        await watchlistPage.gotoWatchlistPage();

        if (watchlistCount === 0) {

            console.log(`Creating missing watchlist: ${watchlistName}`);
            await watchlistPage.createWatchlist(watchlistName);

        } else {

            console.log(`Reusing existing watchlist: ${watchlistName}`);
        }

        await watchlistPage.selectWatchlist(watchlistName);
        await watchlistPage.addStockIfNotExist(stockCode, stockName);
    }

    async function placeOrderWithVerification(options: {
        watchlistName: string;
        symbol: string;
        category: 'MKRT' | 'LMT';
        tif: 'Day' | 'Fill and kill' | 'Fill or kill' | 'Good till date';
        quantity: string;
        orderType: 'Market' | 'Limit';
        price?: string;
        retryPrice?: string;
        checkBuyingPowerDrop?: boolean;
    }) {

        const initialBuyingPower = options.checkBuyingPowerDrop
            ? await openOrderWindowAndReadBuyingPower(options.watchlistName)
            : 0;

        if (!options.checkBuyingPowerDrop) {

            await watchlistPage.gotoWatchlistPage();
            await watchlistPage.selectWatchlist(options.watchlistName);
            await watchlistPage.openBuyWindow();
            await buyOrderPage.validateBuyWindowOpened();
            await buyOrderPage.selectPortfolio(portfolioName);
        }

        if (options.orderType === 'Market') {

            await buyOrderPage.selectMarketOrder();

        } else {

            await buyOrderPage.selectLimitOrder();
        }

        await buyOrderPage.toggleAdvancedOptions();
        await buyOrderPage.selectTimeInForce(options.tif);
        await buyOrderPage.enterQuantity(options.quantity);

        if (options.price) {

            await buyOrderPage.enterPrice(options.price);
        }

        const netAmount = await buyOrderPage.getNetAmount();
        console.log(`Placing ${options.orderType} order for ${options.symbol} | TIF: ${options.tif} | Net Amount: ${netAmount}`);

        await buyOrderPage.placeBuyOrder();
        await page.waitForTimeout(2000);

        await ordersPage.gotoOrdersPage();

        let orderResult = await verifyOrderAcrossTabs(options.symbol, 'BUY', options.category);
        console.log(`Verified ${options.symbol}/${options.category} on ${orderResult.tab} with status ${orderResult.status}`);

        if (orderResult.status === 'Rejected') {

            const rejectedRowText = await page
                .locator('table tbody tr')
                .filter({ hasText: options.symbol })
                .first()
                .textContent();

            console.log(`Rejected order snapshot for ${options.symbol}: ${rejectedRowText?.trim() || 'no row text found'}`);

            if (options.retryPrice) {

                console.log(`Retrying ${options.symbol}/${options.category} with corrected price ${options.retryPrice}`);

                await watchlistPage.gotoWatchlistPage();
                await watchlistPage.selectWatchlist(options.watchlistName);
                await watchlistPage.openBuyWindow();
                await buyOrderPage.validateBuyWindowOpened();
                await buyOrderPage.selectPortfolio(portfolioName);

                if (options.orderType === 'Market') {

                    await buyOrderPage.selectMarketOrder();

                } else {

                    await buyOrderPage.selectLimitOrder();
                }

                await buyOrderPage.toggleAdvancedOptions();
                await buyOrderPage.selectTimeInForce(options.tif);
                await buyOrderPage.enterQuantity(options.quantity);
                await buyOrderPage.enterPrice(options.retryPrice);

                await buyOrderPage.placeBuyOrder();
                await page.waitForTimeout(2000);

                await ordersPage.gotoOrdersPage();
                orderResult = await verifyOrderAcrossTabs(options.symbol, 'BUY', options.category);
                console.log(`Retry verified ${options.symbol}/${options.category} on ${orderResult.tab} with status ${orderResult.status}`);
            }
        }

        if (options.checkBuyingPowerDrop) {

            await watchlistPage.gotoWatchlistPage();
            const updatedBuyingPower = await openOrderWindowAndReadBuyingPower(options.watchlistName);

            if (orderResult.status === 'Queued' || orderResult.status === 'Open' || orderResult.status === 'Executed') {

                if (initialBuyingPower > 0) {

                    expect(updatedBuyingPower).toBeLessThan(initialBuyingPower);
                    console.log(`Buying power decreased from ${initialBuyingPower} to ${updatedBuyingPower}`);

                } else {

                    console.log(`Buying power check skipped: initial buying power was 0 (cannot decrease further). Updated: ${updatedBuyingPower}`);
                }

            } else {

                console.log(`Buying power check skipped because ${options.symbol} ended with status ${orderResult.status}`);
            }
        }
    }

    await loginFlow(loginPage, otpPage);
    await expect(page).toHaveURL(/\/home\/chart/, { timeout: 20000 });

    const primaryWatchlist = 'wl-primary';
    const secondaryWatchlist = 'wl-secondary';

    console.log('Creating the two watchlists once, then reusing them for the full flow');

    await ensureWatchlistReady(primaryWatchlist, '1030', 'SAIB - Saudi Investment Bank');
    await ensureWatchlistReady(secondaryWatchlist, '1010', 'Riyad Bank');

    await placeOrderWithVerification({
        watchlistName: primaryWatchlist,
        symbol: '1030',
        category: 'MKRT',
        tif: 'Day',
        quantity: '1',
        orderType: 'Market'
    });

    await placeOrderWithVerification({
        watchlistName: secondaryWatchlist,
        symbol: '1010',
        category: 'MKRT',
        tif: 'Fill and kill',
        quantity: '1',
        orderType: 'Market'
    });

    await placeOrderWithVerification({
        watchlistName: primaryWatchlist,
        symbol: '1030',
        category: 'LMT',
        tif: 'Fill or kill',
        quantity: '1',
        orderType: 'Limit',
        price: '13.00',
        retryPrice: '14.00'
    });

    await placeOrderWithVerification({
        watchlistName: secondaryWatchlist,
        symbol: '1010',
        category: 'LMT',
        tif: 'Good till date',
        quantity: '10',
        orderType: 'Limit',
        price: '2.70',
        retryPrice: '2.80',
        checkBuyingPowerDrop: true
    });

    console.log('Single-flow E2E completed: login, watchlists, stock setup, TIF coverage, order verification, and buying power validation');
});
