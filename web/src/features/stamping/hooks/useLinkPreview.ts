/**
 * @fileoverview Link Preview Hook
 *
 * Automatically fetches preview metadata for URLs in text
 */

import { useState, useEffect } from 'react';
import { fetchLinkPreview, isValidHttpUrl, type LinkPreview } from '../services/LinkPreviewService';
import { pageLogger } from '@/core/utils/logger';

export function useLinkPreview(text: string) {
  const [linkPreviews, setLinkPreviews] = useState<LinkPreview[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!text.trim()) {
        setLinkPreviews([]);
        return;
      }

      // Extract URLs from text
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const matches = text.match(urlRegex) || [];
      const validUrls = matches.filter(isValidHttpUrl);

      if (validUrls.length === 0) {
        setLinkPreviews([]);
        return;
      }

      pageLogger.info('🔗 Fetching link previews', { count: validUrls.length });

      // Fetch previews for all URLs
      const previews = await Promise.all(
        validUrls.map(async (url) => {
          try {
            return await fetchLinkPreview(url);
          } catch (error) {
            pageLogger.warn('Failed to fetch link preview', { url, error: error as Error });
            return null;
          }
        }),
      );

      if (!active) return;

      const validPreviews = previews.filter((p): p is LinkPreview => p !== null);
      setLinkPreviews(validPreviews);
      pageLogger.info('✅ Link previews fetched', { count: validPreviews.length });
    })();

    return () => {
      active = false;
    };
  }, [text]);

  return linkPreviews;
}
