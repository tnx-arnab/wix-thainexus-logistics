import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickTrackingRequestNumbers } from './trackingBatch.js';

describe('pickTrackingRequestNumbers', () => {
    it('prefers shipments that still need a TNX number', () => {
        const picked = pickTrackingRequestNumbers(
            [
                { request_number: 'new-1' },
                { request_number: 'old-1', tnx_tracking_number: 'TNX1', status: 'in_transit' },
                { request_number: 'done-1', tnx_tracking_number: 'TNX2', status: 'delivered' },
            ],
            40
        );

        assert.deepEqual(picked, ['new-1', 'old-1']);
    });

    it('caps the hourly batch', () => {
        const rows = Array.from({ length: 80 }, (_, i) => ({ request_number: `r${i}` }));
        assert.equal(pickTrackingRequestNumbers(rows, 40).length, 40);
        assert.equal(pickTrackingRequestNumbers(rows, 40)[0], 'r0');
    });
});
