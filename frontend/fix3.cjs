const fs = require('fs');
const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

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

const splitStr = 'const TelemetryView: React.FC = () => {';
const index = content.lastIndexOf(splitStr);
if (index === -1) {
  console.log("Could not find TelemetryView start");
  process.exit(1);
}

const bottom = content.substring(index + splitStr.length);
fs.writeFileSync(path, correctTop + bottom, 'utf8');
console.log("Fixed top of TelemetryView");
