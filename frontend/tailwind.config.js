/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        // "Outfit" is the project's single typeface — used on body AND headings.
        // The fallback chain covers Windows, macOS, and Android before hitting
        // the generic sans bucket.
        sans:    ['Outfit', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        outfit:  ['Outfit', 'sans-serif'],   // explicit alias for font-outfit utility
        mono:    ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },

      // ── Semantic Color Palette ────────────────────────────────────────────
      // All tokens map to CSS custom properties defined in index.css :root.
      // Naming follows a three-tier model:
      //   background   → page/surface backgrounds
      //   foreground   → text on those backgrounds
      //   accent       → interactive / brand color
      //   muted        → subtle fills, disabled states
      //   border       → stroke colors
      colors: {
        // ── Backgrounds ────────────────────────────────────────────────────
        background: {
          DEFAULT:  'var(--bg)',          // #000000 — true black canvas
          surface:  'var(--bg-surface)',  // #0A0A0A — card / panel surface
          raised:   'var(--bg-raised)',   // #111111 — hover / raised state
          elevated: 'var(--bg-elevated)', // #1A1A1A — borders, dividers
        },

        // ── Foreground (text) ───────────────────────────────────────────────
        foreground: {
          DEFAULT:   'var(--fg)',           // rgba(255,255,255,0.90)
          secondary: 'var(--fg-secondary)', // rgba(255,255,255,0.50) — #888888 equiv
          muted:     'var(--fg-muted)',     // rgba(255,255,255,0.30)
          subtle:    'var(--fg-subtle)',    // rgba(255,255,255,0.15)
        },

        // ── Accent ─────────────────────────────────────────────────────────
        // Cobble Blue — replacing the older inconsistent green/red split
        accent: {
          DEFAULT:  'var(--accent)',         // #3B82F6 — blue-500
          hover:    'var(--accent-hover)',   // #2563EB — blue-600
          surface:  'var(--accent-surface)', // rgba(59,130,246,0.10)
          border:   'var(--accent-border)',  // rgba(59,130,246,0.25)
        },

        // ── Border ─────────────────────────────────────────────────────────
        border: {
          DEFAULT: 'var(--border)',       // rgba(255,255,255,0.06) — hairline
          hover:   'var(--border-hover)', // rgba(255,255,255,0.12)
          strong:  'var(--border-strong)',// rgba(255,255,255,0.20)
        },

        // ── Muted fills ───────────────────────────────────────────────────
        muted: {
          DEFAULT:    'var(--muted)',         // #111111
          foreground: 'var(--fg-secondary)',
        },

        // ── Semantic status ────────────────────────────────────────────────
        success: {
          DEFAULT: 'var(--success)',
          surface: 'var(--success-surface)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          surface: 'var(--warning-surface)',
        },
        info: {
          DEFAULT: 'var(--info)',
          surface: 'var(--info-surface)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          surface: 'var(--danger-surface)',
        },

        // ── Badge palette (purple / orange tones used in roster) ──────────
        badge: {
          'purple-bg':     'var(--badge-purple-bg)',
          'purple-border': 'var(--badge-purple-border)',
          'purple-text':   'var(--badge-purple-text)',
          'orange-bg':     'var(--badge-orange-bg)',
          'orange-border': 'var(--badge-orange-border)',
          'orange-text':   'var(--badge-orange-text)',
        },
      },

      // ── Box Shadow ────────────────────────────────────────────────────────
      // "shadow-brutal" = the thin inset + drop that makes dark-mode cards
      // feel weighted without a visible blob.
      boxShadow: {
        'brutal':    '0 0 0 1px var(--border), 0 8px 32px rgba(0,0,0,0.6)',
        'brutal-sm': '0 0 0 1px var(--border), 0 4px 12px rgba(0,0,0,0.5)',
        'brutal-lg': '0 0 0 1px var(--border-hover), 0 20px 60px rgba(0,0,0,0.8)',
        'glow':      '0 0 20px var(--accent-surface)',
        'glow-sm':   '0 0 10px var(--accent-surface)',
      },

      // ── Border Radius ─────────────────────────────────────────────────────
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },

      // ── Typography sizes ───────────────────────────────────────────────────
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },

      // ── Animation ──────────────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
      },
    },
  },

  plugins: [],
}
