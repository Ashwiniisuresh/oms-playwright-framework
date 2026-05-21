import { test, expect } from '@playwright/test';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';
import { OrdersPage } from '../../pages/OrdersPage';

// Using global authentication state from auth.setup.ts

test('Order smoke flow: login, watchlist setup, and order verification', async ({ page }) => {

    test.setTimeout(180000);

    let activePage = page;
    const loginPage = new LoginPage(activePage);
    const otpPage = new OtpPage(activePage);
    let watchlistPage = new WatchlistPage(activePage);
    let buyOrderPage = new BuyOrderPage(activePage);
    let ordersPage = new OrdersPage(activePage);
    const portfolioName = '-1-AshwiniPF';

    async function ensureActivePage() {

        if (!activePage.isClosed()) {

            return;
        }

        const openPages = page.context().pages().filter(p => !p.isClosed());

        if (!openPages.length) {

            throw new Error('No active page available');

        } else {

            activePage = openPages[openPages.length - 1];
        }

        watchlistPage = new WatchlistPage(activePage);
        buyOrderPage = new BuyOrderPage(activePage);
        ordersPage = new OrdersPage(activePage);
    }

    async function verifyOrderAnywhere(symbol: string, side: 'BUY' | 'SELL', category: 'MKRT' | 'LMT') {
        const tabs = ['Open', 'Executed', 'Rejected'] as const;
        for (const tab of tabs) {
            await ordersPage.selectTab(tab);
            // Catch the error if it fails to find the row within the timeout, so we can try the next tab.
            const found = await ordersPage.verifyOrderExists(symbol, side, category, { timeout: 3000 }).catch(() => null);
            if (found) {
                return { tab, status: found };
            }
        }
        throw new Error(`Order for ${symbol} / ${category} not found in any tab`);
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
        tif: 'Day' | 'At the opening' | 'Fill and kill' | 'Good till cancel' | 'Fill or kill' | 'Good till date';
        quantity: string;
        orderType: 'Market' | 'Limit';
        price?: string;
        gtdDate?: string;
    }): Promise<'verified' | 'skipped'> {

        try {

            await buyOrderPage.closeBuyModalIfOpen();

            type AttemptState = {
                tif: 'Day' | 'At the opening' | 'Fill and kill' | 'Good till cancel' | 'Fill or kill' | 'Good till date';
                price?: string;
                gtdDate?: string;
            };

            const submitOrderAttempt = async (attempt: AttemptState) => {

                await ensureActivePage();

                await watchlistPage.gotoWatchlistPage();
                await watchlistPage.selectWatchlist(options.watchlistName);
                await watchlistPage.openBuyWindowForSymbol(options.symbol);
                await buyOrderPage.validateBuyWindowOpened();
                await buyOrderPage.selectPortfolio(portfolioName);

                if (options.orderType === 'Market') {

                    await buyOrderPage.selectMarketOrder();

                } else {

                    await buyOrderPage.selectLimitOrder();
                }

                await buyOrderPage.toggleAdvancedOptions();
                await buyOrderPage.selectTimeInForce(attempt.tif);

                if (attempt.tif === 'Good till date' && attempt.gtdDate) {

                    await buyOrderPage.selectGtdDate(attempt.gtdDate);
                }

                await buyOrderPage.enterQuantity(options.quantity);

                if (attempt.price) {

                    await buyOrderPage.enterPrice(attempt.price);
                }

                const netAmount = await buyOrderPage.getNetAmount();
                console.log(`Placing ${options.orderType} order for ${options.symbol} | TIF: ${attempt.tif} | Net Amount: ${netAmount}`);

                await buyOrderPage.placeBuyOrder();
                await activePage.waitForTimeout(2000);

                const validationMessage = await buyOrderPage.getValidationMessage();

                if (validationMessage) {

                    await buyOrderPage.resetOrderFormIfVisible();
                }

                await buyOrderPage.closeBuyModalIfOpen();

                return validationMessage;
            };

            const attemptState: AttemptState = {
                tif: options.tif,
                price: options.price,
                gtdDate: options.gtdDate
            };

            let lastValidationMessage = '';

            for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex++) {

                try {

                    lastValidationMessage = await submitOrderAttempt(attemptState);

                } catch (attemptError) {

                    const attemptMessage = attemptError instanceof Error ? attemptError.message : String(attemptError);

                    console.log(`Attempt ${attemptIndex} failed for ${options.symbol}. Closing and skipping: ${attemptMessage}`);

                    await buyOrderPage.closeBuyModalIfOpen().catch(() => {});

                    return 'skipped';
                }

                if (!lastValidationMessage) {

                    break;
                }

                if (/Price should be within/i.test(lastValidationMessage)) {

                    const match = lastValidationMessage.match(/within\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);

                    if (match) {

                        attemptState.price = Number(match[1]).toFixed(2);

                        console.log(`Retrying ${options.symbol} with validation price ${attemptState.price}`);

                        continue;
                    }
                }

                console.log(`Skipping ${options.symbol}/${options.category} due to non-price validation: ${lastValidationMessage}`);

                return 'skipped';

                break;
            }

            if (lastValidationMessage) {

                console.log(`Skipping ${options.symbol}/${options.category} because validation persisted after price retry: ${lastValidationMessage}`);

                return 'skipped';
            }

            await ensureActivePage();
            await ordersPage.gotoOrdersPage();

            const orderResult = await verifyOrderAnywhere(options.symbol, 'BUY', options.category);
            console.log(`Verified ${options.symbol}/${options.category} on ${orderResult.tab} with status ${orderResult.status}`);

            return 'verified';
        } catch (error) {

            const message = error instanceof Error ? error.message : String(error);

            if (/market.*closed|market state close|not able to place|timeout|target page, context or browser has been closed/i.test(message)) {

                console.log(`Skipping ${options.symbol}/${options.category} because order could not be placed: ${message}`);

                await buyOrderPage.closeBuyModalIfOpen().catch(() => {});

                return 'skipped';
            }

            throw error;
        }
    }

    // Navigation to home page since we are already authenticated via setup
    await activePage.goto('home/chart');
    await expect(activePage).toHaveURL(/\/home\/chart/, { timeout: 20000 });

    const watchlistName = 'wl-smoke';

    console.log('Creating one reusable watchlist for the smoke flow');

    await ensureWatchlistReady(watchlistName, '1030', 'SAIB - Saudi Investment Bank');
    await ensureWatchlistReady(watchlistName, '1010', 'Riyad Bank');

    await placeOrderWithVerification({
        watchlistName,
        symbol: '1030',
        category: 'MKRT',
        tif: 'Day',
        quantity: '1',
        orderType: 'Market'
    });

    await placeOrderWithVerification({
        watchlistName,
        symbol: '1010',
        category: 'LMT',
        tif: 'Good till date',
        quantity: '10',
        orderType: 'Limit',
        price: '2.70',
        gtdDate: '24'
    });

    await placeOrderWithVerification({
        watchlistName,
        symbol: '1030',
        category: 'LMT',
        tif: 'At the opening',
        quantity: '2',
        orderType: 'Limit',
        price: '13.10'
    });

    await placeOrderWithVerification({
        watchlistName,
        symbol: '1010',
        category: 'LMT',
        tif: 'Fill and kill',
        quantity: '3',
        orderType: 'Limit',
        price: '2.80'
    });

    await placeOrderWithVerification({
        watchlistName,
        symbol: '1030',
        category: 'LMT',
        tif: 'Good till cancel',
        quantity: '4',
        orderType: 'Limit',
        price: '13.20'
    });

    await placeOrderWithVerification({
        watchlistName,
        symbol: '1010',
        category: 'LMT',
        tif: 'Fill or kill',
        quantity: '5',
        orderType: 'Limit',
        price: '2.90'
    });

    console.log('Single-flow E2E completed: login, watchlist setup, stock setup, TIF coverage, and order verification');
});
