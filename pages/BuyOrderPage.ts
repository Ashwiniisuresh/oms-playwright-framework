import { Page, expect } from '@playwright/test';

export class BuyOrderPage {

    private page: Page;

    constructor(page: Page) {

        this.page = page;
    }

    async validateBuyWindowOpened() {

        const buyButton = this.page
            .getByRole('button', {
                name: /^Buy$/i
            });

        await expect(buyButton)
            .toBeVisible({
                timeout: 15000
            });

        console.log('Buy window validated');
    }

    async selectPortfolio(portfolio: string) {

        const portfolioDropdown = this.page
            .getByRole('combobox')
            .first();

        await portfolioDropdown.click();

        await this.page
            .getByText(portfolio)
            .filter({ visible: true })
            .first()
            .click();

        console.log(`${portfolio} selected`);
    }

    async selectLimitOrder() {

        const limitRadio = this.page
            .getByRole('radio', {
                name: 'Limit'
            });

        await limitRadio.click();

        console.log('Limit order selected');
    }

    async selectMarketOrder() {

        const marketRadio = this.page
            .getByRole('radio', {
                name: 'Market'
            });

        await marketRadio.click();

        console.log('Market order selected');
    }

    async getNetAmount(): Promise<string> {

        const element = this.page.locator('text=Net Amount').first();

        const text = await element.textContent();

        console.log(`Read Net Amount: ${text?.trim()}`);

        return text?.trim() || '';
    }

    async getBuyingPower(): Promise<string> {

        const element = this.page.locator('text=Buying Power').first();

        const text = await element.textContent();

        console.log(`Read Buying Power: ${text?.trim()}`);

        return text?.trim() || '';
    }

    async enterQuantity(quantity: string) {

        const quantityInput = this.page
            .getByRole('spinbutton', {
                name: 'Quantity'
            })
            .or(this.page.locator('.number-input-container:has-text("Quantity") input'))
            .first();

        await expect(quantityInput).toBeVisible({ timeout: 10000 });

        await quantityInput.fill(quantity);

        console.log(`Quantity entered: ${quantity}`);
    }

    async enterPrice(price: string) {

        const priceInput = this.page
            .getByRole('spinbutton', {
                name: 'Price'
            })
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

        await this.page.waitForTimeout(500); // let dropdown list animate

        const option = this.page
            .locator('div, span, li, [role="option"]')
            .filter({ hasText: optionName })
            .last();

        await expect(option).toBeVisible({ timeout: 5000 });

        await option.click();

        console.log(`Time in Force selected: ${optionName}`);
    }

    async placeBuyOrder() {

        const buyButton = this.page
            .getByRole('button', {
                name: /^Buy$/i
            });

        await buyButton.click();

        console.log('Buy order placed');
    }
}