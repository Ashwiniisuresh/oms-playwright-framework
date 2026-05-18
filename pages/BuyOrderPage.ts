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

    async enterPrice(price: string) {

        const priceInput = this.page
            .getByRole('spinbutton', {
                name: 'Price'
            });

        await priceInput.fill(price);

        console.log(`Price entered: ${price}`);
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