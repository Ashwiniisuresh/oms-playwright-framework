import { Page, Locator, expect } from '@playwright/test';

export class OtpPage {

    private page: Page;

    otpInput: Locator;

    submitButton: Locator;

    constructor(page: Page) {

        this.page = page;

        this.otpInput = this.page.getByRole('textbox', {
            name: /otp/i
        });

        this.submitButton = this.page.getByRole('button', {
            name: /submit/i
        });
    }

    async enterOtp(otp: string) {

        await this.otpInput.fill(otp);

        await this.submitButton.click();
    }

    async validateOtpPageLoaded() {

        await expect(this.otpInput).toBeVisible({
            timeout: 15000
        });
    }
}