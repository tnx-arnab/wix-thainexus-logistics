import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import ExtLink from './ExtLink';
import { clientApp, getQuote, headerNav, logos, siteHome } from '../lib/siteLinks';

export default function SiteHeader() {
    const [open, setOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                <ExtLink href={siteHome} className="flex items-center gap-2.5 shrink-0 min-w-0">
                    <img src={logos.color} alt="Thai Nexus" className="h-9 w-auto" decoding="async" />
                    <span className="hidden sm:block text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-l border-gray-200 pl-2.5">
                        Wix Logistics
                    </span>
                </ExtLink>

                <nav className="hidden lg:flex items-center gap-1" aria-label="Thai Nexus">
                    {headerNav.map((item) => (
                        <ExtLink
                            key={item.href}
                            href={item.href}
                            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-primary whitespace-nowrap"
                        >
                            {item.label}
                        </ExtLink>
                    ))}
                </nav>

                <div className="hidden lg:flex items-center gap-2 shrink-0">
                    <ExtLink
                        href={clientApp}
                        className="text-sm font-semibold text-primary border border-primary px-4 py-2 rounded-md hover:bg-primary hover:text-white transition-colors"
                    >
                        Client login
                    </ExtLink>
                    <ExtLink
                        href={getQuote}
                        className="text-sm font-semibold text-white bg-secondary px-4 py-2.5 rounded-md hover:bg-secondary-hover transition-colors"
                    >
                        Get a quote
                    </ExtLink>
                </div>

                <button
                    type="button"
                    className="lg:hidden p-2 -mr-2 min-h-12 min-w-12 flex items-center justify-center text-primary"
                    aria-label={open ? 'Close menu' : 'Open menu'}
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                >
                    {open ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>

            {open && (
                <nav
                    className="lg:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1"
                    aria-label="Thai Nexus mobile"
                >
                    {headerNav.map((item) => (
                        <ExtLink
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                        >
                            {item.label}
                        </ExtLink>
                    ))}
                    <div className="flex gap-2 pt-2">
                        <ExtLink
                            href={clientApp}
                            onClick={() => setOpen(false)}
                            className="flex-1 text-center text-sm font-semibold text-primary border border-primary px-3 py-2.5 rounded-md"
                        >
                            Client login
                        </ExtLink>
                        <ExtLink
                            href={getQuote}
                            onClick={() => setOpen(false)}
                            className="flex-1 text-center text-sm font-semibold text-white bg-secondary px-3 py-2.5 rounded-md"
                        >
                            Get a quote
                        </ExtLink>
                    </div>
                </nav>
            )}
        </header>
    );
}
