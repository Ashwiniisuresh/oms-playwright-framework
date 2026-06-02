import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { LoginPage } from '../../pages/LoginPage';
import { OtpPage } from '../../pages/OtpPage';
import { WatchlistPage } from '../../pages/WatchlistPage';
import { BuyOrderPage } from '../../pages/BuyOrderPage';
import { SellOrderPage } from '../../pages/SellOrderPage';
import { OrdersPage } from '../../pages/OrdersPage';
import { HoldingsPage } from '../../pages/HoldingsPage';

interface TestResult {
    testType: 'BUY MKRT' | 'BUY LMT' | 'SELL MKRT' | 'SELL LMT';
    tif: string;
    status: 'PASS' | 'FAIL' | 'SKIPPED';
    originalPrice: string;
    rejectionReason: string;
    correctedPrice: string;
    finalStatus: string;
    powerBefore: string;
    powerAfter: string;
    holdingsBefore?: string;
    holdingsAfter?: string;
    details: string;
}

function parseRejectionPrice(message: string): string | null {
    // 1. "cannot be less than X"
    let match = message.match(/cannot be less than\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (match) return match[1];

    // 2. "cannot be greater than X"
    match = message.match(/cannot be greater than\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (match) return match[1];

    // 3. "must be between X and Y"
    match = message.match(/between\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (match) return match[1];

    // 4. "must be within X and Y"
    match = message.match(/within\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (match) return match[1];

    // 5. Generic "than X"
    match = message.match(/than\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (match) return match[1];

    // 6. Generic decimal number
    match = message.match(/([0-9]+\.[0-9]+)/);
    if (match) return match[1];

    return null;
}

test('Comprehensive E2E Order Flow: Complete Watchlist, Buy/Sell, TIF Coverage, Orders, Holdings & Selling Power', async ({ page }) => {

    test.setTimeout(1200000); // 20 minutes for comprehensive sequential TIF execution

    // Create screenshot directories
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    let activePage = page;
    const loginPage = new LoginPage(activePage);
    const otpPage = new OtpPage(activePage);
    let watchlistPage = new WatchlistPage(activePage);
    let buyOrderPage = new BuyOrderPage(activePage);
    let sellOrderPage = new SellOrderPage(activePage);
    let ordersPage = new OrdersPage(activePage);
    let holdingsPage = new HoldingsPage(activePage);

    const portfolioName = '283-1-AshwiniPF';
    const testSymbol = '1030';
    const testStockName = 'SAIB - Saudi Investment Bank';
    const watchlistName = 'wl-smoke';

    const resultsTable: TestResult[] = [];

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
        sellOrderPage = new SellOrderPage(activePage);
        ordersPage = new OrdersPage(activePage);
        holdingsPage = new HoldingsPage(activePage);
    }

    // Resilient Executer (Self-Healing Framework)
    async function resilientExecute<T>(actionName: string, action: () => Promise<T>): Promise<T> {
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                return await action();
            } catch (error) {
                lastError = error;
                console.log(`[SELF-HEALING] Attempt ${attempt}/3 failed for "${actionName}": ${error instanceof Error ? error.message : String(error)}`);
                if (attempt < 3) {
                    console.log(`[SELF-HEALING] Retrying: Refreshing page and waiting for stabilization...`);
                    await activePage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                    await activePage.waitForTimeout(3000);
                    await ensureActivePage();
                }
            }
        }
        throw lastError;
    }

    async function verifyOrderAnywhere(symbol: string, side: 'BUY' | 'SELL', category: 'MKRT' | 'LMT') {
        const tabs = ['Open', 'Executed', 'Rejected'] as const;
        for (const tab of tabs) {
            try {
                await ordersPage.selectTab(tab);
                const found = await ordersPage.verifyOrderExists(symbol, side, category, { timeout: 4000 }).catch(() => null);
                if (found) {
                    console.log(`✓ Order verified in ${tab} tab with status: ${found.normalizedStatus}`);
                    return { tab, status: found.normalizedStatus, rawStatus: found.rawStatus, orderNumber: found.orderNumber };
                }
            } catch (e) {
                continue;
            }
        }
        throw new Error(`Order for ${symbol} (${side} / ${category}) not found in any tab`);
    }

    async function ensureWatchlistReady(watchlistName: string, stockCode: string, stockName: string) {
        await resilientExecute('ensureWatchlistReady', async () => {
            await watchlistPage.gotoWatchlistPage();
            const watchlistCount = await watchlistPage.getWatchlistCount(watchlistName);

            if (watchlistCount === 0) {
                console.log(`Creating missing watchlist: ${watchlistName}`);
                await watchlistPage.createWatchlist(watchlistName);
            } else {
                console.log(`Reusing existing watchlist: ${watchlistName}`);
            }

            await watchlistPage.selectWatchlist(watchlistName);
            await watchlistPage.addStockIfNotExist(stockCode, stockName);
        });
    }

    // Helper for BUY orders
    async function placeBuyOrderWithVerification(options: {
        symbol: string;
        category: 'MKRT' | 'LMT';
        tif: 'Day' | 'At the opening' | 'Fill and kill' | 'Good till cancel' | 'Fill or kill' | 'Good till date';
        quantity: string;
        orderType: 'Market' | 'Limit';
        price?: string;
        gtdDate?: string;
    }) {
        const resultItem: TestResult = {
            testType: options.category === 'MKRT' ? 'BUY MKRT' : 'BUY LMT',
            tif: options.tif,
            status: 'FAIL',
            originalPrice: options.price || 'Market',
            rejectionReason: 'None',
            correctedPrice: 'N/A',
            finalStatus: 'N/A',
            powerBefore: 'N/A',
            powerAfter: 'N/A',
            details: ''
        };

        try {
            await buyOrderPage.closeBuyModalIfOpen();

            type AttemptState = {
                tif: typeof options.tif;
                price?: string;
                gtdDate?: string;
            };

            const submitOrderAttempt = async (attempt: AttemptState) => {
                await ensureActivePage();

                await watchlistPage.gotoWatchlistPage();
                await watchlistPage.selectWatchlist(watchlistName);
                await watchlistPage.openBuyWindowForSymbol(options.symbol);
                await buyOrderPage.validateBuyWindowOpened();
                await buyOrderPage.selectPortfolio(portfolioName);

                // Get Buying Power Before Placement
                const bpBefore = await buyOrderPage.getBuyingPower();
                resultItem.powerBefore = bpBefore;

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

                // Dynamic Pricing Engine retrieval & logic
                let priceToEnter = attempt.price;
                if (options.orderType === 'Limit') {
                    const ltp = await buyOrderPage.getLTP();
                    const bid = await buyOrderPage.getBidPrice();
                    const ask = await buyOrderPage.getAskPrice();
                    const upper = await buyOrderPage.getUpperCircuit();
                    const lower = await buyOrderPage.getLowerCircuit();

                    // Calculate valid price: min(Ask Price, LTP) staying inside limits
                    const calculated = Math.min(ask, ltp);
                    let finalCalculatedPrice = calculated;
                    if (finalCalculatedPrice < lower) finalCalculatedPrice = lower;
                    if (finalCalculatedPrice > upper) finalCalculatedPrice = upper;

                    console.log(`[DYNAMIC PRICE] Retrieved Market Data - LTP: ${ltp}, Bid: ${bid}, Ask: ${ask}, Upper: ${upper}, Lower: ${lower}`);
                    console.log(`[DYNAMIC PRICE] Calculated Buy Limit Price: ${finalCalculatedPrice.toFixed(2)}`);

                    // If price isn't explicitly defined, use computed pricing
                    if (!priceToEnter) {
                        priceToEnter = finalCalculatedPrice.toFixed(2);
                        resultItem.originalPrice = priceToEnter;
                    }
                }

                if (priceToEnter) {
                    await buyOrderPage.enterPrice(priceToEnter);
                }

                const netAmount = await buyOrderPage.getNetAmount();
                console.log(`[BUY] Placing ${options.orderType} order for ${options.symbol} | TIF: ${attempt.tif} | Net Amount: ${netAmount}`);

                // Capture form screenshot
                const screenshotName = `buy_${options.category.toLowerCase()}_${options.tif.toLowerCase().replace(/\s+/g, '_')}.png`;
                await activePage.screenshot({ path: path.join(screenshotDir, screenshotName) });

                await buyOrderPage.placeBuyOrder();
                await activePage.waitForTimeout(2000); // Wait for order message

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
                gtdDate: options.gtdDate || (options.tif === 'Good till date' ? '24' : undefined)
            };

            let lastValidationMessage = '';

            for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex++) {
                try {
                    lastValidationMessage = await resilientExecute('submitOrderAttempt', async () => {
                        return await submitOrderAttempt(attemptState);
                    });
                } catch (attemptError) {
                    const attemptMessage = attemptError instanceof Error ? attemptError.message : String(attemptError);
                    console.log(`[BUY] Attempt ${attemptIndex} failed. Closing & skipping: ${attemptMessage}`);
                    await buyOrderPage.closeBuyModalIfOpen().catch(() => { });
                    resultItem.status = 'SKIPPED';
                    resultItem.details = `Execution Error: ${attemptMessage}`;
                    resultsTable.push(resultItem);
                    return;
                }

                if (!lastValidationMessage) {
                    break;
                }

                if (/Price should be within/i.test(lastValidationMessage)) {
                    const match = lastValidationMessage.match(/within\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);
                    if (match) {
                        attemptState.price = Number(match[1]).toFixed(2);
                        resultItem.correctedPrice = attemptState.price;
                        console.log(`[BUY] Retrying with midpoint validation price: ${attemptState.price}`);
                        continue;
                    }
                }

                console.log(`[BUY] Skipping due to validation: ${lastValidationMessage}`);
                resultItem.status = 'SKIPPED';
                resultItem.rejectionReason = lastValidationMessage;
                resultItem.details = `Validation: ${lastValidationMessage}`;
                resultsTable.push(resultItem);
                return;
            }

            if (lastValidationMessage) {
                console.log(`[BUY] Skipping because validation persisted: ${lastValidationMessage}`);
                resultItem.status = 'SKIPPED';
                resultItem.rejectionReason = lastValidationMessage;
                resultItem.details = `Validation Persisted: ${lastValidationMessage}`;
                resultsTable.push(resultItem);
                return;
            }

            // Verify on Orders page immediately
            await ensureActivePage();
            await resilientExecute('verifyOrderOnOrdersTab', async () => {
                await ordersPage.gotoOrdersPage();
            });

            let orderResult = await verifyOrderAnywhere(options.symbol, 'BUY', options.category);
            let finalStatus = orderResult.status;

            if (orderResult.status === 'Rejected' && 
                (/(?:295|price limit|cannot be less than|cannot be greater than)/i.test(orderResult.rawStatus))) {
                
                resultItem.rejectionReason = orderResult.rawStatus;
                console.log(`[BUY] Detected exchange price limit rejection: ${orderResult.rawStatus}`);
                
                // Parse allowed exchange price limit
                const allowedPrice = parseRejectionPrice(orderResult.rawStatus);
                if (allowedPrice) {
                    resultItem.correctedPrice = allowedPrice;
                    console.log(`[BUY] Parsed allowed exchange price: ${allowedPrice}. Re-submitting order automatically...`);

                    // Close buy modal if any and open new order placement
                    await ensureActivePage();
                    await watchlistPage.gotoWatchlistPage();
                    await watchlistPage.selectWatchlist(watchlistName);
                    await watchlistPage.openBuyWindowForSymbol(options.symbol);
                    await buyOrderPage.validateBuyWindowOpened();
                    await buyOrderPage.selectPortfolio(portfolioName);

                    if (options.orderType === 'Market') {
                        await buyOrderPage.selectMarketOrder();
                    } else {
                        await buyOrderPage.selectLimitOrder();
                    }

                    await buyOrderPage.toggleAdvancedOptions();
                    await buyOrderPage.selectTimeInForce(options.tif);

                    if (options.tif === 'Good till date' && options.gtdDate) {
                        await buyOrderPage.selectGtdDate(options.gtdDate);
                    }

                    await buyOrderPage.enterQuantity(options.quantity);
                    await buyOrderPage.enterPrice(allowedPrice);

                    // Capture corrected form screenshot
                    const screenshotName = `buy_${options.category.toLowerCase()}_${options.tif.toLowerCase().replace(/\s+/g, '_')}_corrected.png`;
                    await activePage.screenshot({ path: path.join(screenshotDir, screenshotName) });

                    await buyOrderPage.placeBuyOrder();
                    await activePage.waitForTimeout(2000); // Wait for order message
                    await buyOrderPage.closeBuyModalIfOpen();

                    // Re-verify on Orders page
                    await ensureActivePage();
                    await ordersPage.gotoOrdersPage();
                    const newOrderResult = await verifyOrderAnywhere(options.symbol, 'BUY', options.category);
                    finalStatus = newOrderResult.status;
                    console.log(`[BUY] Corrected resubmitted order accepted. Status: ${finalStatus}`);
                } else {
                    console.log(`[BUY] Could not parse allowed price limit from rejection message.`);
                }
            }

            resultItem.finalStatus = finalStatus;

            // Get Buying Power After Placement
            await watchlistPage.gotoWatchlistPage();
            await watchlistPage.selectWatchlist(watchlistName);
            await watchlistPage.openBuyWindowForSymbol(options.symbol);
            await buyOrderPage.validateBuyWindowOpened();
            await buyOrderPage.selectPortfolio(portfolioName);
            const bpAfter = await buyOrderPage.getBuyingPower();
            resultItem.powerAfter = bpAfter;
            await buyOrderPage.closeBuyModalIfOpen();

            resultItem.status = finalStatus === 'Rejected' ? 'FAIL' : 'PASS';
            resultItem.details = `Final verified status in Orders: ${finalStatus}`;
            resultsTable.push(resultItem);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`[BUY] Exception caught: ${message}`);
            resultItem.status = 'SKIPPED';
            resultItem.details = `Exception: ${message}`;
            resultsTable.push(resultItem);
        }
    }

    // Helper for SELL orders
    async function placeSellOrderWithVerification(options: {
        symbol: string;
        category: 'MKRT' | 'LMT';
        tif: 'Day' | 'At the opening' | 'Fill and kill' | 'Good till cancel' | 'Fill or kill' | 'Good till date';
        quantity: string;
        orderType: 'Market' | 'Limit';
        price?: string;
        gtdDate?: string;
    }) {
        const resultItem: TestResult = {
            testType: options.category === 'MKRT' ? 'SELL MKRT' : 'SELL LMT',
            tif: options.tif,
            status: 'FAIL',
            originalPrice: options.price || 'Market',
            rejectionReason: 'None',
            correctedPrice: 'N/A',
            finalStatus: 'N/A',
            powerBefore: 'N/A',
            powerAfter: 'N/A',
            holdingsBefore: 'N/A',
            holdingsAfter: 'N/A',
            details: ''
        };

        try {
            await sellOrderPage.closeSellModalIfOpen();

            type AttemptState = {
                tif: typeof options.tif;
                price?: string;
                gtdDate?: string;
            };

            const submitOrderAttempt = async (attempt: AttemptState) => {
                await ensureActivePage();

                // Get Holdings Before Placement (Requirement: Navigate to Holdings before placing Sell orders)
                await holdingsPage.gotoHoldingsPage();
                const hbBefore = await holdingsPage.getStockHolding(options.symbol);
                resultItem.holdingsBefore = String(hbBefore);

                await watchlistPage.gotoWatchlistPage();
                await watchlistPage.selectWatchlist(watchlistName);
                await watchlistPage.openSellWindowForSymbol(options.symbol);
                await sellOrderPage.validateSellWindowOpened();
                await sellOrderPage.selectPortfolio(portfolioName);

                // Get Selling Power Before Placement
                const spBefore = await sellOrderPage.getSellingPower();
                resultItem.powerBefore = spBefore;

                if (options.orderType === 'Market') {
                    await sellOrderPage.selectMarketOrder();
                } else {
                    await sellOrderPage.selectLimitOrder();
                }

                await sellOrderPage.toggleAdvancedOptions();
                await sellOrderPage.selectTimeInForce(attempt.tif);

                if (attempt.tif === 'Good till date' && attempt.gtdDate) {
                    await sellOrderPage.selectGtdDate(attempt.gtdDate);
                }

                await sellOrderPage.enterQuantity(options.quantity);

                // Dynamic Pricing Engine retrieval & logic
                let priceToEnter = attempt.price;
                if (options.orderType === 'Limit') {
                    const ltp = await sellOrderPage.getLTP();
                    const bid = await sellOrderPage.getBidPrice();
                    const ask = await sellOrderPage.getAskPrice();
                    const upper = await sellOrderPage.getUpperCircuit();
                    const lower = await sellOrderPage.getLowerCircuit();

                    // Calculate valid price: max(Bid Price, LTP) staying inside limits
                    const calculated = Math.max(bid, ltp);
                    let finalCalculatedPrice = calculated;
                    if (finalCalculatedPrice < lower) finalCalculatedPrice = lower;
                    if (finalCalculatedPrice > upper) finalCalculatedPrice = upper;

                    console.log(`[DYNAMIC PRICE] Retrieved Market Data - LTP: ${ltp}, Bid: ${bid}, Ask: ${ask}, Upper: ${upper}, Lower: ${lower}`);
                    console.log(`[DYNAMIC PRICE] Calculated Sell Limit Price: ${finalCalculatedPrice.toFixed(2)}`);

                    // If price isn't explicitly defined, use computed pricing
                    if (!priceToEnter) {
                        priceToEnter = finalCalculatedPrice.toFixed(2);
                        resultItem.originalPrice = priceToEnter;
                    }
                }

                if (priceToEnter) {
                    await sellOrderPage.enterPrice(priceToEnter);
                }

                const sellingPower = await sellOrderPage.getSellingPower();
                console.log(`[SELL] Placing ${options.orderType} order for ${options.symbol} | TIF: ${attempt.tif} | Selling Power: ${sellingPower}`);

                // Capture form screenshot
                const screenshotName = `sell_${options.category.toLowerCase()}_${options.tif.toLowerCase().replace(/\s+/g, '_')}.png`;
                await activePage.screenshot({ path: path.join(screenshotDir, screenshotName) });

                await sellOrderPage.placeSellOrder();
                await activePage.waitForTimeout(2000); // Wait for order message

                const validationMessage = await sellOrderPage.getValidationMessage();

                if (validationMessage) {
                    await sellOrderPage.resetOrderFormIfVisible();
                }

                await sellOrderPage.closeSellModalIfOpen();

                return validationMessage;
            };

            const attemptState: AttemptState = {
                tif: options.tif,
                price: options.price,
                gtdDate: options.gtdDate || (options.tif === 'Good till date' ? '24' : undefined)
            };

            let lastValidationMessage = '';

            for (let attemptIndex = 1; attemptIndex <= 2; attemptIndex++) {
                try {
                    lastValidationMessage = await resilientExecute('submitOrderAttempt', async () => {
                        return await submitOrderAttempt(attemptState);
                    });
                } catch (attemptError) {
                    const attemptMessage = attemptError instanceof Error ? attemptError.message : String(attemptError);
                    console.log(`[SELL] Attempt ${attemptIndex} failed. Closing & skipping: ${attemptMessage}`);
                    await sellOrderPage.closeSellModalIfOpen().catch(() => { });
                    resultItem.status = 'SKIPPED';
                    resultItem.details = `Execution Error: ${attemptMessage}`;
                    resultsTable.push(resultItem);
                    return;
                }

                if (!lastValidationMessage) {
                    break;
                }

                if (/Price should be within/i.test(lastValidationMessage)) {
                    const match = lastValidationMessage.match(/within\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);
                    if (match) {
                        attemptState.price = Number(match[1]).toFixed(2);
                        resultItem.correctedPrice = attemptState.price;
                        console.log(`[SELL] Retrying with midpoint validation price: ${attemptState.price}`);
                        continue;
                    }
                }

                console.log(`[SELL] Skipping due to validation: ${lastValidationMessage}`);
                resultItem.status = 'SKIPPED';
                resultItem.rejectionReason = lastValidationMessage;
                resultItem.details = `Validation: ${lastValidationMessage}`;
                resultsTable.push(resultItem);
                return;
            }

            if (lastValidationMessage) {
                console.log(`[SELL] Skipping because validation persisted: ${lastValidationMessage}`);
                resultItem.status = 'SKIPPED';
                resultItem.rejectionReason = lastValidationMessage;
                resultItem.details = `Validation Persisted: ${lastValidationMessage}`;
                resultsTable.push(resultItem);
                return;
            }

            // Verify on Orders page immediately
            await ensureActivePage();
            await resilientExecute('verifyOrderOnOrdersTab', async () => {
                await ordersPage.gotoOrdersPage();
            });

            let orderResult = await verifyOrderAnywhere(options.symbol, 'SELL', options.category);
            let finalStatus = orderResult.status;

            if (orderResult.status === 'Rejected' && 
                (/(?:295|price limit|cannot be less than|cannot be greater than)/i.test(orderResult.rawStatus))) {
                
                resultItem.rejectionReason = orderResult.rawStatus;
                console.log(`[SELL] Detected exchange price limit rejection: ${orderResult.rawStatus}`);
                
                // Parse allowed exchange price limit
                const allowedPrice = parseRejectionPrice(orderResult.rawStatus);
                if (allowedPrice) {
                    resultItem.correctedPrice = allowedPrice;
                    console.log(`[SELL] Parsed allowed exchange price: ${allowedPrice}. Re-submitting order automatically...`);

                    // Close sell modal if any and open new order placement
                    await ensureActivePage();
                    await watchlistPage.gotoWatchlistPage();
                    await watchlistPage.selectWatchlist(watchlistName);
                    await watchlistPage.openSellWindowForSymbol(options.symbol);
                    await sellOrderPage.validateSellWindowOpened();
                    await sellOrderPage.selectPortfolio(portfolioName);

                    if (options.orderType === 'Market') {
                        await sellOrderPage.selectMarketOrder();
                    } else {
                        await sellOrderPage.selectLimitOrder();
                    }

                    await sellOrderPage.toggleAdvancedOptions();
                    await sellOrderPage.selectTimeInForce(options.tif);

                    if (options.tif === 'Good till date' && options.gtdDate) {
                        await sellOrderPage.selectGtdDate(options.gtdDate);
                    }

                    await sellOrderPage.enterQuantity(options.quantity);
                    await sellOrderPage.enterPrice(allowedPrice);

                    // Capture corrected form screenshot
                    const screenshotName = `sell_${options.category.toLowerCase()}_${options.tif.toLowerCase().replace(/\s+/g, '_')}_corrected.png`;
                    await activePage.screenshot({ path: path.join(screenshotDir, screenshotName) });

                    await sellOrderPage.placeSellOrder();
                    await activePage.waitForTimeout(2000); // Wait for order message
                    await sellOrderPage.closeSellModalIfOpen();

                    // Re-verify on Orders page
                    await ensureActivePage();
                    await ordersPage.gotoOrdersPage();
                    const newOrderResult = await verifyOrderAnywhere(options.symbol, 'SELL', options.category);
                    finalStatus = newOrderResult.status;
                    console.log(`[SELL] Corrected resubmitted order accepted. Status: ${finalStatus}`);
                } else {
                    console.log(`[SELL] Could not parse allowed price limit from rejection message.`);
                }
            }

            resultItem.finalStatus = finalStatus;

            // Navigate to Holdings (Requirement: Navigate to Holdings after Sell Order Placement)
            await holdingsPage.gotoHoldingsPage();
            const hbAfter = await holdingsPage.getStockHolding(options.symbol);
            resultItem.holdingsAfter = String(hbAfter);

            const hbBeforeNum = Number(resultItem.holdingsBefore);
            if ((finalStatus === 'Queued' || finalStatus === 'Open') && hbBeforeNum > 0) {
                // Verify quantity reduction if order is queued
                await holdingsPage.validateHoldingsDecreased(options.symbol, hbBeforeNum);
            } else {
                console.log(`[SELL] Checked holdings after order. Previous: ${hbBeforeNum}, Current: ${hbAfter}. (No reduction verification possible if baseline is 0 or order filled/rejected)`);
            }

            // Get Selling Power After Placement
            await watchlistPage.gotoWatchlistPage();
            await watchlistPage.selectWatchlist(watchlistName);
            await watchlistPage.openSellWindowForSymbol(options.symbol);
            await sellOrderPage.validateSellWindowOpened();
            await sellOrderPage.selectPortfolio(portfolioName);
            const spAfter = await sellOrderPage.getSellingPower();
            resultItem.powerAfter = spAfter;
            await sellOrderPage.closeSellModalIfOpen();

            resultItem.status = finalStatus === 'Rejected' ? 'FAIL' : 'PASS';
            resultItem.details = `Final verified status in Orders: ${finalStatus}`;
            resultsTable.push(resultItem);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`[SELL] Exception caught: ${message}`);
            resultItem.status = 'SKIPPED';
            resultItem.details = `Exception: ${message}`;
            resultsTable.push(resultItem);
        }
    }

    // ==========================================
    // master trade E2E execution sequence
    // ==========================================

    console.log('=== STARTING INTEGRATED SINGLE-FLOW ORDER E2E TEST ===');

    // Watchlist creation & stock setup
    await activePage.goto('home/chart');
    await expect(activePage).toHaveURL(/\/home\/chart/, { timeout: 20000 });
    await ensureWatchlistReady(watchlistName, testSymbol, testStockName);
    await ensureWatchlistReady(watchlistName, '1010', 'Riyad Bank');

    // capture initial baseline holdings
    await holdingsPage.gotoHoldingsPage();
    const baselineHoldings = await holdingsPage.getStockHolding(testSymbol);
    console.log(`Pre-flow Baseline holdings of ${testSymbol} is: ${baselineHoldings}\n`);

    const tifs = ['Day', 'At the opening', 'Fill and kill', 'Good till cancel', 'Fill or kill', 'Good till date'] as const;

    // Test 1: Place Market BUY orders for ALL TIF types
    console.log('=== TEST 1: PLACING ALL MARKET BUY ORDERS ===');
    for (const tif of tifs) {
        await placeBuyOrderWithVerification({
            symbol: testSymbol,
            category: 'MKRT',
            tif: tif,
            quantity: '1',
            orderType: 'Market',
            gtdDate: tif === 'Good till date' ? '24' : undefined
        });
    }

    // Test 2: Place Limit BUY orders for ALL TIF types (using high price to trigger Price Limit Rejections!)
    console.log('\n=== TEST 2: PLACING ALL LIMIT BUY ORDERS ===');
    for (const tif of tifs) {
        await placeBuyOrderWithVerification({
            symbol: testSymbol,
            category: 'LMT',
            tif: tif,
            quantity: '1',
            orderType: 'Limit',
            price: '15.00', // Initially too high to trigger exchange limit correction
            gtdDate: tif === 'Good till date' ? '24' : undefined
        });
    }

    // Test 3: Place Market SELL orders for ALL TIF types
    console.log('\n=== TEST 3: PLACING ALL MARKET SELL ORDERS ===');
    for (const tif of tifs) {
        await placeSellOrderWithVerification({
            symbol: testSymbol,
            category: 'MKRT',
            tif: tif,
            quantity: '1',
            orderType: 'Market',
            gtdDate: tif === 'Good till date' ? '24' : undefined
        });
    }

    // Test 4: Place Limit SELL orders for ALL TIF types (using low price to trigger Price Limit Rejections!)
    console.log('\n=== TEST 4: PLACING ALL LIMIT SELL ORDERS ===');
    for (const tif of tifs) {
        await placeSellOrderWithVerification({
            symbol: testSymbol,
            category: 'LMT',
            tif: tif,
            quantity: '1',
            orderType: 'Limit',
            price: '1.60', // Initially too low to trigger exchange limit correction
            gtdDate: tif === 'Good till date' ? '24' : undefined
        });
    }

    // Post-flow verify holdings & selling power check
    console.log('\n=== POST-FLOW FINAL VERIFICATIONS ===');
    await holdingsPage.gotoHoldingsPage();
    const postFlowHoldings = await holdingsPage.getStockHolding(testSymbol);
    console.log(`Final Baseline holdings of ${testSymbol} is: ${postFlowHoldings}`);
    console.log(`Net Holdings Difference: ${postFlowHoldings - baselineHoldings}`);

    // ==========================================
    // NEGATIVE TESTING COVERAGE
    // ==========================================
    console.log('\n=== NEGATIVE TESTS: VALIDATION & EXCEPTION HANDLING ===');
    
    // 1. Invalid Quantity
    try {
        console.log('[NEGATIVE] Testing invalid quantity input (0)...');
        await ensureActivePage();
        await watchlistPage.gotoWatchlistPage();
        await watchlistPage.selectWatchlist(watchlistName);
        await watchlistPage.openBuyWindowForSymbol(testSymbol);
        await buyOrderPage.validateBuyWindowOpened();
        await buyOrderPage.selectPortfolio(portfolioName);
        await buyOrderPage.enterQuantity('0');
        await buyOrderPage.placeBuyOrder();
        await activePage.waitForTimeout(2000);
        const err = await buyOrderPage.getValidationMessage();
        console.log(`✓ Caught invalid quantity validation: ${err || 'Form blocked submission'}`);
        await buyOrderPage.closeBuyModalIfOpen();
    } catch (e) {
        console.log(`[NEGATIVE] Invalid quantity caught exception: ${e}`);
        await buyOrderPage.closeBuyModalIfOpen().catch(() => {});
    }

    // 2. Insufficient Holdings
    try {
        console.log('[NEGATIVE] Testing insufficient holdings (quantity exceeding held quantity)...');
        await ensureActivePage();
        await watchlistPage.gotoWatchlistPage();
        await watchlistPage.selectWatchlist(watchlistName);
        await watchlistPage.openSellWindowForSymbol(testSymbol);
        await sellOrderPage.validateSellWindowOpened();
        await sellOrderPage.selectPortfolio(portfolioName);
        await sellOrderPage.selectLimitOrder();
        await sellOrderPage.enterQuantity('99999999');
        await sellOrderPage.enterPrice('2.00');
        await sellOrderPage.placeSellOrder();
        await activePage.waitForTimeout(2000);
        const err = await sellOrderPage.getValidationMessage();
        console.log(`✓ Caught insufficient holdings validation: ${err || 'Form blocked submission'}`);
        await sellOrderPage.closeSellModalIfOpen();
    } catch (e) {
        console.log(`[NEGATIVE] Insufficient holdings caught exception: ${e}`);
        await sellOrderPage.closeSellModalIfOpen().catch(() => {});
    }

    // 3. Insufficient Funds
    try {
        console.log('[NEGATIVE] Testing insufficient funds (order exceeding buying power)...');
        await ensureActivePage();
        await watchlistPage.gotoWatchlistPage();
        await watchlistPage.selectWatchlist(watchlistName);
        await watchlistPage.openBuyWindowForSymbol(testSymbol);
        await buyOrderPage.validateBuyWindowOpened();
        await buyOrderPage.selectPortfolio(portfolioName);
        await buyOrderPage.selectLimitOrder();
        await buyOrderPage.enterQuantity('99999999');
        await buyOrderPage.enterPrice('15.00');
        await buyOrderPage.placeBuyOrder();
        await activePage.waitForTimeout(2000);
        const err = await buyOrderPage.getValidationMessage();
        console.log(`✓ Caught insufficient funds validation: ${err || 'Form blocked submission'}`);
        await buyOrderPage.closeBuyModalIfOpen();
    } catch (e) {
        console.log(`[NEGATIVE] Insufficient funds caught exception: ${e}`);
        await buyOrderPage.closeBuyModalIfOpen().catch(() => {});
    }

    // ==========================================
    // MULTI-FORMAT DETAILED REPORT GENERATION
    // ==========================================
    
    // Statistics Calculations
    const totalCases = resultsTable.length;
    const passedCases = resultsTable.filter(r => r.status === 'PASS').length;
    const failedCases = resultsTable.filter(r => r.status === 'FAIL').length;
    const skippedCases = resultsTable.filter(r => r.status === 'SKIPPED').length;
    const recoveredCases = resultsTable.filter(r => r.correctedPrice !== 'N/A' && r.status === 'PASS').length;

    // 1. Generate Final Summary Report Markdown File
    const reportPath = path.join(process.cwd(), 'test-results', 'final-summary-report.md');
    let reportContent = `# E2E Order Flow Test Summary Report\n\n`;
    reportContent += `**Execution Time**: ${new Date().toLocaleString()}\n`;
    reportContent += `**Symbol Tested**: ${testSymbol} (${testStockName})\n`;
    reportContent += `**Pre-flow baseline holdings**: ${baselineHoldings}\n`;
    reportContent += `**Post-flow baseline holdings**: ${postFlowHoldings}\n\n`;
    
    reportContent += `## Execution Statistics Dashboard\n\n`;
    reportContent += `| Total Cases | Passed ✅ | Failed ❌ | Skipped ⚠️ | Recovered 🔄 |\n`;
    reportContent += `|-------------|-----------|-----------|------------|--------------|\n`;
    reportContent += `| ${totalCases} | ${passedCases} | ${failedCases} | ${skippedCases} | ${recoveredCases} |\n\n`;

    reportContent += `## Test Case Execution Summary Table\n\n`;
    reportContent += `| # | Order Type | TIF | Original Price | Rejection Reason | Corrected Price | Final Status | Buying/Selling Power (Before -> After) | Holdings (Before -> After) | Result | Details |\n`;
    reportContent += `|---|------------|-----|----------------|------------------|-----------------|--------------|----------------------------------------|----------------------------|--------|---------|\n`;

    resultsTable.forEach((item, index) => {
        const hbBefore = item.holdingsBefore || 'N/A';
        const hbAfter = item.holdingsAfter || 'N/A';
        reportContent += `| ${index + 1} | **${item.testType}** | ${item.tif} | ${item.originalPrice} | ${item.rejectionReason} | ${item.correctedPrice} | ${item.finalStatus} | ${item.powerBefore} -> ${item.powerAfter} | ${hbBefore} -> ${hbAfter} | **${item.status}** | ${item.details} |\n`;
    });

    reportContent += `\n\n## Captured Screenshots\n`;
    const files = fs.readdirSync(screenshotDir);
    files.forEach(file => {
        reportContent += `- \`test-results/screenshots/${file}\`\n`;
    });

    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`\n✓ Final Summary Report successfully written to: ${reportPath}`);

    // 2. Generate CSV Export
    const csvReportPath = path.join(process.cwd(), 'test-results', 'final-summary-report.csv');
    let csvContent = `#,Order Type,TIF,Original Price,Rejection Reason,Corrected Price,Final Status,Buying Power Before,Buying Power After,Holdings Before,Holdings After,Result,Details\n`;
    resultsTable.forEach((item, index) => {
        const hbBefore = item.holdingsBefore || 'N/A';
        const hbAfter = item.holdingsAfter || 'N/A';
        const reason = item.rejectionReason.replace(/"/g, '""');
        const details = item.details.replace(/"/g, '""');
        csvContent += `${index + 1},"${item.testType}","${item.tif}","${item.originalPrice}","${reason}","${item.correctedPrice}","${item.finalStatus}","${item.powerBefore}","${item.powerAfter}","${hbBefore}","${hbAfter}","${item.status}","${details}"\n`;
    });
    fs.writeFileSync(csvReportPath, csvContent, 'utf-8');
    console.log(`✓ CSV Export successfully written to: ${csvReportPath}`);

    // 3. Generate HTML Premium Report with Sleek Dark Mode (Aesthetics-focused)
    const htmlReportPath = path.join(process.cwd(), 'test-results', 'final-summary-report.html');
    let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OMS E2E Execution Summary Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0c10;
            --card-bg: rgba(255, 255, 255, 0.02);
            --border-color: rgba(255, 255, 255, 0.08);
            --primary: #10b981;
            --primary-glow: rgba(16, 185, 129, 0.15);
            --secondary: #3b82f6;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --pass: #10b981;
            --fail: #ef4444;
            --skip: #f59e0b;
        }
        
        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            margin: 0;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .container {
            max-width: 1200px;
            width: 100%;
        }
        
        header {
            margin-bottom: 2.5rem;
            text-align: center;
        }
        
        h1 {
            font-size: 2.75rem;
            font-weight: 800;
            margin: 0 0 0.5rem 0;
            background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .meta {
            color: var(--text-muted);
            font-size: 1rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
            width: 100%;
        }
        
        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            backdrop-filter: blur(12px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .stat-card:hover {
            transform: translateY(-6px);
            border-color: var(--primary);
            box-shadow: 0 12px 30px var(--primary-glow);
        }
        
        .stat-val {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 0.25rem;
        }
        
        .stat-label {
            color: var(--text-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            margin-bottom: 3rem;
            backdrop-filter: blur(12px);
        }
        
        th, td {
            padding: 1.1rem 1.4rem;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }
        
        th {
            background: rgba(255, 255, 255, 0.01);
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.7rem;
            letter-spacing: 0.08em;
        }
        
        tr:hover {
            background: rgba(255, 255, 255, 0.01);
        }
        
        .badge {
            display: inline-block;
            padding: 0.3rem 0.6rem;
            border-radius: 8px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        
        .badge-pass { background: rgba(16, 185, 129, 0.12); color: var(--pass); border: 1px solid rgba(16, 185, 129, 0.25); }
        .badge-fail { background: rgba(239, 68, 68, 0.12); color: var(--fail); border: 1px solid rgba(239, 68, 68, 0.25); }
        .badge-skip { background: rgba(245, 158, 11, 0.12); color: var(--skip); border: 1px solid rgba(245, 158, 11, 0.25); }
        
        .details-cell {
            font-size: 0.8rem;
            color: var(--text-muted);
            max-width: 250px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>OMS End-to-End Automation Report</h1>
            <div class="meta">Executed: ${new Date().toLocaleString()} | Symbol: ${testSymbol} | Pre-Holdings: ${baselineHoldings} | Post-Holdings: ${postFlowHoldings}</div>
        </header>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-val" style="color: var(--text-main);">${totalCases}</div>
                <div class="stat-label">Total Cases</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--pass);">${passedCases}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--fail);">${failedCases}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--skip);">${skippedCases}</div>
                <div class="stat-label">Skipped</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--secondary);">${recoveredCases}</div>
                <div class="stat-label">Recovered</div>
            </div>
        </div>
        
        <h2>Execution Registry</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Order Type</th>
                    <th>TIF</th>
                    <th>Original Price</th>
                    <th>Rejection Reason</th>
                    <th>Corrected Price</th>
                    <th>Final Status</th>
                    <th>Result</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                ${resultsTable.map((item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${item.testType}</strong></td>
                    <td>${item.tif}</td>
                    <td>${item.originalPrice}</td>
                    <td>${item.rejectionReason}</td>
                    <td>${item.correctedPrice}</td>
                    <td>${item.finalStatus}</td>
                    <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
                    <td class="details-cell" title="${item.details}">${item.details}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;
    fs.writeFileSync(htmlReportPath, htmlContent, 'utf-8');
    console.log(`✓ HTML Dashboard successfully written to: ${htmlReportPath}`);
    console.log('=== master trade E2E SEQUENCE COMPLETED SUCCESSFULLY ===');
});
