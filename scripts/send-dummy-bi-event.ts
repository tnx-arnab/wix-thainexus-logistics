import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(filePath: string) {
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = val;
        }
    }
}

// Load .dev.vars then .env
loadEnvFile(resolve(process.cwd(), '.dev.vars'));
loadEnvFile(resolve(process.cwd(), '.env'));

const appId = process.env.WIX_APP_ID;
const appSecret = process.env.WIX_APP_SECRET;

const instanceIdArg = process.argv.slice(2).find((arg) => !arg.startsWith('-')) || process.env.TEST_INSTANCE_ID;

if (!appId || !appSecret) {
    console.error('Error: WIX_APP_ID or WIX_APP_SECRET missing in .dev.vars / .env');
    process.exit(1);
}

if (!instanceIdArg) {
    console.log('Usage: npx tsx scripts/send-dummy-bi-event.ts <TEST_SITE_INSTANCE_ID>');
    console.log('Example: npx tsx scripts/send-dummy-bi-event.ts e298a851-93bf-4d37-8fb1-cba19cf1e050');
    process.exit(1);
}

async function run() {
    console.log('--- Step 1: Minting Wix Access Token via Easy OAuth ---');
    console.log('App ID:', appId);
    console.log('Instance ID:', instanceIdArg);

    const tokenRes = await fetch('https://www.wixapis.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: appId,
            client_secret: appSecret,
            instance_id: instanceIdArg,
        }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
        console.error('Failed to mint Wix access token:', tokenRes.status, tokenData);
        process.exit(1);
    }

    const accessToken = tokenData.access_token;
    console.log('✓ Successfully minted access token (expires in ' + tokenData.expires_in + 's)');

    console.log('\n--- Step 2: Sending Dummy BI Event to Wix ---');
    const dummyEvent = {
        event: {
            created_date: new Date().toISOString(),
            billing_type: 'CHARGE',
            gross_revenue: '100.00',
            net_revenue: '20.00',
            wix_share: '4.00',
        },
    };

    console.log('Payload:', JSON.stringify(dummyEvent, null, 2));

    const biRes = await fetch('https://www.wixapis.com/apps/v1/billing-event', {
        method: 'POST',
        headers: {
            'Authorization': accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dummyEvent),
    });

    const biData = await biRes.text();
    console.log('\nResponse Status:', biRes.status);
    try {
        console.log('Response Body:', JSON.stringify(JSON.parse(biData), null, 2));
    } catch {
        console.log('Response Body:', biData);
    }

    if (biRes.ok) {
        console.log('\n🎉 SUCCESS: Dummy BI event successfully received by Wix!');
    } else {
        console.error('\n❌ Wix rejected the BI event. Check the error response above.');
    }
}

run().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
