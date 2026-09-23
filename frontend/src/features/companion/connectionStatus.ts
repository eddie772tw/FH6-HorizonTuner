export type AggregateConnectionStatus = {
  label: string;
  color: 'success' | 'warning' | 'danger';
  accessibleLabel: string;
};

export function getAggregateConnectionStatus(
  desktopOnline: boolean,
  companionBackendOnline: boolean,
): AggregateConnectionStatus {
  if (desktopOnline && companionBackendOnline) {
    return { label: '已連線', color: 'success', accessibleLabel: '桌面前端與 Companion 後端皆已連線' };
  }
  if (companionBackendOnline) {
    return { label: '桌面前端未連線', color: 'warning', accessibleLabel: 'Companion 後端已連線，桌面前端未連線' };
  }
  if (desktopOnline) {
    return { label: 'Companion 後端未連線', color: 'warning', accessibleLabel: '桌面前端已連線，Companion 後端未連線' };
  }
  return { label: '未連線', color: 'danger', accessibleLabel: '桌面前端與 Companion 後端皆未連線' };
}
