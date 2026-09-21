import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isIncompleteServiceCoverage,
    sanitizeServiceCoverage,
} from './validation.js';
import {
    filterCheckoutQuotes,
    quoteCoverageIds,
    serviceCoversDestination,
    serviceIdsOverlap,
} from './serviceCoverage.js';
import type { ServiceCoverage } from './types/thaiNexus.js';

type Quote = { courier: string; display?: string };

function offered(
    dest: string,
    quotes: Quote[],
    coverage: Record<string, ServiceCoverage>,
    disabled: string[] = []
): string[] {
    return filterCheckoutQuotes(
        quotes,
        (quote) => quoteCoverageIds(quote.courier, quote.display || quote.courier),
        dest,
        disabled,
        coverage
    ).map((quote) => quote.courier);
}

const selectedPriority = {
    worldwide: false,
    countries: ['US', 'CA'],
} satisfies ServiceCoverage;
const selectedPrime = {
    worldwide: false,
    countries: ['GB', 'AU', 'JP'],
} satisfies ServiceCoverage;
const restOfWorldFlex = {
    worldwide: false,
    restOfWorld: true,
    countries: [],
} satisfies ServiceCoverage;
const worldwideSwift = { worldwide: true, countries: [] } satisfies ServiceCoverage;
const excludeUsCa = {
    worldwide: true,
    excludeCountries: true,
    countries: ['US', 'CA'],
} satisfies ServiceCoverage;

/** How Settings stores keys: numeric id + full service_name. */
const settingsCoverage: Record<string, ServiceCoverage> = {
    '12': selectedPriority,
    thai_nexus_express_priority_ddp: selectedPriority,
    '13': selectedPrime,
    thai_nexus_express_prime_ddp: selectedPrime,
    '14': restOfWorldFlex,
    thai_nexus_express_flex_dap: restOfWorldFlex,
    '15': worldwideSwift,
    thai_nexus_express_swift_dap: worldwideSwift,
};

const fullNameQuotes: Quote[] = [
    { courier: 'Thai Nexus Express Priority DDP' },
    { courier: 'Thai Nexus Express Prime DDP' },
    { courier: 'Thai Nexus Express Flex DAP' },
];

const shortNameQuotes: Quote[] = [
    { courier: 'Priority DDP' },
    { courier: 'Prime DDP' },
    { courier: 'Flex DAP' },
];

describe('selected countries', () => {
    it('shows a selected service only for listed destinations', () => {
        const coverage = {
            prime_ddp: { worldwide: false, countries: ['US', 'GB'] },
        };

        assert.equal(serviceCoversDestination('Prime DDP', 'US', [], coverage), true);
        assert.equal(serviceCoversDestination('Prime DDP', 'gb', [], coverage), true);
        assert.equal(serviceCoversDestination('Prime DDP', 'TH', [], coverage), false);
        assert.equal(serviceCoversDestination('Prime DDP', '', [], coverage), false);
    });

    it('matches Settings keys against short checkout quote names', () => {
        const coverage = {
            '12': selectedPriority,
            thai_nexus_express_priority_ddp: selectedPriority,
        };

        assert.equal(serviceCoversDestination('Priority DDP', 'US', [], coverage), true);
        assert.equal(serviceCoversDestination('Priority DDP', 'TH', [], coverage), false);
        assert.equal(
            serviceCoversDestination('Thai Nexus Express Priority DDP', 'CA', [], coverage),
            true
        );
        assert.equal(
            serviceCoversDestination(['12', 'Thai Nexus Express Priority DDP'], 'US', [], coverage),
            true
        );
    });

    it('offers Priority only for US/CA when Prime is selected-country and Flex is rest-of-world', () => {
        assert.deepEqual(offered('US', fullNameQuotes, settingsCoverage), [
            'Thai Nexus Express Priority DDP',
        ]);
        assert.deepEqual(offered('CA', shortNameQuotes, settingsCoverage), ['Priority DDP']);
        assert.deepEqual(offered('GB', fullNameQuotes, settingsCoverage), [
            'Thai Nexus Express Prime DDP',
        ]);
        assert.deepEqual(offered('JP', shortNameQuotes, settingsCoverage), ['Prime DDP']);
        assert.deepEqual(offered('FR', fullNameQuotes, settingsCoverage), [
            'Thai Nexus Express Flex DAP',
        ]);
        assert.deepEqual(offered('KR', shortNameQuotes, settingsCoverage), ['Flex DAP']);
    });

    it('lets two selected services both show when their country lists overlap', () => {
        const coverage = {
            priority_ddp: { worldwide: false, countries: ['US'] },
            prime_ddp: { worldwide: false, countries: ['US', 'GB'] },
        };
        const quotes = [{ courier: 'Priority DDP' }, { courier: 'Prime DDP' }];

        assert.deepEqual(offered('US', quotes, coverage), ['Priority DDP', 'Prime DDP']);
        assert.deepEqual(offered('GB', quotes, coverage), ['Prime DDP']);
        assert.deepEqual(offered('TH', quotes, coverage), []);
    });
});

describe('worldwide', () => {
    it('offers every destination the carrier quoted', () => {
        const coverage = { swift_dap: worldwideSwift };
        const quotes = [{ courier: 'Swift DAP' }];

        assert.deepEqual(offered('US', quotes, coverage), ['Swift DAP']);
        assert.deepEqual(offered('TH', quotes, coverage), ['Swift DAP']);
    });

    it('hides rest-of-world when a worldwide service is also quoted', () => {
        const coverage = {
            swift_dap: worldwideSwift,
            flex_dap: restOfWorldFlex,
        };
        const quotes = [{ courier: 'Swift DAP' }, { courier: 'Flex DAP' }];

        assert.deepEqual(offered('FR', quotes, coverage), ['Swift DAP']);
    });

    it('shows rest-of-world when the worldwide service did not quote', () => {
        const coverage = {
            swift_dap: worldwideSwift,
            flex_dap: restOfWorldFlex,
        };

        assert.deepEqual(offered('FR', [{ courier: 'Flex DAP' }], coverage), ['Flex DAP']);
    });
});

describe('exclude countries', () => {
    it('hides listed destinations and covers everywhere else', () => {
        const coverage = { flex_dap: excludeUsCa };

        assert.equal(serviceCoversDestination('Flex DAP', 'US', [], coverage), false);
        assert.equal(serviceCoversDestination('Flex DAP', 'CA', [], coverage), false);
        assert.equal(serviceCoversDestination('Flex DAP', 'GB', [], coverage), true);
        assert.equal(serviceCoversDestination('Flex DAP', 'TH', [], coverage), true);
    });

    it('treats empty selected or exclude lists as covering nothing', () => {
        assert.equal(
            serviceCoversDestination('Prime DDP', 'US', [], {
                prime_ddp: { worldwide: false, countries: [] },
            }),
            false
        );
        assert.equal(
            serviceCoversDestination('Flex DAP', 'TH', [], {
                flex_dap: { worldwide: true, excludeCountries: true, countries: [] },
            }),
            false
        );
    });

    it('lets rest-of-world fill in excluded destinations', () => {
        const coverage = {
            thai_nexus_express_prime_ddp: excludeUsCa,
            thai_nexus_express_flex_dap: restOfWorldFlex,
        };
        const quotes = [{ courier: 'Prime DDP' }, { courier: 'Flex DAP' }];

        assert.deepEqual(offered('US', quotes, coverage), ['Flex DAP']);
        assert.deepEqual(offered('GB', quotes, coverage), ['Prime DDP']);
    });
});

describe('rest of world and disabled services', () => {
    it('shows rest-of-world when the selected service is unchecked', () => {
        assert.deepEqual(
            offered('US', shortNameQuotes, settingsCoverage, [
                '12',
                'thai_nexus_express_priority_ddp',
            ]),
            ['Flex DAP']
        );
    });

    it('hides an unchecked service even when it quoted the dest', () => {
        assert.equal(
            serviceCoversDestination('Prime DDP', 'GB', ['thai_nexus_express_prime_ddp'], settingsCoverage),
            false
        );
        assert.deepEqual(
            offered('GB', shortNameQuotes, settingsCoverage, ['thai_nexus_express_prime_ddp']),
            ['Flex DAP']
        );
    });

    it('treats enabled services with no coverage entry as worldwide', () => {
        assert.equal(serviceCoversDestination('Flex DAP', 'US', [], undefined), true);
        assert.equal(serviceCoversDestination('Flex DAP', 'TH', [], {}), true);
    });
});

describe('save validation', () => {
    it('blocks selected and exclude modes with no countries', () => {
        assert.equal(isIncompleteServiceCoverage({ worldwide: false, countries: [] }), true);
        assert.equal(
            isIncompleteServiceCoverage({
                worldwide: true,
                excludeCountries: true,
                countries: [],
            }),
            true
        );
        assert.equal(isIncompleteServiceCoverage({ worldwide: true, countries: [] }), false);
        assert.equal(
            isIncompleteServiceCoverage({ worldwide: false, restOfWorld: true, countries: [] }),
            false
        );
        assert.equal(
            isIncompleteServiceCoverage({ worldwide: false, countries: ['US'] }),
            false
        );
    });
});

describe('sanitizeServiceCoverage', () => {
    it('uppercases selected countries and drops invalid codes', () => {
        const sanitized = sanitizeServiceCoverage({
            prime_ddp: { worldwide: false, countries: ['us', 'US', 'USA', 'GB'] },
        });

        assert.deepEqual(sanitized.prime_ddp, {
            worldwide: false,
            countries: ['US', 'GB'],
        });
    });

    it('keeps rest-of-world without extra countries', () => {
        const sanitized = sanitizeServiceCoverage({
            flex_dap: { worldwide: true, restOfWorld: true, countries: ['kr', 'US'] },
        });

        assert.deepEqual(sanitized.flex_dap, {
            worldwide: false,
            restOfWorld: true,
            countries: [],
        });
    });

    it('keeps exclude-countries lists', () => {
        const sanitized = sanitizeServiceCoverage({
            flex_dap: { worldwide: false, excludeCountries: true, countries: ['us', 'CA'] },
        });

        assert.deepEqual(sanitized.flex_dap, {
            worldwide: true,
            excludeCountries: true,
            countries: ['US', 'CA'],
        });
    });
});

describe('serviceIdsOverlap', () => {
    it('matches Settings-style keys to checkout courier slugs', () => {
        assert.equal(
            serviceIdsOverlap(['12', 'thai_nexus_express_flex_dap'], ['flex_dap']),
            true
        );
        assert.equal(serviceIdsOverlap(['thai_nexus_express_flex_dap'], ['prime_ddp']), false);
    });
});
