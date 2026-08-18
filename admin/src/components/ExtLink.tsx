import type { ReactNode } from 'react';

export default function ExtLink({
    href,
    children,
    className,
    ariaLabel,
    onClick,
}: {
    href: string;
    children: ReactNode;
    className?: string;
    ariaLabel?: string;
    onClick?: () => void;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            aria-label={ariaLabel}
            onClick={onClick}
        >
            {children}
        </a>
    );
}
