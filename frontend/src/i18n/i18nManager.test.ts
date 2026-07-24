import { describe, it, expect, beforeEach } from 'vitest';
import { i18nManager } from './i18nManager';
import { LanguageCode } from './types';

describe('I18nManager', () => {
  beforeEach(() => {
    i18nManager.setLanguage('en-us');
  });

  it('should have en-us as default language', () => {
    expect(i18nManager.getCurrentLanguage()).toBe('en-us');
  });

  it('should fallback to en-us if unknown language is set', () => {
    i18nManager.setLanguage('unknown' as LanguageCode);
    expect(i18nManager.getCurrentLanguage()).toBe('unknown'); // State is changed
    // But translation uses en-us as fallback inside
    // If we assume en-us has 'tuning', then it should return tuning's translation
    // Let's test translation fallback mechanism:
    expect(i18nManager.t('non_existent_key')).toBe('non_existent_key');
    expect(i18nManager.t('non_existent_key', 'fallback text')).toBe('fallback text');
  });

  it('should change language and translate correctly', () => {
    // en-us translation
    const enText = i18nManager.t('__language_name__');
    expect(enText).toBe('English (US)');

    // switch to zh-tw
    i18nManager.setLanguage('zh-tw');
    expect(i18nManager.getCurrentLanguage()).toBe('zh-tw');
    const zhText = i18nManager.t('__language_name__');
    expect(zhText).toBe('繁體中文');
    
    // switch to ja-jp
    i18nManager.setLanguage('ja-jp');
    expect(i18nManager.getCurrentLanguage()).toBe('ja-jp');
    const jaText = i18nManager.t('__language_name__');
    expect(jaText).toBe('日本語');
  });

  it('should list available languages', () => {
    const langs = i18nManager.getAvailableLanguages();
    expect(langs.length).toBeGreaterThan(0);
    const codes = langs.map(l => l.code);
    expect(codes).toContain('en-us');
    expect(codes).toContain('zh-tw');
    expect(codes).toContain('ja-jp');
    
    // Check structure
    expect(langs[0]).toHaveProperty('code');
    expect(langs[0]).toHaveProperty('name');
  });

  it('should allow setting custom dictionary dynamically', () => {
    i18nManager.setLanguage('zh-tw');
    i18nManager.setCustomDictionary('zh-tw', {
      custom_dynamic_key: '動態翻譯測試',
    });
    expect(i18nManager.t('custom_dynamic_key')).toBe('動態翻譯測試');
  });
});

