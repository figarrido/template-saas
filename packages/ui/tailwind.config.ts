import type { Config } from 'tailwindcss';
import preset from '@template/config/tailwind';
import animate from 'tailwindcss-animate';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
  plugins: [animate],
} satisfies Config;
