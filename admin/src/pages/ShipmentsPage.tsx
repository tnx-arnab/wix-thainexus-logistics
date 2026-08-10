import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Key,
    Loader2,
    MapPin,
    Package,
    Phone,
    User,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchShipmentDetail, fetchShipments, fetchWebhookStatus, syncRecentOrders } from '../lib/api';
import type { ShipmentDetail, ShipmentSummary } from '../lib/types';

function statusClass(status: string | undefined, header = false): string {
    const s = status?.toLowerCase() || '';
    if (s.includes('submit') || s.includes('pending')) {
        return header
            ? 'bg-blue-500/20 text-blue-100 border-blue-400/30'
            : 'bg-blue-100 text-blue-700 border-blue-200';
    }
    if (s.includes('process') || s.includes('transit')) {
        return header
            ? 'bg-amber-500/20 text-amber-100 border-amber-400/30'
            : 'bg-amber-100 text-amber-700 border-amber-200';
    }
    if (s.includes('deliver')) {
        return header
            ? 'bg-green-500/20 text-green-100 border-green-400/30'
            : 'bg-green-100 text-green-700 border-green-200';
    }

    return header
        ? 'bg-gray-500/20 text-gray-100 border-gray-400/30'
        : 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function ShipmentsPage() {
    const [loading, setLoading] = useState(false);
    const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [errorType, setErrorType] = useState<'auth' | 'general' | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [selected, setSelected] = useState<ShipmentDetail | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const [syncing, setSyncing] = useState(false);

    const runSyncFromWix = async () => {
        setSyncing(true);
        try {
            const res = await syncRecentOrders(15);
            const created = res.results.filter((r) => r.ok && !r.skipped);
            const lines = res.results
                .slice(0, 8)
                .map((r) => `#${r.number || r.orderId}: ${r.reason}`)
                .join('\n');
            alert(
                created.length
                    ? `Created ${created.length} shipment(s) from Wix orders.\n${lines}`
                    : `No new shipments.\n${lines || res.hint || 'Check webhook setup for future orders.'}`
            );
            setPage(1);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const [webhookHint, setWebhookHint] = useState<string | null>(null);

    useEffect(() => {
        fetchWebhookStatus()
            .then((s) => {
                if (s.orderWebhookHits === 0 && s.hint) setWebhookHint(s.hint);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        setErrorType(null);
        setErrorMessage(null);
        setWarning(null);
        fetchShipments(page, 10)
            .then((res) => {
                setShipments(Array.isArray(res.data) ? res.data : []);
                setTotal(res.pagination?.total ?? res.total ?? res.data?.length ?? 0);
                setWarning(res.warning || null);
            })
            .catch((err) => {
                const msg = err instanceof Error ? err.message : 'Failed to load shipments';
                const lower = msg.toLowerCase();
                setErrorMessage(msg);
                setErrorType(
                    lower.includes('api token') ||
                        lower.includes('not configured') ||
                        lower.includes('invalid api_token') ||
                        lower.includes('unauthorized') ||
                        lower.includes('401') ||
                        lower.includes('403')
                        ? 'auth'
                        : 'general'
                );
                setShipments([]);
                setTotal(0);
            })
            .finally(() => setLoading(false));
    }, [page]);

    const openDetail = async (requestNumber: string) => {
        setDetailsLoading(true);
        setSelected({ request_number: requestNumber });
        try {
            const detail = await fetchShipmentDetail(requestNumber);
            setSelected(detail);
        } catch {
            setSelected(null);
            alert('Could not load shipment details.');
        } finally {
            setDetailsLoading(false);
        }
    };

    const formatDate = (s?: string) => {
        if (!s) return '-';

        return new Date(s).toLocaleDateString();
    };

    return (
        <div className="space-y-6">
            {webhookHint ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-semibold">Wix has not called your order webhook yet</p>
                    <p className="mt-1 text-amber-900/90">{webhookHint}</p>
                </div>
            ) : null}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-secondary p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Package className="text-white w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Recent shipments</h2>
                            <p className="text-white/80 text-sm">{total || shipments.length} total</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={syncing}
                        onClick={() => void runSyncFromWix()}
                        className="text-sm bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-lg disabled:opacity-50"
                    >
                        {syncing ? 'Syncing…' : 'Sync from Wix orders'}
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="text-left px-6 py-3">Request number</th>
                                <th className="text-left px-6 py-3">Status</th>
                                <th className="text-left px-6 py-3">Vol. weight</th>
                                <th className="text-left px-6 py-3">Date</th>
                                <th className="px-6 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center text-gray-500">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                                        <p className="mt-3">Loading shipments…</p>
                                    </td>
                                </tr>
                            ) : errorType === 'auth' ? (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center">
                                        <Key className="w-10 h-10 mx-auto text-secondary mb-3" />
                                        <p className="font-semibold text-gray-800">Connection required</p>
                                        <p className="text-gray-500 mt-1">
                                            Check your API token in Settings.
                                        </p>
                                    </td>
                                </tr>
                            ) : shipments.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center text-gray-500">
                                        <Package className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                                        <p className="font-semibold text-gray-700">No shipments yet</p>
                                        <p className="mt-1">Waiting for your first Thai Nexus order.</p>
                                    </td>
                                </tr>
                            ) : (
                                shipments.map((s) => (
                                    <tr
                                        key={s.request_number}
                                        className="border-t border-gray-100 hover:bg-gray-50/80"
                                    >
                                        <td className="px-6 py-4 font-mono text-primary font-medium">
                                            {s.request_number}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${statusClass(s.status)}`}
                                            >
                                                {s.status || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {s.volumetric_weight_kg ?? '0'} kg
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {formatDate(s.submitted_date || s.created_at)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => openDetail(s.request_number)}
                                                className="text-primary hover:underline font-medium"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {shipments.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            Showing {(page - 1) * 10 + 1}-{Math.min(page * 10, total || shipments.length)}
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                className="p-2 border rounded-lg disabled:opacity-30 hover:bg-gray-50"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <button
                                type="button"
                                disabled={total > 0 && page * 10 >= total}
                                onClick={() => setPage((p) => p + 1)}
                                className="p-2 border rounded-lg disabled:opacity-30 hover:bg-gray-50"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-primary to-primary/80 p-6 text-white flex justify-between items-start">
                            <div>
                                <p className="text-white/70 text-xs uppercase tracking-wider">
                                    Shipment
                                </p>
                                <h3 className="text-xl font-bold font-mono">
                                    {selected.request_number}
                                </h3>
                                <span
                                    className={`inline-block mt-2 px-3 py-1 rounded-full text-xs border ${statusClass(selected.status, true)}`}
                                >
                                    {selected.status}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="p-2 rounded-lg hover:bg-white/10"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {detailsLoading ? (
                            <div className="p-12 flex flex-col items-center text-gray-500">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="mt-3">Syncing details…</p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-6">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <AddressBlock
                                        title="Shipper"
                                        address={selected.shipper_address}
                                    />
                                    <AddressBlock
                                        title="Consignee"
                                        address={selected.consignee_address}
                                    />
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Weight', value: `${selected.actual_weight_kg ?? '-'} kg` },
                                        { label: 'Length', value: `${selected.length_cm ?? '-'} cm` },
                                        { label: 'Width', value: `${selected.width_cm ?? '-'} cm` },
                                        { label: 'Height', value: `${selected.height_cm ?? '-'} cm` },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                                        >
                                            <p className="text-xs text-gray-500">{item.label}</p>
                                            <p className="font-semibold text-gray-800">{item.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">
                                        Description
                                    </p>
                                    <p className="text-gray-600 text-sm">
                                        {selected.shipment_description ||
                                            'No description provided.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="p-6 border-t flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="tnxl-btn-secondary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {warning && !errorType && (
                <div className="flex items-center gap-2 text-amber-800 text-sm bg-amber-50 px-4 py-3 rounded-lg border border-amber-100">
                    <AlertCircle size={18} />
                    {warning}
                </div>
            )}

            {errorType === 'general' && (
                <div className="flex items-center gap-2 text-secondary text-sm bg-red-50 px-4 py-3 rounded-lg">
                    <AlertCircle size={18} />
                    {errorMessage || 'Failed to load shipments. Try again later.'}
                </div>
            )}
        </div>
    );
}

function AddressBlock({
    title,
    address,
}: {
    title: string;
    address?: ShipmentDetail['shipper_address'];
}) {
    if (!address) {
        return (
            <div className="border border-gray-100 rounded-lg p-4">
                <p className="font-semibold text-primary mb-2">{title}</p>
                <p className="text-gray-400 text-sm">No address data</p>
            </div>
        );
    }

    const line =
        address.address_line1 || address.address || [address.city, address.country].join(', ');

    return (
        <div className="border border-gray-100 rounded-lg p-4">
            <p className="font-semibold text-primary mb-3 flex items-center gap-2">
                <MapPin size={16} />
                {title}
            </p>
            <p className="font-medium flex items-center gap-2 text-gray-800">
                <User size={14} className="text-gray-400" />
                {address.name}
            </p>
            <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                <Phone size={14} className="text-gray-400" />
                {address.phone}
            </p>
            <p className="text-sm text-gray-600 mt-2">{line}</p>
        </div>
    );
}
