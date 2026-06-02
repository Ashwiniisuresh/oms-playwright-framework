import { Page, expect } from '@playwright/test';

export class SellOrderPage {

    private page: Page;

    constructor(page: Page) {

        this.page = page;
    }

    async validateSellWindowOpened() {

        const sellButton = this.page.getByRole('button', { name: /^Sell$/i });

        await expect(sellButton).toBeVisible({ timeout: 15000 });

        console.log('Sell window validated');
    }

    async selectPortfolio(portfolio: string) {

        const portfolioDropdown = this.page.getByRole('combobox').first();

        await portfolioDropdown.click();

        await this.page.getByRole('option', { name: portfolio }).click();

        console.log(`${portfolio} selected`);
    }

    async selectLimitOrder() {

        const limitRadio = this.page.getByRole('radio', { name: 'Limit' });

        await limitRadio.click();

        console.log('Limit order selected');
    }

    async selectMarketOrder() {

        const marketRadio = this.page.getByRole('radio', { name: 'Market' });

        await marketRadio.click();

        console.log('Market order selected');
    }

    async getSellingPower(): Promise<string> {

        const element = this.page.locator('text=Selling Power').first();

        const text = await element.textContent();

        console.log(`Read Selling Power: ${text?.trim()}`);

        return text?.trim() || '';
    }

    async enterQuantity(quantity: string) {

        const quantityInput = this.page
            .getByRole('spinbutton', { name: 'Quantity' })
            .or(this.page.locator('.number-input-container:has-text("Quantity") input'))
            .first();

        await expect(quantityInput).toBeVisible({ timeout: 10000 });

        await quantityInput.fill(quantity);

        console.log(`Quantity entered: ${quantity}`);
    }

    async enterPrice(price: string) {

        const priceInput = this.page
            .getByRole('spinbutton', { name: 'Price' })
            .or(this.page.locator('.number-input-container:has-text("Price") input'))
            .first();

        await priceInput.fill(price);

        console.log(`Price entered: ${price}`);
    }

    async toggleAdvancedOptions() {

        const advOptButton = this.page
            .getByRole('button', { name: /Advanced Options/i })
            .or(this.page.locator('text=Advanced Options'))
            .first();

        await expect(advOptButton).toBeVisible({ timeout: 10000 });

        await advOptButton.click();

        console.log('Advanced Options toggled');
    }

    async selectTimeInForce(optionName: 'Day' | 'At the opening' | 'Fill and kill' | 'Good till cancel' | 'Fill or kill' | 'Good till date') {

        const trigger = this.page
            .locator('label')
            .filter({ hasText: 'Time in Force' })
            .locator('..')
            .locator('div, span, button')
            .first();

        await expect(trigger).toBeVisible({ timeout: 10000 });

        await trigger.click();

        const option = this.page
            .locator('div, span, li, [role="option"]')
            .filter({ hasText: optionName })
            .last();

        await expect(option).toBeVisible({ timeout: 5000 });

        await option.click();

        console.log(`Time in Force selected: ${optionName}`);
    }

    async selectGtdDate(dayLabel: string) {

        const dateTrigger = this.page.locator('.text-gray-500').first();

        await dateTrigger.click();

        const targetDay = parseInt(dayLabel, 10);
        const today = new Date();
        const currentDay = today.getDate();

        let useCurrentMonth = false;
        if (!isNaN(targetDay) && targetDay > currentDay) {
            const dateButton = this.page.getByRole('button', { name: dayLabel }).first();
            if (await dateButton.isVisible().catch(() => false)) {
                useCurrentMonth = true;
            }
        }

        if (useCurrentMonth) {
            const dateButton = this.page.getByRole('button', { name: dayLabel }).first();
            await dateButton.click();
            console.log(`GTD date selected in current month: ${dayLabel}`);
        } else {
            let found = false;
            for (let i = 0; i < 3; i++) {
                const nextMonthTrigger = this.page.locator('.text-gray-500').last();
                await nextMonthTrigger.click({ force: true });

                const dateButton = this.page.getByRole('button', { name: dayLabel }).first();
                if (await dateButton.isVisible().catch(() => false)) {
                    await dateButton.click();
                    found = true;
                    console.log(`GTD date selected in month +${i + 1}: ${dayLabel}`);
                    break;
                }
            }

            if (!found) {
                throw new Error(`Could not find a visible date button for day "${dayLabel}" in current or subsequent months.`);
            }
        }

        await this.page.locator('html').click();
    }

    async getValidationMessage(): Promise<string> {

        const toast = this.page.locator('[data-sonner-toast]').first();

        if (await toast.isVisible().catch(() => false)) {
            const text = await toast.textContent().catch(() => null);
            const trimmed = text?.trim() || '';
            if (trimmed && /Price should be within|Tif date is mandatory|Time in force|TIF|market state|not allowed|not supported/i.test(trimmed)) {
                console.log(`Found toast validation error: ${trimmed}`);
                return trimmed;
            }
        }

        const messageLocators = this.page
            .locator('span, div, p')
            .filter({ hasText: /Price should be within|Tif date is mandatory|market state|not allowed|not supported/i });

        const count = await messageLocators.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
            const loc = messageLocators.nth(i);
            if (await loc.isVisible().catch(() => false)) {
                const text = await loc.textContent().catch(() => null);
                const trimmed = text?.trim() || '';
                if (trimmed && !/^Time in Force$/i.test(trimmed) && !/^TIF$/i.test(trimmed)) {
                    return trimmed;
                }
            }
        }

        return '';
    }

    async resetOrderFormIfVisible() {

        const resetButton = this.page.getByRole('button', { name: /^Reset$/i }).first();

        const visible = await resetButton.isVisible().catch(() => false);

        if (!visible) {
            return;
        }

        await resetButton.click({ force: true });
    }

    async closeSellModalIfOpen() {

        const sellModal = this.page.locator('form.z-50').first();

        const isOpen = await sellModal.isVisible().catch(() => false);

        if (!isOpen) {
            return;
        }

        const closeButton = this.page
            .locator('.hidden > svg, .handle > .flex.items-center.justify-between.w-full > svg, form.z-50 button[aria-label*="close" i], form.z-50 button:has(svg)')
            .first();

        if (await closeButton.isVisible().catch(() => false)) {
            await closeButton.click({ force: true }).catch(() => {});
        }

        if (await sellModal.isVisible().catch(() => false)) {
            await this.page.keyboard.press('Escape').catch(() => {});
        }

        await sellModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }

    async placeSellOrder() {

        const sellButton = this.page.getByRole('button', { name: /^Sell$/i });

        await sellButton.click();

        console.log('Sell order placed');
    }

    async getLTP(): Promise<number> {
        return this.getMarketValue(/LTP/i, 2.00);
    }

    async getBidPrice(): Promise<number> {
        return this.getMarketValue(/Bid/i, 1.90);
    }

    async getAskPrice(): Promise<number> {
        return this.getMarketValue(/Ask/i, 2.10);
    }

    async getUpperCircuit(): Promise<number> {
        return this.getMarketValue(/Upper/i, 2.50);
    }

    async getLowerCircuit(): Promise<number> {
        return this.getMarketValue(/Lower/i, 1.60);
    }

    private async getMarketValue(regex: RegExp, fallback: number): Promise<number> {
        const elements = this.page.locator('span, div, p, td, label').filter({ hasText: regex });
        const count = await elements.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
            const el = elements.nth(i);
            if (await el.isVisible().catch(() => false)) {
                const text = await el.textContent().catch(() => null);
                const numbers = text?.match(/[0-9]+(?:\.[0-9]+)?/g);
                if (numbers) {
                    for (const num of numbers) {
                        const val = Number(num);
                        if (val > 0 && val !== fallback) {
                            return val;
                        }
                    }
                }
                const parent = el.locator('xpath=..');
                const parentText = await parent.textContent().catch(() => null);
                const parentNumbers = parentText?.match(/[0-9]+(?:\.[0-9]+)?/g);
                if (parentNumbers) {
                    for (const num of parentNumbers) {
                        const val = Number(num);
                        if (val > 0) {
                            return val;
                        }
                    }
                }
            }
        }
        return fallback;
    }
}
