import React from 'react';
import { SettingsSurface, type SettingsSurfaceProps } from './SettingsSurface';

/** Compatibility entry kept until AppShell passes the Updates surface callback. */
const SettingsView: React.FC<SettingsSurfaceProps> = props => <SettingsSurface {...props} />;

export default SettingsView;
