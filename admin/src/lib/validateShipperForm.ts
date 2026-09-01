import type { ShipperProfile } from './types';

export function validateShipperForm(shipper: ShipperProfile): string | null {
    if (!shipper.name?.trim()) return 'Shipper name is required.';
    if (!shipper.phone?.trim()) return 'Phone number is required.';
    if (!shipper.street?.trim()) return 'Street address is required.';
    if (!shipper.city?.trim()) return 'City is required.';
    if (!shipper.postalCode?.trim()) return 'Postal code is required.';
    if (!shipper.country?.trim() || shipper.country.length !== 2) {
        return 'Country must be a 2-letter code (e.g. TH).';
    }
    const email = shipper.email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return 'Enter a valid shipper email.';
    }

    return null;
}
