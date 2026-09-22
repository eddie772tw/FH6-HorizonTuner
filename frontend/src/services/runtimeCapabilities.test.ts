import { expect, it } from 'vitest';
import { projectCapabilities } from './runtimeCapabilities';

it('cannot enable unbundled HUD features from a backend response', () => {
  expect(projectCapabilities({ hudOverlay: true, audioSpectrum: true,
    systemMedia: true, localMotecLaunch: false }, false)).toEqual({
    hudOverlay: false, audioSpectrum: false, systemMedia: false, localMotecLaunch: false,
  });
});
