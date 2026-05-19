import { Page, Locator, expect } from '@playwright/test';

export class WatchlistPage {

    private page: Page;

    

    watchlistInput: Locator;

    addWatchlistButton: Locator;

    stockSearchInput: Locator;

    // addButton: Locator;

    watchlistTabs: Locator;

    searchResults: Locator;

    stockRows: Locator;

    constructor(page: Page) {

        this.page = page;



        // Watchlist Name Input
        this.watchlistInput = page.locator('#rename-input');

        // Create Watchlist Button
        this.addWatchlistButton = page.getByRole('button', {
            name: /create watchlist/i
        });

        // Stock Search Input
        this.stockSearchInput = page.getByRole('textbox').first();

        // Add Stock Button
//        this.addButton = page.getByRole('button', {
//     name: /^Add$/i
// }).last();

        // Watchlist Tabs
        this.watchlistTabs = page.locator('button');

        // Search Results
        this.searchResults = page.locator('[role=\"option\"]');

        // Stock Rows
        this.stockRows = page.locator('table tbody tr');
    }

async gotoWatchlistPage() {
    const watchlistLink = this.page.getByRole('link', { name: 'Watchlist' });
    if (await watchlistLink.isVisible().catch(() => false)) {
        await watchlistLink.click();
    } else {
        await this.page.goto('watchlist', { waitUntil: 'domcontentloaded' });
    }
    await expect(this.stockSearchInput).toBeVisible({ timeout: 15000 });
}
    async validateWatchlistPageLoaded() {

        await expect(this.stockSearchInput).toBeVisible();
    }

async createWatchlist(watchlistName: string) {

    const existingWatchlist = this.page
        .getByText(watchlistName)
        .first();

    const alreadyExists = await existingWatchlist
        .isVisible()
        .catch(() => false);

    if (alreadyExists) {

        console.log(`${watchlistName} already exists`);

        return;
    }

    // STEP 1 → Click Plus Icon
    const createIcon = this.page
        .locator('.\\!h-\\[18px\\] > svg')
        .first();

    await expect(createIcon).toBeVisible({
        timeout: 15000
    });

    await createIcon.click();

    // STEP 2 → Click Create Watchlist Button inside popup
    const createWatchlistButton = this.page
        .getByRole('button', {
            name: /create watchlist/i
        });

    await expect(createWatchlistButton)
        .toBeVisible({
            timeout: 15000
        });

    await createWatchlistButton.click();

    // STEP 3 → Wait Input
    const input = this.page
        .locator('#rename-input');

    await expect(input).toBeVisible({
        timeout: 15000
    });

    // STEP 4 → Fill Name
    await input.fill(watchlistName);

    // STEP 5 → Save
    const saveButton = this.page
        .getByRole('button', {
            name: /save/i
        });

    await saveButton.click();

    // Close popup
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(1000);

    // STEP 6 → Validate the created watchlist using flexible text matching
    const watchlist = this.page.locator('text=' + watchlistName).first();

    await expect(watchlist)
        .toBeVisible({
            timeout: 20000
        });
}
    async validateWatchlistCreated(watchlistName: string) {

        const watchlist = this.page.locator(
            `text=${watchlistName}`
        ).first();

        await expect(watchlist).toBeVisible();
    }
    async getWatchlistCount(watchlistName: string) {

    return await this.page
        .getByText(watchlistName)
        .count();
}
async searchStock(stock: string) {

    await this.stockSearchInput.click();

    await this.stockSearchInput.fill('');

    await this.page.waitForTimeout(500);

    await this.stockSearchInput.pressSequentially(stock, {
        delay: 100
    });

    await this.page.waitForTimeout(3000);
}

async selectStock(stockName: string) {

    const stock = this.page
        .getByText(stockName)
        .first();

    await expect(stock)
        .toBeVisible({
            timeout: 15000
        });

    await stock.click();

    console.log(`${stockName} selected`);
}
async addStock() {

    const addButton = this.page
        .locator('.w-7 > .text-primary')
        .first();

    await expect(addButton)
        .toBeVisible({
            timeout: 30000
        });

    await addButton.click({
        force: true
    });

    console.log('Stock added');

    // Close popup if overlay appears
    const overlay = this.page
        .locator('.fixed')
        .first();

    if (await overlay.isVisible().catch(() => false)) {

        await overlay.click({
            force: true
        });
    }

    await this.page.waitForTimeout(3000);
}
async validateStockAdded(stockCode: string) {

    const stockRow = this.page
        .getByText(stockCode)
        .first();

    await expect(stockRow)
        .toBeVisible({
            timeout: 20000
        });
}

async addStockIfNotExist(stockCode: string, stockName: string) {

    // Allow UI table to fully fetch and render its rows
    await this.page.waitForTimeout(3000);

    const isPresent = await this.page
        .getByText(stockCode)
        .first()
        .isVisible()
        .catch(() => false);

    if (isPresent) {

        console.log(`Stock ${stockCode} (${stockName}) is already present in this watchlist. Skipping add.`);

        return;
    }

    console.log(`Stock ${stockCode} not found in watchlist. Adding it now.`);

    await this.searchStock(stockCode);

    await this.selectStock(stockName);

    await this.addStock();

    await this.validateStockAdded(stockCode);
}

async selectWatchlist(watchlistName: string) {

    // Wait small stabilization
    await this.page.waitForTimeout(2000);

    // Press Escape to close overlay/backdrop
    await this.page.keyboard.press('Escape');

    // Small wait again
    await this.page.waitForTimeout(1000);

    const watchlistTab = this.page
        .getByText(watchlistName)
        .first();

    await expect(watchlistTab)
        .toBeVisible({
            timeout: 15000
        });

    // Force click because Angular overlays are flaky
    await watchlistTab.click({
        force: true
    });

    await this.page.waitForTimeout(2000);
}
async openBuyWindow() {

    const row = this.page
        .locator('table tbody tr')
        .first();

    // Hover over the row to reveal action buttons
    await row.hover();

    const buyIcon = row
        .locator('img')
        .first();

    await expect(buyIcon)
        .toBeVisible({
            timeout: 30000
        });

    await buyIcon.click({
        force: true
    });

    console.log('Buy window opened');
}
}