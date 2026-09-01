export const SUPPORT_BUNDLE_WINDOW_MINUTES = 10;

export const SUPPORT_BUNDLE_FIELDS = [
  'telemetryPipeline',
  'overlay',
  'discordPresence',
  'recentLogs',
] as const;

export const SUPPORT_BUNDLE_PRIVACY_NOTICE =
  'Creates a local ZIP containing only bounded aggregate diagnostics and recent redacted logs. It excludes raw UDP payloads, absolute paths, player identifiers, and credentials. Nothing is uploaded automatically.';

export function supportBundleRequestBody(): string {
  return JSON.stringify({
    windowMinutes: SUPPORT_BUNDLE_WINDOW_MINUTES,
    fields: SUPPORT_BUNDLE_FIELDS,
  });
}
