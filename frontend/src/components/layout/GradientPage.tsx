import type { ReactNode } from 'react';
import Topbar from './Topbar';

/**
 * Add a page that uses this to GRADIENT_PAGES (gradientPages.ts) so AppLayout hides its own bar.
 *
 * Full-bleed teal gradient, darkest top left, fading into the page, with the nav embedded at the top.
 * Children are frosted panels laid out in a centred column.
 */

const GRADIENT =
  'radial-gradient(55% 95% at 0% 0%, rgba(7,26,36,0.95) 0%, rgba(7,26,36,0) 70%), ' +
  'radial-gradient(45% 85% at 92% 0%, rgba(122,166,183,0.8) 0%, rgba(122,166,183,0) 70%), ' +
  'linear-gradient(180deg, #17404f 0%, #24576a 26%, #7fa2b0 50%, #cfdde2 70%, #eef2f3 100%)';
const DOTS = 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)';
const FADE_DOWN = 'linear-gradient(180deg, black 30%, transparent)';

export default function GradientPage({ children, height = 680 }: { children: ReactNode; /** gradient height in px */ height?: number }) {
  return (
    <div className="w-full flex-1 bg-canvas">
      <div className="relative min-h-full">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-x-0 top-0" style={{ height, background: GRADIENT }} />
          {/* Fine halftone grid, fading out downwards */}
          <div className="absolute inset-x-0 top-0 h-[440px] opacity-[0.14]"
            style={{ backgroundImage: DOTS, backgroundSize: '5px 5px', maskImage: FADE_DOWN, WebkitMaskImage: FADE_DOWN }} />
        </div>
        <div className="relative max-w-[90rem] mx-auto px-4 sm:px-7 lg:px-10 pb-12 pt-2 sm:pt-3">
          <Topbar embedded />
          {children}
        </div>
      </div>
    </div>
  );
}
