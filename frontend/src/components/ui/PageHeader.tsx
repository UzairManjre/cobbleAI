import type { ReactNode } from 'react';

/** Top of a top-level page: a large lowercase display title, one line of context, actions on the right. */
export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
      <div>
        <h1 className="font-display font-medium text-[clamp(3rem,7vw,5.5rem)] leading-[0.9] tracking-[-0.04em]">{title}</h1>
        {lead && <p className="text-ink-3 mt-5 max-w-xl leading-relaxed">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Page frame shared by top-level pages so every left edge lines up with the top bar and course shell. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full px-5 md:px-8 lg:px-12">
      <div className={`max-w-6xl mx-auto pt-10 md:pt-14 pb-24 ${className}`}>{children}</div>
    </div>
  );
}
