import {
  fetchHudAuthorInfo,
  fetchHudStylesList,
  getHudUrlPrefix,
  type HudAuthorInfo,
  type HudStyleEntry,
} from './hudStyleScanner';

export interface HudMetadataState {
  styles: HudStyleEntry[];
  authorCache: Record<string, HudAuthorInfo>;
  currentAuthor: HudAuthorInfo | null;
  activeRequest: number;
  loading: boolean;
  error: string | null;
}

export interface HudMetadataTransport {
  fetchStyles(baseUrl: string): Promise<HudStyleEntry[]>;
  fetchAuthor(styleName: string, urlPrefix: string, cacheBuster?: string): Promise<HudAuthorInfo | null>;
}

export const defaultHudMetadataTransport: HudMetadataTransport = {
  fetchStyles: baseUrl => fetchHudStylesList(baseUrl),
  fetchAuthor: (styleName, urlPrefix, cacheBuster = '') =>
    fetchHudAuthorInfo(styleName, urlPrefix, undefined, cacheBuster),
};

export function createHudMetadataState(): HudMetadataState {
  return {
    styles: [],
    authorCache: {},
    currentAuthor: null,
    activeRequest: 0,
    loading: false,
    error: null,
  };
}

export function beginHudMetadataRequest(state: HudMetadataState): HudMetadataState {
  return {
    ...state,
    activeRequest: state.activeRequest + 1,
    loading: true,
    error: null,
  };
}

export function acceptHudAuthorMetadata(
  state: HudMetadataState,
  requestId: number,
  styleName: string,
  author: HudAuthorInfo | null,
): HudMetadataState {
  if (requestId !== state.activeRequest) return state;
  return {
    ...state,
    currentAuthor: author,
    authorCache: author ? { ...state.authorCache, [styleName]: author } : state.authorCache,
    loading: false,
  };
}

export function rejectHudMetadataRequest(
  state: HudMetadataState,
  requestId: number,
  error: string,
): HudMetadataState {
  if (requestId !== state.activeRequest) return state;
  return { ...state, loading: false, error };
}

export async function loadHudStylesMetadata(
  transport: HudMetadataTransport,
  baseUrl: string,
): Promise<HudStyleEntry[]> {
  return transport.fetchStyles(baseUrl);
}

export async function loadHudAuthorMetadata(
  transport: HudMetadataTransport,
  styles: HudStyleEntry[],
  styleName: string,
  force = false,
): Promise<HudAuthorInfo | null> {
  const prefix = getHudUrlPrefix(styles, styleName);
  const cacheBuster = force ? `?t=${Date.now()}` : '';
  return transport.fetchAuthor(styleName, prefix, cacheBuster);
}

