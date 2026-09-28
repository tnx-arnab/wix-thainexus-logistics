import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardReturnUrl, shipmentPayReturnUrl } from './checkoutReturn.js';

const APP = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

test('keeps the Wix dashboard page where Pay was clicked', () => {
    const page = 'https://manage.wix.com/dashboard/site-123/app/app-1?x=1';
    assert.equal(dashboardReturnUrl(page), page);
    assert.equal(
        shipmentPayReturnUrl({
            requested: page,
            metaSiteId: 'other-site',
            appId: APP,
            appUrl: 'https://wix.thainexus.co.th',
        }),
        page
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
    assert.equal(dashboardReturnUrl('javascript:alert(1)'), null);
    assert.equal(
        shipmentPayReturnUrl({
            requested: 'https://evil.example/dashboard',
            appUrl: 'https://wix.thainexus.co.th',
        }),
        'https://wix.thainexus.co.th/?tab=shipments'
    );
});
