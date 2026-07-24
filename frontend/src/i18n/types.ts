export type LanguageCode = 'en-us' | 'zh-tw' | 'ja-jp';

export interface TranslationDictionary {
  __language_name__?: string;
  [key: string]: string | undefined;
}
