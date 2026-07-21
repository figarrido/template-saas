import type { Config } from 'tailwindcss';

// Shared Tailwind preset. `apps/web`, `apps/admin`, and `packages/ui` extend
// this via `presets: [preset]` in their own tailwind.config.ts.
//
// Colors/radius/type below are the derived output of the root DESIGN.md design
// system (Notion reference). Derived projects replace DESIGN.md and re-derive.
const preset = {
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Named type scale from DESIGN.md `typography`. Use e.g. `text-h1`, `text-body`.
      fontSize: {
        display: ['80px', { lineHeight: '1.05', letterSpacing: '-2px', fontWeight: '600' }],
        'display-lg': ['56px', { lineHeight: '1.10', letterSpacing: '-1px', fontWeight: '600' }],
        h1: ['48px', { lineHeight: '1.15', letterSpacing: '-0.5px', fontWeight: '600' }],
        h2: ['36px', { lineHeight: '1.20', letterSpacing: '-0.5px', fontWeight: '600' }],
        h3: ['28px', { lineHeight: '1.25', fontWeight: '600' }],
        h4: ['22px', { lineHeight: '1.30', fontWeight: '600' }],
        h5: ['18px', { lineHeight: '1.40', fontWeight: '600' }],
        subtitle: ['18px', { lineHeight: '1.50' }],
        body: ['16px', { lineHeight: '1.55' }],
        'body-sm': ['14px', { lineHeight: '1.50' }],
        caption: ['13px', { lineHeight: '1.40' }],
        micro: ['12px', { lineHeight: '1.40' }],
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      screens: {
        xs: '480px',
      },
    },
  },
  darkMode: 'class',
} satisfies Partial<Config>;

export default preset;
