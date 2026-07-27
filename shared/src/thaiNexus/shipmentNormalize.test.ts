import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    mergeShipmentSummaries,
    normalizeShipmentListResponse,
    normalizeShipmentSummary,
} from './shipmentNormalize.js';

describe('normalizeShipmentListResponse', () => {
    it('reads shipments from a top-level data array', () => {
        const result = normalizeShipmentListResponse({
            success: true,
            data: [{ request_number: 'TN-1', status: 'Submitted' }],
            pagination: { total: 1, page: 1, limit: 10 },
        });

        assert.equal(result.data?.length, 1);
        assert.equal(result.data?.[0].request_number, 'TN-1');
        assert.equal(result.total, 1);
    });

    it('reads shipments from nested data.shipments', () => {
        const result = normalizeShipmentListResponse({
            success: true,
            data: {
                shipments: [{ requestNumber: 'TN-2', shipment_status: 'In transit' }],
                total: 1,
            },
        });

        assert.equal(result.data?.[0].request_number, 'TN-2');
        assert.equal(result.data?.[0].status, 'In transit');
    });

    it('throws when success is false', () => {
        assert.throws(
            () =>
                normalizeShipmentListResponse({
                    success: false,
                    error: 'Invalid api_token',
                }),
            /Invalid api_token/
        );
    });
});

describe('mergeShipmentSummaries', () => {
    it('deduplicates by request number and prefers newer merged fields', () => {
        const merged = mergeShipmentSummaries(
            [normalizeShipmentSummary({ request_number: 'TN-1', status: 'Old' })],
            [
                normalizeShipmentSummary({
                    request_number: 'TN-1',
                    status: 'Submitted',
                    created_at: '2026-06-01T00:00:00.000Z',
                }),
            ]
        );

        assert.equal(merged.length, 1);
        assert.equal(merged[0].status, 'Submitted');
    });
});
