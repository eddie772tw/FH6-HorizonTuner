import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export const initI18n = (backendPort: number) => {
  if (i18n.isInitialized) return;

  i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: 'en-us',
      debug: false,
      react: {
        useSuspense: false // Since we aren't using React Suspense widely
      },
      interpolation: {
        escapeValue: false, // React already safes from xss
      },
      backend: {
        loadPath: `http://127.0.0.1:${backendPort}/api/languages/{{lng}}`,
        parse: (data: string) => {
            // Our translation returns {} for 'en-us' as it's the base
            if (data === '{}') return {};
            try {
                const parsed = JSON.parse(data);
                if (parsed.error) return {}; // handle backend error fallback
                return parsed;
            } catch(e) {
                return {};
            }
        }
      }
    });
};

export default i18n;
