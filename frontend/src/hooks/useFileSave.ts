import { useCallback, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { saveFile, type SaveRequest, type SaveResult } from '../services/fileSave';

/** One in-flight export per consumer, with consistent cancellation and feedback. */
export function useFileSave() {
  const { t } = useSettings();
  const { addToast } = useToast();
  const busy = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const save = useCallback(async (request: SaveRequest): Promise<SaveResult | undefined> => {
    if (busy.current) return;
    busy.current = true;
    setIsSaving(true);
    try {
      const result = await saveFile(request);
      if (result.status === 'saved') {
        const path = result.path;
        addToast({ type: 'success', message: `${t('File saved')}: ${result.filename}`, detail: path,
          duration: 10_000, action: path ? { label: t('Copy path'), onClick: () => {
            void (navigator.clipboard?.writeText(path) ?? Promise.reject(new Error('Clipboard unavailable'))).then(
              () => addToast({ type: 'success', message: t('Path copied') }),
              () => addToast({ type: 'warning', message: t('Unable to copy path. Select the path in the save notification.') }),
            );
          } } : undefined });
      } else if (result.status === 'downloaded') {
        addToast({ type: 'info', message: `${t('Download started')}: ${result.filename}`,
          detail: t('Check your browser downloads for the file and save location.'), duration: 10_000 });
      }
      return result;
    } catch (error) {
      addToast({ type: 'danger', message: t('File export failed'),
        detail: error instanceof Error ? error.message : String(error), duration: 10_000 });
      return undefined;
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }, [addToast, t]);
  return { save, isSaving };
}
