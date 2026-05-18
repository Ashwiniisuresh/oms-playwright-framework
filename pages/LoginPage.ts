import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {

    private page: Page;

    usernameInput: Locator;

    passwordInput: Locator;

    saveAccountCheckbox: Locator;

    loginButton: Locator;

    constructor(page: Page) {

        this.page = page;

        this.usernameInput = page.getByRole('textbox', {
            name: 'userName'
        });

        this.passwordInput = page.locator('input[name=\"password\"]');

        this.saveAccountCheckbox = page.getByRole('checkbox', {
            name: 'Save Account'
        });

        this.loginButton = page.locator('button:has-text("LOGIN")');
    }

    async gotoLoginPage() {

        const preloginResponse = this.page.waitForResponse(response =>
            response.url().includes('/api/preauth/prelogin') &&
            response.request().method() === 'POST' &&
            response.ok()
        );

        await this.page.goto('login');
        await preloginResponse;
        console.log(await this.page.url());
    }

    async login(username: string, password: string) {

        await this.usernameInput.fill(username);

        await this.passwordInput.fill(password);

        await this.saveAccountCheckbox.check();

        await this.loginButton.click();
    }

    async validateLoginPageLoaded() {

        await expect(this.loginButton).toBeVisible();
    }
}