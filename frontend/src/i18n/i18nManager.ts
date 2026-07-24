import { LanguageCode, TranslationDictionary } from './types';
import zhTW from './locales/zh-TW';
import enUS from './locales/en-US';
import jaJP from './locales/ja-JP';

class I18nManager {
  private currentLang: LanguageCode = 'en-us';
  private dictionary: TranslationDictionary = {};
  private availableDicts: Record<string, TranslationDictionary> = {
    'zh-tw': zhTW,
    'en-us': enUS,
    'ja-jp': jaJP,
  };

  constructor() {
    // 預設載入英文
    this.setLanguage('en-us');
  }

  public setLanguage(lang: LanguageCode) {
    this.currentLang = lang;
    this.dictionary = this.availableDicts[lang] || enUS;
  }

  public getCurrentLanguage(): LanguageCode {
    return this.currentLang;
  }

  public t(key: string, fallback?: string): string {
    return this.dictionary[key] || fallback || key;
  }
  
  public getAvailableLanguages() {
    return Object.keys(this.availableDicts).map(key => ({
      code: key as LanguageCode,
      name: this.availableDicts[key].__language_name__
    }));
  }
}

export const i18nManager = new I18nManager();
