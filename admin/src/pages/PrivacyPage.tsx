import { Shield } from 'lucide-react';
import ExtLink from '../components/ExtLink';
import { clientApp, privacyPolicy, termsOfService } from '../lib/siteLinks';

export default function PrivacyPage() {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-secondary p-5 flex items-center gap-3">
                <Shield className="text-white w-6 h-6" />
                <h2 className="text-lg font-bold text-white">Privacy &amp; data</h2>
            </div>
            <div className="p-8 space-y-6 text-gray-700 leading-relaxed">
                <p>
                    This app sends cart weights, dimensions, destination address, and product
                    document flags to Thai Nexus (
                    <ExtLink href={clientApp} className="text-primary font-medium hover:underline">
                        app.thainexus.co.th
                    </ExtLink>
                    ) to calculate shipping rates at checkout.
                </p>
                <p>
                    Your store configuration (shipper address, commission rules, box definitions,
                    product flags, and encrypted API token) is stored in Cloudflare D1, keyed by your
                    Wix instance id. Only authenticated merchants opening the app from the Wix
                    Dashboard can read or update this data.
                </p>
                <p>
                    Exchange rates for non-THB sites may use the public Frankfurter API (
                    api.frankfurter.app). API tokens are encrypted at rest and are never returned
                    in API responses after save.
                </p>
                <p>
                    Wix OAuth credentials and session tokens are stored separately for app
                    installation, catalog access (product search), and Shipping Rates SPI.
                    Uninstall removes OAuth tokens but keeps merchant config for reinstall.
                    Privacy / redact requests wipe all data for that instance when required.
                </p>
                <p>
                    Company policy:{' '}
                    <ExtLink href={privacyPolicy} className="text-primary font-medium hover:underline">
                        Privacy policy
                    </ExtLink>
                    {' · '}
                    <ExtLink href={termsOfService} className="text-primary font-medium hover:underline">
                        Terms of service
                    </ExtLink>
                </p>
            </div>
        </div>
    );
}
