import { LoginPage } from '../pages/LoginPage';

import { OtpPage } from '../pages/OtpPage';

import { users } from '../fixtures/users';

export async function loginFlow(
    loginPage: LoginPage,
    otpPage: OtpPage
) {

    await loginPage.gotoLoginPage();

    await loginPage.validateLoginPageLoaded();

    await loginPage.login(
        users.validUser.username,
        users.validUser.password
    );

    await otpPage.validateOtpPageLoaded();

    await otpPage.enterOtp(
        users.validUser.otp
    );
}