import type { APIRoute } from 'astro';

// Dynamic robots.txt so the Sitemap line always matches the deployed domain
// (lyftr.pages.dev now, lyftr.dev later) with no manual edit.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site).href;
  const body = `User-agent: *
Allow: /

Sitemap: ${sitemap}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
