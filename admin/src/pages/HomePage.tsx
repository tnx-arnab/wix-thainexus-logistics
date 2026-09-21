import type { StoreConfigPublic } from '../lib/types';
import BoxesPage from './BoxesPage';
import FeesPage from './FeesPage';
import DebugPage from './DebugPage';
import PrivacyPage from './PrivacyPage';
import ProductsPage from './ProductsPage';
import SettingsPage from './SettingsPage';
import ShipmentsPage from './ShipmentsPage';

export default function HomePage({
    tab,
    config,
    onReload,
}: {
    tab: string;
    config: StoreConfigPublic | null;
    onReload: (saved?: StoreConfigPublic) => void;
}) {
    if (tab === 'shipments') {
        return <ShipmentsPage />;
    }

    if (tab === 'settings') {
        return <SettingsPage config={config} onSaved={onReload} />;
    }

    if (tab === 'products') {
        return <ProductsPage />;
    }

    if (tab === 'fees') {
        return <FeesPage config={config} onSaved={onReload} />;
    }

    if (tab === 'boxes') {
        if (config?.chargeActualWeightOnly) {
            return (
                <div className="tnxl-card border-l-4 border-l-amber-500 bg-amber-50 text-amber-950 text-sm p-6 space-y-2">
                    <h2 className="text-lg font-semibold text-amber-950">Boxes are hidden</h2>
                    <p>
                        Charge actual product weight only is on. Box inventory is not used for
                        quotes. Turn that setting off in Settings to edit boxes.
                    </p>
                </div>
            );
        }

        return <BoxesPage config={config} onSaved={onReload} />;
    }

    if (tab === 'privacy') {
        return <PrivacyPage />;
    }

    if (tab === 'debug') {
        return <DebugPage instanceId={config?.instanceId} />;
    }

    return (
        <div className="tnxl-card">
            <h2 className="text-lg font-semibold text-primary capitalize">{tab}</h2>
            <p className="text-gray-500 mt-2">Unknown tab.</p>
        </div>
    );
}
