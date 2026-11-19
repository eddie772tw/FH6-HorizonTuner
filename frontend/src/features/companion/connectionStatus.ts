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
    return {
      label: 'Connected',
      color: 'success',
      accessibleLabel: 'Desktop frontend and Companion backend connected',
    };
  }
  if (companionBackendOnline) {
    return {
      label: 'Desktop frontend offline',
      color: 'warning',
      accessibleLabel: 'Companion backend connected, desktop frontend offline',
    };
  }
  if (desktopOnline) {
    return {
      label: 'Companion backend offline',
      color: 'warning',
      accessibleLabel: 'Desktop frontend connected, Companion backend offline',
    };
  }
  return {
    label: 'Disconnected',
    color: 'danger',
    accessibleLabel: 'Desktop frontend and Companion backend disconnected',
  };
}
