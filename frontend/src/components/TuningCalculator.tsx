import React, { useState, useMemo } from 'react';
import { calculateSprings, calculateARBs, calculateDampers, calculateSpringsByFrequency, calculateARBsAdvanced, calculateDampersAdvanced, Drivetrain } from '../utils/tuningMath';
import { useSettings } from '../context/SettingsContext';

const TuningCalculator: React.FC = () => {
  const [isAdvancedMode, setIsAdvancedMode] = useState<boolean>(true);

  const { 
    convertWeight, 
    convertWeightToLbs, 
    convertSpringRateLbsIn, 
    convertSpringRateLbsInToLbsIn 
  } = useSettings();

  // User Inputs
  const [frontBias, setFrontBias] = useState<number>(52.0);
  
  // Advanced Mode Inputs
  const [totalWeight, setTotalWeight] = useState<number>(3000); // Stored in lbs
  const [drivetrain, setDrivetrain] = useState<Drivetrain>('RWD');
  const [targetFreq, setTargetFreq] = useState<number>(1.75); // Hz
  
  const [springMin, setSpringMin] = useState<number>(20);
  const [springMax, setSpringMax] = useState<number>(200);
  
  const [arbMin] = useState<number>(1.0);
  const [arbMax] = useState<number>(65.0);

  const [reboundMin] = useState<number>(1.0);
  const [reboundMax] = useState<number>(20.0);
  const [bumpRatio, setBumpRatio] = useState<number>(0.6); // 60%

  // Display Conversions
  const displayWeight = convertWeight(totalWeight).value;
  const setDisplayWeight = (val: number) => setTotalWeight(convertWeightToLbs(val));

  const displaySpringMin = convertSpringRateLbsIn(springMin).value;
  const setDisplaySpringMin = (val: number) => setSpringMin(convertSpringRateLbsInToLbsIn(val));

  const displaySpringMax = convertSpringRateLbsIn(springMax).value;
  const setDisplaySpringMax = (val: number) => setSpringMax(convertSpringRateLbsInToLbsIn(val));

  const formatSpring = (val: number) => convertSpringRateLbsIn(val).value.toFixed(1);
  const springUnit = convertSpringRateLbsIn(1).label;
  const weightUnit = convertWeight(1).label;

  // Calculations
  const springs = useMemo(() => {
    return isAdvancedMode 
      ? calculateSpringsByFrequency(totalWeight, frontBias, targetFreq)
      : calculateSprings(frontBias, springMin, springMax);
  }, [isAdvancedMode, totalWeight, frontBias, targetFreq, springMin, springMax]);

  const arbs = useMemo(() => {
    return isAdvancedMode
      ? calculateARBsAdvanced(frontBias, drivetrain, arbMin, arbMax)
      : calculateARBs(frontBias, arbMin, arbMax);
  }, [isAdvancedMode, frontBias, drivetrain, arbMin, arbMax]);

  const dampers = useMemo(() => {
    return isAdvancedMode
      ? calculateDampersAdvanced(springs.front, springs.rear, reboundMin, reboundMax, bumpRatio)
      : calculateDampers(frontBias, reboundMin, reboundMax, bumpRatio);
  }, [isAdvancedMode, springs, frontBias, reboundMin, reboundMax, bumpRatio]);

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
        <h2 style={{ color: 'var(--primary)', margin: 0 }}>
          Tuning Calculator
        </h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select 
            value={isAdvancedMode ? 'Advanced' : 'Baseline'} 
            onChange={(e) => setIsAdvancedMode(e.target.value === 'Advanced')}
            style={inputStyle}
          >
            <option value="Baseline">Baseline Mode</option>
            <option value="Advanced">Advanced Mode</option>
          </select>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
        {/* Input Section */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3>Vehicle Settings</h3>
          
          <div className="input-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Front Weight Bias</span>
              <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{frontBias.toFixed(1)}%</span>
            </label>
            <input 
              type="range" min="30" max="70" step="0.1" 
              value={frontBias} 
              onChange={(e) => setFrontBias(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} 
            />
          </div>

          {isAdvancedMode ? (
            <>
              <div className="input-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Weight ({weightUnit})</span>
                  <span style={{ color: 'white' }}>{Math.round(displayWeight)}</span>
                </label>
                <input 
                  type="number" 
                  value={Math.round(displayWeight)} 
                  onChange={(e) => setDisplayWeight(Number(e.target.value))} 
                  style={inputStyle} 
                />
              </div>

              <div className="input-group">
                <label>Drivetrain</label>
                <select 
                  value={drivetrain} 
                  onChange={(e) => setDrivetrain(e.target.value as Drivetrain)} 
                  style={inputStyle}
                >
                  <option value="RWD">RWD (Rear-Wheel Drive)</option>
                  <option value="AWD">AWD (All-Wheel Drive)</option>
                  <option value="FWD">FWD (Front-Wheel Drive)</option>
                </select>
              </div>

              <div className="input-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Target Frequency</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{targetFreq.toFixed(2)} Hz</span>
                </label>
                <input 
                  type="range" min="1.0" max="3.5" step="0.05" 
                  value={targetFreq} 
                  onChange={(e) => setTargetFreq(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }} 
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>Spring Min ({springUnit})</label>
                <input type="number" value={displaySpringMin.toFixed(1)} onChange={(e) => setDisplaySpringMin(Number(e.target.value))} style={inputStyle} />
              </div>
              <div className="input-group">
                <label>Spring Max ({springUnit})</label>
                <input type="number" value={displaySpringMax.toFixed(1)} onChange={(e) => setDisplaySpringMax(Number(e.target.value))} style={inputStyle} />
              </div>
            </div>
          )}
          
          <div className="input-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bump / Rebound Ratio</span>
              <span style={{ color: 'var(--secondary)', fontWeight: 'bold' }}>{(bumpRatio * 100).toFixed(0)}%</span>
            </label>
            <input 
              type="range" min="0.5" max="0.8" step="0.05" 
              value={bumpRatio} 
              onChange={(e) => setBumpRatio(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--secondary)' }} 
            />
          </div>
        </div>

        {/* Results Section */}
        <div style={{ flex: '2 1 400px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          
          {/* Springs */}
          <div style={resultCardStyle}>
            <h4 style={{ color: 'var(--text-secondary)' }}>Springs ({springUnit})</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{formatSpring(springs.front)}</div>
                <div style={labelStyle}>Front</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{formatSpring(springs.rear)}</div>
                <div style={labelStyle}>Rear</div>
              </div>
            </div>
          </div>

          {/* ARBs */}
          <div style={resultCardStyle}>
            <h4 style={{ color: 'var(--text-secondary)' }}>Anti-Roll Bars</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{arbs.front.toFixed(1)}</div>
                <div style={labelStyle}>Front</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{arbs.rear.toFixed(1)}</div>
                <div style={labelStyle}>Rear</div>
              </div>
            </div>
          </div>

          {/* Dampers */}
          <div style={{ ...resultCardStyle, gridColumn: '1 / -1' }}>
            <h4 style={{ color: 'var(--text-secondary)' }}>Damping</h4>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{dampers.frontRebound.toFixed(1)}</div>
                <div style={labelStyle}>Front Rebound</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{dampers.rearRebound.toFixed(1)}</div>
                <div style={labelStyle}>Rear Rebound</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{dampers.frontBump.toFixed(1)}</div>
                <div style={labelStyle}>Front Bump</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={valueStyle}>{dampers.rearBump.toFixed(1)}</div>
                <div style={labelStyle}>Rear Bump</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Inline styles for quick MVP layout
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '4px',
  color: 'white',
  boxSizing: 'border-box'
};

const resultCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  padding: '1rem',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.05)'
};

const valueStyle: React.CSSProperties = {
  fontSize: '1.8rem',
  fontWeight: 'bold',
  color: 'white'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginTop: '4px'
};

export default TuningCalculator;
