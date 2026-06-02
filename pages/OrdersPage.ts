import { Page, expect } from '@playwright/test';

export class OrdersPage {

    private page: Page;

    private readonly categoryLabels = {
        MKRT: 'Market',
        LMT: 'Limit'
    } as const;

    constructor(page: Page) {

        this.page = page;
    }

    async gotoOrdersPage() {

        const ordersLink = this.page.getByRole('link', { name: 'Orders' });

        if (await ordersLink.isVisible().catch(() => false)) {

            await ordersLink.click({ force: true });

        } else {

            await this.page.goto('orders', { waitUntil: 'domcontentloaded' });
        }

        // Wait for order category or symbol column headers to stabilize
        await expect(this.page.locator('text=Order Side').first()).toBeVisible({ timeout: 20000 });

        console.log('Orders page loaded');
    }

    async selectTab(tabName: 'Open' | 'Executed' | 'Rejected') {

        // Use exact matching so we do not click row text like "Market Rejected".
        const tabButton = this.page
            .getByText(tabName, { exact: true })
            .first();

        await expect(tabButton).toBeVisible({ timeout: 15000 });

        await tabButton.click({ force: true });

        // Wait for table rows to load after tab change, or fallback after 1 second if the tab is empty.
        await Promise.race([
            expect(this.page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 }),
            this.page.waitForTimeout(1000)
        ]).catch(() => {});

        console.log(`Tab ${tabName} selected`);
    }

    async verifyOrderExists(symbol: string, side: 'BUY' | 'SELL', category: 'MKRT' | 'LMT', options?: { timeout?: number }): Promise<string> {

        const displayCategory = this.categoryLabels[category];

        // Find row that contains the symbol, the correct side, and the correct category
        const row = this.page
            .locator('table tbody tr')
            .filter({ hasText: symbol })
            .filter({
                has: this.page.locator('td').nth(2).filter({ hasText: new RegExp(`^${side}$`, 'i') })
            })
            .filter({
                has: this.page.locator('td').nth(3).filter({ hasText: new RegExp(`^${displayCategory}$`, 'i') })
            })
            .first();

        await expect(row).toBeVisible({ timeout: options?.timeout ?? 15000 });

        // Assert fixed columns directly so status text like "Market Rejected" does not interfere.
        const symbolCell = row.locator('td').nth(0);
        const statusCell = row.locator('td').nth(1);
        const sideCell = row.locator('td').nth(2);
        const categoryCell = row.locator('td').nth(3);
        const orderNumberCell = row.locator('td').nth(4);

        await expect(symbolCell).toContainText(symbol, { timeout: 15000 });
        await expect(sideCell).toHaveText(side, { timeout: 15000 });
        await expect(categoryCell).toHaveText(displayCategory, { timeout: 15000, ignoreCase: true });

        // Retrieve and log the status (e.g. Queued, Rejected, Executed, etc.)
        const status = await statusCell.textContent();
        const orderNum = await orderNumberCell.textContent();

        const normalizedStatus = this.normalizeStatus(status);

        console.log(`Order for ${symbol} found (Order #${orderNum?.trim()}). Status: ${normalizedStatus}`);

        return normalizedStatus;
    }

    private normalizeStatus(status: string | null): string {

        const value = status?.trim() || '';

        if (/rejected/i.test(value)) {

            return 'Rejected';
        }

        if (/executed/i.test(value)) {

            return 'Executed';
        }

        if (/open/i.test(value)) {

            return 'Open';
        }

        return value;
    }
}
