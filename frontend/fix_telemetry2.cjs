const fs = require('fs');

const filePath = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// The file currently has duplicated imports inside the component:
/*
  return `Class ${cls}`;
import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { useCarParams } from '../context/CarParamsContext';
import AnalysisView from './AnalysisView';

const getCarClassString = (cls?: number) => {
  if (cls === undefined) return '';
  const classes = ['E', 'D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  if (cls >= 0 && cls < classes.length) return classes[cls];
  return `Class ${cls}`;
};

const TelemetryView: React.FC = () => {
...
*/

// Let's remove everything from the start of the file up to the second "const TelemetryView" and restore the clean top

const correctTop = `import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { useCarParams } from '../context/CarParamsContext';
import AnalysisView from './AnalysisView';

const getCarClassString = (cls?: number) => {
  if (cls === undefined) return '';
  const classes = ['E', 'D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  if (cls >= 0 && cls < classes.length) return classes[cls];
  return \`Class \${cls}\`;
};

const TelemetryView: React.FC = () => {`;

const splitBy = 'const TelemetryView: React.FC = () => {';
const parts = content.split(splitBy);
if (parts.length > 2) {
  // It means it was duplicated.
  const bottom = parts[parts.length - 1];
  content = correctTop + bottom;
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed TelemetryView.tsx duplication');
