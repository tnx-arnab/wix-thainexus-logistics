/** Live URLs from https://new.thainexus.co.th/en/ */

export const SITE_ORIGIN = 'https://new.thainexus.co.th';

export type SiteLink = { label: string; href: string };

function page(path: string): string {
    return `${SITE_ORIGIN}${path}`;
}

export const logos = {
    color: 'https://media.thainexus.co.th/uploads/site/logo.png',
    white: 'https://media.thainexus.co.th/uploads/site/logo-white.png',
} as const;

export const siteHome = page('/en');
export const clientApp = 'https://app.thainexus.co.th';
export const trackShipment = 'https://tracking.thainexus.co.th';
export const getQuote = page('/en/contact');

export const headerNav: SiteLink[] = [
    { label: 'International shipping', href: page('/en/international-shipping') },
    { label: 'Sell worldwide', href: page('/en/sell-worldwide-from-thailand') },
    { label: 'Store integrations', href: page('/en/integrations') },
    { label: 'Shipping calculator', href: page('/en/shipping-calculator') },
    { label: 'Track', href: trackShipment },
];

export const footerColumns: { heading: string; links: SiteLink[] }[] = [
    {
        heading: 'Business',
        links: [
            { label: 'Sell worldwide', href: page('/en/sell-worldwide-from-thailand') },
            { label: 'E-commerce fulfilment', href: page('/en/services/ecommerce-fulfilment') },
            { label: 'Store integrations', href: page('/en/integrations') },
            { label: 'Developers & API', href: page('/en/developers') },
            { label: 'Shipping calculator', href: page('/en/shipping-calculator') },
        ],
    },
    {
        heading: 'Ship',
        links: [
            { label: 'International shipping', href: page('/en/international-shipping') },
            { label: 'Air freight', href: page('/en/services/air-freight-thailand') },
            { label: 'Sea freight', href: page('/en/services/sea-freight-thailand') },
            { label: 'Customs clearance', href: page('/en/services/customs-clearance-thailand') },
            { label: 'Routes & rates', href: page('/en/lanes') },
            { label: 'Destination guides', href: page('/en/destinations') },
            { label: 'Track a shipment', href: trackShipment },
        ],
    },
    {
        heading: 'Company',
        links: [
            { label: 'About', href: page('/en/about') },
            { label: 'Trust & insurance', href: page('/en/trust') },
            { label: 'Locations', href: page('/en/locations') },
            { label: 'Help center', href: page('/en/knowledge-base') },
            { label: 'Guides', href: page('/en/guides') },
            { label: 'Contact', href: getQuote },
        ],
    },
];

export const privacyPolicy = page('/en/legal/privacy-policy');
export const termsOfService = page('/en/legal/terms-of-service');

export const legalLinks: SiteLink[] = [
    { label: 'Terms', href: termsOfService },
    { label: 'Privacy', href: privacyPolicy },
    { label: 'Trading conditions', href: page('/en/legal/standard-trading-conditions') },
    { label: 'Restricted items', href: page('/en/legal/restricted-items-export-compliance-policy') },
];
