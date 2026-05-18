import { Page, expect } from '@playwright/test';

export class OrdersPage {

    private page: Page;

    constructor(page: Page) {

        this.page = page;
    }

    async gotoOrdersPage() {

        const ordersLink = this.page.getByRole('link', { name: 'Orders' });

        if (await ordersLink.isVisible().catch(() => false)) {

            await ordersLink.click();

        } else {

            await this.page.goto('orders', { waitUntil: 'domcontentloaded' });
        }

        // Wait for order category or symbol column headers to stabilize
        await expect(this.page.locator('text=Order Side').first()).toBeVisible({ timeout: 20000 });

        console.log('Orders page loaded');
    }

    async selectTab(tabName: 'Open' | 'Executed' | 'Rejected') {

        // Locate tab using partial text matching or direct matching (e.g. "Open 2", "Rejected 11")
        const tabButton = this.page
            .getByText(tabName)
            .first();

        await expect(tabButton).toBeVisible({ timeout: 15000 });

        await tabButton.click();

        await this.page.waitForTimeout(2000); // Let the tab transition and load data

        console.log(`Tab ${tabName} selected`);
    }

    async verifyOrderExists(symbol: string, side: 'BUY' | 'SELL', category: string): Promise<string> {

        // Find row that contains the symbol (e.g., "1030" or "1010")
        const row = this.page
            .locator('table tbody tr')
            .filter({ hasText: symbol })
            .first();

        await expect(row).toBeVisible({ timeout: 15000 });

        // Assert Side and Category are present in the row
        await expect(row.getByText(side)).toBeVisible();

        await expect(row.getByText(category)).toBeVisible();

        // Retrieve and log the status (e.g. Queued, Rejected, Executed, etc.)
        const statusElement = row.locator('td').nth(1); // column 2 (Symbol=col0, Status=col1)
        const status = await statusElement.textContent();

        const orderNum = await row.locator('td').nth(4).textContent(); // column 5 (Order Number)

        console.log(`Order for ${symbol} found (Order #${orderNum?.trim()}). Status: ${status?.trim()}`);

        return status?.trim() || '';
    }
}
