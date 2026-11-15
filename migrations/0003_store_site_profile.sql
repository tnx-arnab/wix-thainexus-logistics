-- Site name, public URL, and owner email from Wix Get App Instance.
-- Merchant phone, address, API token, and boxes stay in thai_nexus_config.

ALTER TABLE stores ADD COLUMN site_name TEXT;
ALTER TABLE stores ADD COLUMN site_url TEXT;
ALTER TABLE stores ADD COLUMN owner_email TEXT;
