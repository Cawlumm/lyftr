// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

// Defaults target GitHub Project Pages (cawlumm.github.io/lyftr). To move to the custom
// domain later: set SITE_URL=https://lyftr.dev and SITE_BASE=/ in the deploy workflow and
// drop a `public/CNAME` — no other changes needed (asset + internal links use the base).
const site = process.env.SITE_URL || 'https://cawlumm.github.io';
const base = process.env.SITE_BASE ?? '/lyftr';

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: 'Lyftr',
      description:
        'Self-hosted, open-source workout & nutrition tracker — a free, no-subscription alternative to Hevy and Strong.',
      logo: { src: './src/assets/logo.svg', replacesTitle: true },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Cawlumm/lyftr' },
        { icon: 'discord', label: 'Discord', href: 'https://discord.gg/hfFWsrebQA' },
      ],
      customCss: ['./src/styles/starlight-brand.css'],
      // The marketing landing lives at `/` (src/pages/index.astro); docs are served at
      // their own slugs and linked from here.
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        { label: 'Self-Hosting', slug: 'self-hosting' },
        { label: 'Configuration', slug: 'configuration' },
        { label: 'FAQ', slug: 'faq' },
      ],
    }),
    // applyBaseStyles:false → don't inject Tailwind's base globally (it would fight
    // Starlight's own theme). The landing page imports the base layer itself.
    tailwind({ applyBaseStyles: false }),
  ],
});
