import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    resolveShipmentServiceId,
    stripServiceBrandPrefix,
} from './shippingProvider.js';

const SERVICES = [
    { id: 'prime_ddp', service_name: 'Thai Nexus Express Prime DDP', logo: null },
    { id: 'flex_dap', service_name: 'Flex DAP', logo: null },
    { id: 'priority_ddp', service_name: 'Priority DDP', logo: null },
];

describe('stripServiceBrandPrefix', () => {
    it('strips checkout brand prefixes', () => {
        assert.equal(stripServiceBrandPrefix('thai_nexus_express_prime_ddp'), 'prime_ddp');
        assert.equal(stripServiceBrandPrefix('thainexus_flex_dap'), 'flex_dap');
    });
});

describe('resolveShipmentServiceId', () => {
    it('uses the Wix SPI rate code', () => {
        assert.equal(resolveShipmentServiceId('prime_ddp', undefined, SERVICES), 'prime_ddp');
    });

    it('maps a branded checkout title onto the service id', () => {
        assert.equal(
            resolveShipmentServiceId(undefined, 'Thai Nexus Express Prime DDP', SERVICES),
            'prime_ddp'
        );
    });

    it('maps a short title onto the matching courier', () => {
        assert.equal(resolveShipmentServiceId(undefined, 'Flex', SERVICES), 'flex_dap');
    });

    it('strips a thainexus_ prefix from the rate code', () => {
        assert.equal(
            resolveShipmentServiceId('thainexus_priority_ddp', undefined, SERVICES),
            'priority_ddp'
        );
    });

    it('falls back to a courier slug without a live service list', () => {
        assert.equal(resolveShipmentServiceId('flex_dap', 'Thai Nexus Express Flex DAP'), 'flex_dap');
        assert.equal(resolveShipmentServiceId(undefined, 'Thai Nexus Express Prime DDP'), 'prime_ddp');
    });

    it('returns undefined when checkout has no method', () => {
        assert.equal(resolveShipmentServiceId(undefined, undefined, SERVICES), undefined);
    });
});
