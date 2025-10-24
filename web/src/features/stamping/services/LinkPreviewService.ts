/**
 * @fileoverview Link Preview Service
 *
 * Fetches metadata previews for URLs in text
 */

export type LinkPreview = {
  kind: 'generic' | 'tweet';
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  tweet?: {
    id: string;
    author: string;
    handle: string;
    text: string;
    createdAt: string;
  };
};

export function isValidHttpUrl(maybeUrl: string): boolean {
  try {
    const u = new URL(maybeUrl);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function fetchLinkPreview(url: string): Promise<LinkPreview> {
  // Mocked preview to avoid CORS and external APIs. Deterministic but helpful.
  return Promise.resolve(
    ((): LinkPreview => {
      const u = new URL(url);
      const host = u.hostname.replace('www.', '');

      const isTwitter = /(^|\.)x\.com$/.test(host) || /(^|\.)twitter\.com$/.test(host);
      if (isTwitter) {
        const match = u.pathname.match(/\/status\/(\d+)/);
        const id = match?.[1] ?? Math.random().toString().slice(2, 12);
        return {
          kind: 'tweet',
          url,
          siteName: 'X',
          tweet: {
            id,
            author: u.pathname.split('/')[1] || 'someuser',
            handle: `@${u.pathname.split('/')[1] || 'someuser'}`,
            text: 'Example: This is a preview of the post. The real text will be loaded in the production version.',
            createdAt: new Date().toISOString(),
          },
        };
      }

      return {
        kind: 'generic',
        url,
        siteName: host,
        title: host,
        description:
          'Preview is simulated. In the real version you will see title, description and image.',
        image: undefined,
      };
    })(),
  );
}
