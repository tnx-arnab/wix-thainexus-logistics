import type { ReactNode } from 'react';
import SiteFooter from './SiteFooter';
import SiteHeader from './SiteHeader';

export default function AppShell({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col font-sans">
            <SiteHeader />
            {children}
            <SiteFooter />
        </div>
    );
}
