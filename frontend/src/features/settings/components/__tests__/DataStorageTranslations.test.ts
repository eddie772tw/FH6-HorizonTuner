import { describe, it, expect } from 'vitest';
import jaJp from '../../../../../../lang/ja-jp.json';
import zhTw from '../../../../../../lang/zh-tw.json';

describe('DataStorageOverview i18n Translations', () => {
  it('should have properly translated strings in Japanese', () => {
    expect(jaJp['Loading local storage information...']).not.toBe('Loading local storage information...');
    expect(jaJp['Storage information is unavailable while the local service is offline.']).not.toBe('Storage information is unavailable while the local service is offline.');
    expect(jaJp['Last settings backup:']).not.toBe('Last settings backup:');
    expect(jaJp['No backup created yet']).not.toBe('No backup created yet');
    expect(jaJp['Export:']).not.toBe('Export:');
    expect(jaJp['Restore:']).not.toBe('Restore:');
    expect(jaJp['SQLite migration:']).not.toBe('SQLite migration:');
    expect(jaJp['Tracked local storage']).not.toBe('Tracked local storage');
  });

  it('should have properly translated strings in Traditional Chinese', () => {
    expect(zhTw['Loading local storage information...']).not.toBe('Loading local storage information...');
    expect(zhTw['Storage information is unavailable while the local service is offline.']).not.toBe('Storage information is unavailable while the local service is offline.');
    expect(zhTw['Last settings backup:']).not.toBe('Last settings backup:');
    expect(zhTw['No backup created yet']).not.toBe('No backup created yet');
    expect(zhTw['Export:']).not.toBe('Export:');
    expect(zhTw['Restore:']).not.toBe('Restore:');
    expect(zhTw['SQLite migration:']).not.toBe('SQLite migration:');
    expect(zhTw['Tracked local storage']).not.toBe('Tracked local storage');
  });
});
