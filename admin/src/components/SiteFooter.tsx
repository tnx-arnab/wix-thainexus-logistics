import ExtLink from './ExtLink';
import { footerColumns, legalLinks, logos, siteHome } from '../lib/siteLinks';

export default function SiteFooter() {
    return (
        <footer className="bg-primary text-white mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10">
                    <div className="col-span-2 md:col-span-1">
                        <ExtLink href={siteHome}>
                            <img src={logos.white} alt="Thai Nexus" className="h-8 w-auto mb-4" decoding="async" />
                        </ExtLink>
                        <address className="not-italic text-sm leading-relaxed text-white/70 space-y-2">
                            <p className="font-semibold text-white">Thai Nexus Point Co., Ltd.</p>
                            <p>Hua Hin HQ · 39/743 Soi Mooban Hua Na, Nong Kae, Hua Hin 77110</p>
                            <p>
                                <a href="tel:+66923277723" className="hover:text-white">
                                    +66 92 327 7723
                                </a>
                                <span className="text-white/40"> · </span>
                                <a href="mailto:contact@thainexus.co.th" className="hover:text-white">
                                    contact@thainexus.co.th
                                </a>
                            </p>
                        </address>
                    </div>

                    {footerColumns.map((col) => (
                        <div key={col.heading}>
                            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/50 mb-4">
                                {col.heading}
                            </h3>
                            <ul className="space-y-2.5">
                                {col.links.map((link) => (
                                    <li key={link.href}>
                                        <ExtLink
                                            href={link.href}
                                            className="text-sm text-white/70 hover:text-white transition-colors"
                                        >
                                            {link.label}
                                        </ExtLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-white/15">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-white/50">
                    <p>© 2026 Thai Nexus Point Co., Ltd. · Reg. 0775567002481</p>
                    <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
                        {legalLinks.map((link) => (
                            <ExtLink
                                key={link.href}
                                href={link.href}
                                className="hover:text-white transition-colors"
                            >
                                {link.label}
                            </ExtLink>
                        ))}
                    </nav>
                </div>
            </div>
        </footer>
    );
}
