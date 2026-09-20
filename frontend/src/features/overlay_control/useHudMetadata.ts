import { useEffect, useRef, useState } from 'react';
import { backendHttpUrl } from '../../services/backend';
import {
  acceptHudAuthorMetadata,
  beginHudMetadataRequest,
  createHudMetadataState,
  defaultHudMetadataTransport,
  loadHudAuthorMetadata,
  loadHudStylesMetadata,
  rejectHudMetadataRequest,
  type HudMetadataState,
  type HudMetadataTransport,
} from './hudMetadata';

export interface UseHudMetadataOptions {
  baseUrl?: string;
  transport?: HudMetadataTransport;
  enabled?: boolean;
}

export function useHudMetadata(
  styleName: string,
  options: UseHudMetadataOptions = {},
): HudMetadataState {
  const {
    baseUrl = backendHttpUrl(''),
    transport = defaultHudMetadataTransport,
    enabled = true,
  } = options;
  const [state, setState] = useState(createHudMetadataState);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadHudStylesMetadata(transport, baseUrl)
      .then(styles => {
        if (active) setState(current => ({ ...current, styles }));
      })
      .catch(error => {
        if (active) {
          setState(current => rejectHudMetadataRequest(
            beginHudMetadataRequest(current),
            current.activeRequest + 1,
            error instanceof Error ? error.message : 'HUD styles metadata failed.',
          ));
        }
      });
    return () => {
      active = false;
    };
  }, [baseUrl, enabled, transport]);

  useEffect(() => {
    if (!enabled || !styleName) return;
    const nextState = beginHudMetadataRequest(state);
    const requestId = nextState.activeRequest;
    requestRef.current = requestId;
    setState(nextState);
    void loadHudAuthorMetadata(transport, state.styles, styleName)
      .then(author => {
        if (requestRef.current === requestId) {
          setState(current => acceptHudAuthorMetadata(current, requestId, styleName, author));
        }
      })
      .catch(error => {
        if (requestRef.current === requestId) {
          setState(current => rejectHudMetadataRequest(
            current,
            requestId,
            error instanceof Error ? error.message : 'HUD author metadata failed.',
          ));
        }
      });
  }, [enabled, state.styles, styleName, transport]);

  return state;
}

