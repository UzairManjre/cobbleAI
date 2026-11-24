/** Cobble's mark: two block figures, the upper one reaching down to the lower one (the user's own logo). */
export function LogoMark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 23.5 25.5" className={className} fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="4.75" cy="3.85" r="3.85" />
      <rect x="0.5" y="8.1" width="5.2" height="13.9" rx="0.6" />
      <rect x="0.5" y="8.1" width="11" height="5.5" rx="0.6" />
      <circle cx="18.6" cy="9.75" r="3.85" />
      <rect x="12.1" y="14.1" width="10.9" height="5.5" rx="0.6" />
      <rect x="17.8" y="14.1" width="5.2" height="11.2" rx="0.6" />
    </svg>
  );
}

/** The mark set as an annotated figure (crosshairs, caption, one callout), for the blue brand panels. */
export function MarkFigure({ callout }: { callout: string }) {
  return (
    <figure className="relative w-fit px-9 pt-10 pb-8" aria-hidden>
      <span className="crosshair left-0 top-4" />
      <span className="crosshair right-0 top-4" />
      <span className="crosshair left-0 bottom-0" />
      <span className="crosshair right-0 bottom-0" />
      <figcaption className="annot absolute left-9 top-0">■ FIG. 01 · COBBLE</figcaption>
      <LogoMark className="h-28 md:h-36 w-auto" />
      <span className="annot absolute left-full top-[38%] flex items-center gap-2 whitespace-nowrap -ml-6">
        <span className="h-px w-12 bg-current" />( {callout} )
      </span>
    </figure>
  );
}

/** Mark plus the lowercase "cobble" wordmark. */
export function Logo({ className = '', markClassName = 'h-6 w-auto' }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} />
      <span className="font-display text-[1.2em] font-semibold tracking-[-0.04em] leading-none">cobble</span>
    </span>
  );
}
