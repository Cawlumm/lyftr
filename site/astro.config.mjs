// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

// Deploys to Cloudflare Pages (served at the domain root). The workflow sets SITE_URL/SITE_BASE;
// these defaults keep local builds root-based too. Custom domain later = set SITE_URL=https://lyftr.dev.
const site = process.env.SITE_URL || 'https://lyftr-app.pages.dev';
const base = process.env.SITE_BASE ?? '/';
const ogImage = new URL('og-image.png', site).href;

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
      // Starlight sets canonical + og:title/description itself; add a default social image
      // + Twitter card so docs pages share nicely (per-page can override via frontmatter).
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: ogImage } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: ogImage } },
      ],
      // The marketing landing lives at `/` (src/pages/index.astro); docs are served at
      // their own slugs and linked from here.
      sidebar: [
        {
          label: 'Start Here',
          items: [{ label: 'Getting Started', slug: 'getting-started' }],
        },
        {
          label: 'Self-Hosting',
          items: [
            { label: 'Install', slug: 'self-hosting' },
            { label: 'Configuration', slug: 'configuration' },
            { label: 'HTTPS & Reverse Proxy', slug: 'https' },
            { label: 'Backups & Updates', slug: 'backups' },
            { label: 'Troubleshooting', slug: 'troubleshooting' },
          ],
        },
        {
          label: 'Apps & Data',
          items: [
            { label: 'Mobile App', slug: 'mobile' },
            { label: 'Exercise Library', slug: 'exercise-library' },
          ],
        },
        {
          label: 'Help',
          items: [{ label: 'FAQ', slug: 'faq' }],
        },
      ],
    }),
    // applyBaseStyles:false → don't inject Tailwind's base globally (it would fight
    // Starlight's own theme). The landing page imports the base layer itself.
    tailwind({ applyBaseStyles: false }),
  ],
});
