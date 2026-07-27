import { Shield } from 'lucide-react';

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
                    <a
                        href="https://app.thainexus.co.th/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary font-medium hover:underline"
                    >
                        app.thainexus.co.th
                    </a>
                    ) to calculate shipping rates at checkout.
                </p>
                <p>
                    Your store configuration (shipper address, commission rules, box definitions,
                    product flags, and encrypted API token) is stored in Supabase, keyed by your
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
            </div>
        </div>
    );
}
