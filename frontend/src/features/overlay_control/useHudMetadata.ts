import { useEffect, useRef, useState } from 'react';
import { backendHttpUrl } from '../../services/backend';
import { getHudUrlPrefix, type HudAuthorInfo } from './hudStyleScanner';
import {
  acceptHudAuthorMetadata, createHudMetadataState, defaultHudMetadataTransport,
  loadHudAuthorMetadata, loadHudStylesMetadata, rejectHudMetadataRequest,
  type HudMetadataState, type HudMetadataTransport,
} from './hudMetadata';

export interface UseHudMetadataOptions {
  baseUrl?: string;
  transport?: HudMetadataTransport;
  enabled?: boolean;
}
export interface HudPageMetadata extends HudMetadataState {
  refresh: () => void;
}

/** Page-only reads; the app-session runtime remains the sole configuration owner. */
export function useHudMetadata(styleName: string, options: UseHudMetadataOptions = {}): HudPageMetadata {
  const { baseUrl = backendHttpUrl(''), transport = defaultHudMetadataTransport, enabled = true } = options;
  const [state, setState] = useState(createHudMetadataState);
  const [stylesError, setStylesError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestRef = useRef(0);
  const cache = useRef(new Map<string, HudAuthorInfo>());

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setStylesError(null);
    void loadHudStylesMetadata(transport, baseUrl)
      .then(styles => {
        if (active && styles.length > 0) setState(current => ({ ...current, styles }));
      })
      .catch(error => {
        if (active) setStylesError(error instanceof Error ? error.message : 'HUD styles metadata failed.');
      });
    return () => { active = false; };
  }, [baseUrl, enabled, transport, refreshVersion]);

  useEffect(() => {
    if (!enabled || !styleName) return;
    let active = true;
    const requestId = ++requestRef.current;
    const cacheKey = baseUrl + getHudUrlPrefix(state.styles, styleName) + '/' + styleName;
    const cached = cache.current.get(cacheKey);
    setState(current => ({ ...current, activeRequest: requestId, loading: true, error: null }));
    if (cached) {
      setState(current => acceptHudAuthorMetadata(current, requestId, styleName, cached));
    } else {
      void loadHudAuthorMetadata(transport, state.styles, styleName, refreshVersion > 0)
        .then(author => {
          if (!active || requestRef.current !== requestId) return;
          if (author) cache.current.set(cacheKey, author);
          setState(current => acceptHudAuthorMetadata(current, requestId, styleName, author));
        })
        .catch(error => {
          if (active && requestRef.current === requestId) {
            setState(current => ({
              ...rejectHudMetadataRequest(current, requestId, error instanceof Error ? error.message : 'HUD author metadata failed.'),
              currentAuthor: null,
            }));
          }
        });
    }
    return () => { active = false; };
  }, [baseUrl, enabled, state.styles, styleName, transport, refreshVersion]);

  return {
    ...state,
    error: stylesError ?? state.error,
    refresh: () => {
      cache.current.clear();
      setRefreshVersion(current => current + 1);
    },
  };
}
