import { Page, expect } from '@playwright/test';

export class HoldingsPage {

    private page: Page;

    constructor(page: Page) {

        this.page = page;
    }

    async gotoHoldingsPage() {

        const holdingsLink = this.page.getByRole('link', { name: 'Holdings' });

        if (await holdingsLink.isVisible().catch(() => false)) {

            await holdingsLink.click({ force: true });

        } else {

            await this.page.goto('holdings', { waitUntil: 'domcontentloaded' });
        }

        await expect(this.page.locator('text=Equity Portfolio').first()).toBeVisible({ timeout: 20000 });

        console.log('Holdings page loaded');
    }

    async getStockHolding(stockCode: string): Promise<number> {

        const row = this.page
            .locator('table tbody tr')
            .filter({ hasText: stockCode })
            .first();

        // Wait up to 3 seconds for the stock row to be visible in the table.
        // If the stock is not currently held, it won't appear, and we can immediately return 0.
        const isVisible = await expect(row).toBeVisible({ timeout: 3000 })
            .then(() => true)
            .catch(() => false);

        if (!isVisible) {
            console.log(`Stock ${stockCode} holdings: 0 (not found in holdings table)`);
            return 0;
        }

        const holdingCell = row.locator('td').nth(1);
        const holdings = await holdingCell.textContent();
        const holdingValue = Number(holdings?.replace(/,/g, ''));

        console.log(`Stock ${stockCode} holdings: ${holdingValue}`);

        return holdingValue;
    }

    async validateHoldingsDecreased(stockCode: string, previousHolding: number) {

        const currentHolding = await this.getStockHolding(stockCode);

        expect(currentHolding).toBeLessThan(previousHolding);

        console.log(`✓ Holdings decreased from ${previousHolding} to ${currentHolding}`);

        return currentHolding;
    }

    async validateHoldingsUnchanged(stockCode: string, previousHolding: number) {

        const currentHolding = await this.getStockHolding(stockCode);

        expect(currentHolding).toBe(previousHolding);

        console.log(`✓ Holdings unchanged at ${currentHolding}`);

        return currentHolding;
    }
}
