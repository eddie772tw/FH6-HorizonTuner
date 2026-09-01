import { describe, expect, it } from 'vitest';
import {
  SUPPORT_BUNDLE_FIELDS,
  SUPPORT_BUNDLE_PRIVACY_NOTICE,
  supportBundleRequestBody,
} from './diagnosticSupportBundle';

describe('diagnostic support bundle presentation contract', () => {
  it('requests only bounded, allowlisted diagnostic sources', () => {
    expect(JSON.parse(supportBundleRequestBody())).toEqual({
      windowMinutes: 10,
      fields: SUPPORT_BUNDLE_FIELDS,
    });
  });

  it('states the local-only privacy boundary and exclusions', () => {
    expect(SUPPORT_BUNDLE_PRIVACY_NOTICE).toMatch(/local ZIP/i);
    expect(SUPPORT_BUNDLE_PRIVACY_NOTICE).toMatch(/raw UDP payloads/i);
    expect(SUPPORT_BUNDLE_PRIVACY_NOTICE).toMatch(/Nothing is uploaded automatically/i);
  });
});
