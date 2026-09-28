import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardReturnUrl, sameCheckoutReturn, shipmentPayReturnUrl } from './checkoutReturn.js';

const APP = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

test('keeps the Wix dashboard page where Pay was clicked', () => {
    const page = 'https://manage.wix.com/dashboard/site-123/app/app-1?instance=secret#token';
    const clean = 'https://manage.wix.com/dashboard/site-123/app/app-1';
    assert.equal(dashboardReturnUrl(page), clean);
    assert.equal(
        shipmentPayReturnUrl({
            requested: page,
            metaSiteId: 'other-site',
            appId: APP,
            appUrl: 'https://wix.thainexus.co.th',
        }),
        clean
    );
});

test('builds the dashboard app page from the installed site', () => {
    assert.equal(
        shipmentPayReturnUrl({
            metaSiteId: 'meta-site-1',
            appId: APP,
            appUrl: 'https://wix.thainexus.co.th/',
        }),
        `https://manage.wix.com/dashboard/meta-site-1/app/${APP}`
    );
});

test('rejects non-dashboard return targets', () => {
    assert.equal(dashboardReturnUrl('https://evil.example/?billing=paid'), null);
    assert.equal(dashboardReturnUrl('https://manage.wix.com/account/custom-apps'), null);
    assert.equal(dashboardReturnUrl('https://manage.wix.com/'), null);
    assert.equal(dashboardReturnUrl('https://manage.wix.com.evil.com/dashboard/site-12345'), null);
    assert.equal(dashboardReturnUrl('https://files.wix.com/dashboard/site-12345'), null);
    assert.equal(dashboardReturnUrl('javascript:alert(1)'), null);
    assert.equal(
        shipmentPayReturnUrl({
            requested: 'https://evil.example/dashboard/site-12345',
            metaSiteId: '../evil',
            appId: APP,
            appUrl: 'https://wix.thainexus.co.th',
        }),
        'https://wix.thainexus.co.th/?tab=shipments'
    );
    const dashboard = `https://manage.wix.com/dashboard/meta-site-1/app/${APP}`;
    assert.equal(sameCheckoutReturn(`${dashboard}?instance=secret`, dashboard), true);
    assert.equal(sameCheckoutReturn('https://wix.thainexus.co.th/?tab=shipments', dashboard), false);
});
