import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useCarParams } from '../context/CarParamsContext';
import { calculateARBs, calculateSprings, calculateDampers } from '../utils/tuningMath';

const TuningView: React.FC = () => {
  const { carId, carName, carParams } = useCarParams();
  const [activeSubTab, setActiveSubTab] = useState<string>('Gearing');
  const [saveName, setSaveName] = useState<string>(`Untitled_${new Date().toISOString().slice(0,10)}`);
  const [savedTunings, setSavedTunings] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');
  
  const [isMetric, setIsMetric] = useState(true);

  const tuningCategories = [
    'Tires', 'Gearing', 'Alignment', 'Anti-roll bars', 'Springs', 
    'Damping', 'Aero', 'Brake', 'Differential'
  ];

  // Comprehensive Tuning State (Internal always Metric)
  const [tuning, setTuning] = useState({
    tires: { front: 2.1, rear: 2.1 },
    gearing: { finalDrive: 3.40, gears: [2.89, 1.99, 1.49, 1.16, 0.94, 0.78, 0.65, 0.55, 0.50, 0.45], maxRpm: 8000 },
    alignment: { camberF: -1.5, camberR: -1.0, toeF: 0.0, toeR: 0.0, caster: 5.0 },
    arb: { front: 30, rear: 30 },
    springs: { front: 100, rear: 100, heightF: 15, heightR: 15 },
    damping: { reboundF: 10, reboundR: 10, bumpF: 6, bumpR: 6 },
    aero: { front: 100, rear: 150 },
    brake: { balance: 50, pressure: 100 },
    diff: { accelF: 50, decelF: 0, accelR: 50, decelR: 0, center: 65 }
  });

  // Baselines
  const wd = carParams?.weight_distribution || 50;
  const arbBaseline = calculateARBs(wd, 1, 65);
  const springsBaseline = calculateSprings(wd, 20, 200);
  const dampingBaseline = calculateDampers(wd, 1, 20, 0.6);

  useEffect(() => {
    fetchTunings();
  }, []);

  const fetchTunings = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/tunings');
      const data = await res.json();
      if (data.tunings) {
        // Only show tunings for the current car
        const carTunings = data.tunings.filter((t: string) => t.startsWith(`${carId}-`));
        setSavedTunings(carTunings);
      }
    } catch (e) {}
  };

  const saveTuning = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${carId}/${saveName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tuning)
      });
      if (res.ok) {
        setSaveStatus('Saved!');
        fetchTunings();
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (e) {
      setSaveStatus('Save failed.');
    }
  };

  const loadTuning = async (fullName: string) => {
    if (!fullName) return;
    const parts = fullName.split('-');
    const cid = parts[0];
    const sname = parts.slice(1).join('-');
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/tunings/${cid}/${sname}`);
      const data = await res.json();
      if (!data.error) {
        setTuning(data);
        setSaveName(sname);
      }
    } catch (e) {}
  };

  const updateSection = (section: keyof typeof tuning, field: string, value: number) => {
    setTuning(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  // Unit Conversion
  const convertToUI = (val: number, type: string) => {
    if (isMetric) return val;
    if (type === 'pressure') return val * 14.5038;
    if (type === 'spring') return val * 55.9974;
    if (type === 'height') return val * 0.3937;
    if (type === 'force') return val * 2.20462;
    return val;
  };
  const convertFromUI = (val: number, type: string) => {
    if (isMetric) return val;
    if (type === 'pressure') return val / 14.5038;
    if (type === 'spring') return val / 55.9974;
    if (type === 'height') return val / 0.3937;
    if (type === 'force') return val / 2.20462;
    return val;
  };

  const TuningSlider = ({label, value, min, max, unitType, section, field, step=0.1, baseline}: any) => {
    const uiValue = convertToUI(value, unitType);
    const uiMin = convertToUI(min, unitType);
    const uiMax = convertToUI(max, unitType);
    const uiBaseline = baseline !== undefined ? convertToUI(baseline, unitType) : undefined;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {label} 
            {uiBaseline !== undefined && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>(Base: {uiBaseline.toFixed(1)})</span>}
          </span>
          <input 
            type="number" 
            value={uiValue.toFixed(2)} 
            onChange={(e) => updateSection(section, field, convertFromUI(parseFloat(e.target.value), unitType))} 
            step={step}
            style={{ width: '80px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right' }}
          />
        </div>
        <input 
          type="range" min={uiMin} max={uiMax} step={step} 
          value={uiValue} 
          onChange={(e) => updateSection(section, field, convertFromUI(parseFloat(e.target.value), unitType))}
          style={{ width: '100%', accentColor: 'var(--primary)' }}
        />
      </div>
    );
  };

  // --- Gearing Chart Logic ---
  const { gears, finalDrive, maxRpm } = tuning.gearing;
  const TIRE_RADIUS_M = 0.35; 
  const calcSpeed = (rpm: number, gearRatio: number) => gearRatio === 0 ? 0 : ((rpm * 2 * Math.PI * TIRE_RADIUS_M) / (gearRatio * finalDrive * 60)) * 3.6;
  const calcRpm = (speedKmh: number, gearRatio: number) => (speedKmh / 3.6) * (gearRatio * finalDrive * 60) / (2 * Math.PI * TIRE_RADIUS_M);
  
  const numGears = carParams?.adjustability?.gears || 6;
  const chartData: any[] = [{ speed: 0, gear1: 0 }];
  for (let i = 0; i < numGears; i++) {
    const gearRatio = gears[i];
    if (gearRatio <= 0) continue;
    const maxSpeedForGear = calcSpeed(maxRpm, gearRatio);
    const endPoint: any = { speed: maxSpeedForGear };
    endPoint[`gear${i + 1}`] = maxRpm;
    if (i + 1 < numGears && gears[i + 1] > 0) {
      endPoint[`gear${i + 2}`] = calcRpm(maxSpeedForGear, gears[i + 1]);
    }
    chartData.push(endPoint);
  }
  const maxSpeed = chartData.length > 0 ? Math.max(...chartData.map(d => d.speed)) : 400;
  const xMax = Math.max(100, Math.ceil(maxSpeed / 50) * 50);
  const xTicks10s = []; for (let i = 0; i <= xMax; i += 10) xTicks10s.push(i);
  const xTicks50s = []; for (let i = 0; i <= xMax; i += 50) xTicks50s.push(i);
  const yMax = Math.ceil((maxRpm + 500) / 1000) * 1000;
  const yTicks100s = []; for (let i = 0; i <= yMax; i += 100) yTicks100s.push(i);
  const yTicks1000s = []; for (let i = 0; i <= yMax; i += 1000) yTicks1000s.push(i);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Top Bar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-secondary)' }}>Car: <strong style={{color:'white'}}>{carName} (ID: {carId})</strong></label>
          <span style={{color: 'gray'}}>|</span>
          <label style={{ color: 'var(--text-secondary)' }}>Save Name:</label>
          <input 
            type="text" 
            value={saveName} 
            onChange={(e) => setSaveName(e.target.value)}
            style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', width: '200px' }}
          />
          <button onClick={saveTuning} style={btnStyle}>Save Setup</button>
          <span style={{ color: 'var(--primary)' }}>{saveStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-secondary)' }}>Load Profile:</label>
          <select onChange={(e) => loadTuning(e.target.value)} style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
            <option value="">-- Select Saved Tuning --</option>
            {savedTunings.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Left Sub-Nav */}
        <div className="glass-panel" style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tuningCategories.map(cat => (
            <button key={cat} onClick={() => setActiveSubTab(cat)} style={{
                background: activeSubTab === cat ? 'rgba(0, 240, 255, 0.2)' : 'transparent', border: 'none', borderLeft: activeSubTab === cat ? '3px solid var(--primary)' : '3px solid transparent', color: activeSubTab === cat ? 'white' : 'var(--text-secondary)', padding: '0.8rem 1rem', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '0 4px 4px 0'
            }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Right Content Area */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, color: 'var(--primary)' }}>{activeSubTab} Setup</h2>
            <button onClick={() => setIsMetric(!isMetric)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>
              Toggle Units: {isMetric ? 'Metric' : 'Imperial'}
            </button>
          </div>

          <div style={{ maxWidth: activeSubTab === 'Gearing' ? '100%' : '500px', height: '100%' }}>
            {activeSubTab === 'Tires' && (
              <>
                <TuningSlider label="Front Pressure" value={tuning.tires.front} min={1.0} max={4.0} unitType="pressure" section="tires" field="front" step={0.05} />
                <TuningSlider label="Rear Pressure" value={tuning.tires.rear} min={1.0} max={4.0} unitType="pressure" section="tires" field="rear" step={0.05} />
              </>
            )}

            {activeSubTab === 'Alignment' && (
              <>
                <TuningSlider label="Front Camber" value={tuning.alignment.camberF} min={-5.0} max={5.0} unitType="none" section="alignment" field="camberF" />
                <TuningSlider label="Rear Camber" value={tuning.alignment.camberR} min={-5.0} max={5.0} unitType="none" section="alignment" field="camberR" />
                <TuningSlider label="Front Toe" value={tuning.alignment.toeF} min={-5.0} max={5.0} unitType="none" section="alignment" field="toeF" />
                <TuningSlider label="Rear Toe" value={tuning.alignment.toeR} min={-5.0} max={5.0} unitType="none" section="alignment" field="toeR" />
                <TuningSlider label="Front Caster" value={tuning.alignment.caster} min={1.0} max={7.0} unitType="none" section="alignment" field="caster" />
              </>
            )}

            {activeSubTab === 'Anti-roll bars' && (
              carParams?.adjustability?.arb === 'Fixed' ? <div style={{color:'gray'}}>ARBs are unadjustable.</div> :
              <>
                <TuningSlider label="Front ARB" value={tuning.arb.front} min={1.0} max={65.0} unitType="none" section="arb" field="front" baseline={arbBaseline.front} />
                <TuningSlider label="Rear ARB" value={tuning.arb.rear} min={1.0} max={65.0} unitType="none" section="arb" field="rear" baseline={arbBaseline.rear} />
              </>
            )}

            {activeSubTab === 'Springs' && (
              carParams?.adjustability?.suspension === 'Fixed' || carParams?.adjustability?.suspension === 'Street' ? <div style={{color:'gray'}}>Springs are unadjustable.</div> :
              <>
                <TuningSlider label="Front Springs" value={tuning.springs.front} min={20} max={300} unitType="spring" section="springs" field="front" step={1} baseline={springsBaseline.front} />
                <TuningSlider label="Rear Springs" value={tuning.springs.rear} min={20} max={300} unitType="spring" section="springs" field="rear" step={1} baseline={springsBaseline.rear} />
                <TuningSlider label="Front Ride Height" value={tuning.springs.heightF} min={5.0} max={30.0} unitType="height" section="springs" field="heightF" step={0.5} />
                <TuningSlider label="Rear Ride Height" value={tuning.springs.heightR} min={5.0} max={30.0} unitType="height" section="springs" field="heightR" step={0.5} />
              </>
            )}

            {activeSubTab === 'Damping' && (
              carParams?.adjustability?.suspension === 'Fixed' || carParams?.adjustability?.suspension === 'Street' ? <div style={{color:'gray'}}>Dampers are unadjustable.</div> :
              <>
                <TuningSlider label="Front Rebound" value={tuning.damping.reboundF} min={1.0} max={20.0} unitType="none" section="damping" field="reboundF" baseline={dampingBaseline.frontRebound} />
                <TuningSlider label="Rear Rebound" value={tuning.damping.reboundR} min={1.0} max={20.0} unitType="none" section="damping" field="reboundR" baseline={dampingBaseline.rearRebound} />
                <TuningSlider label="Front Bump" value={tuning.damping.bumpF} min={1.0} max={20.0} unitType="none" section="damping" field="bumpF" baseline={dampingBaseline.frontBump} />
                <TuningSlider label="Rear Bump" value={tuning.damping.bumpR} min={1.0} max={20.0} unitType="none" section="damping" field="bumpR" baseline={dampingBaseline.rearBump} />
              </>
            )}

            {activeSubTab === 'Aero' && (
              <>
                <TuningSlider label="Front Downforce" value={tuning.aero.front} min={50} max={500} unitType="force" section="aero" field="front" step={1} />
                <TuningSlider label="Rear Downforce" value={tuning.aero.rear} min={50} max={500} unitType="force" section="aero" field="rear" step={1} />
              </>
            )}

            {activeSubTab === 'Brake' && (
              <>
                <TuningSlider label="Braking Balance (% Front)" value={tuning.brake.balance} min={0} max={100} unitType="none" section="brake" field="balance" step={1} />
                <TuningSlider label="Braking Pressure (%)" value={tuning.brake.pressure} min={10} max={200} unitType="none" section="brake" field="pressure" step={1} />
              </>
            )}

            {activeSubTab === 'Differential' && (
              <>
                {(carParams?.drivetrain === 'FWD' || carParams?.drivetrain === 'AWD') && (
                  <>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Front</h4>
                    <TuningSlider label="Acceleration" value={tuning.diff.accelF} min={0} max={100} unitType="none" section="diff" field="accelF" step={1} />
                    <TuningSlider label="Deceleration" value={tuning.diff.decelF} min={0} max={100} unitType="none" section="diff" field="decelF" step={1} />
                  </>
                )}
                {(carParams?.drivetrain === 'RWD' || carParams?.drivetrain === 'AWD') && (
                  <>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Rear</h4>
                    <TuningSlider label="Acceleration" value={tuning.diff.accelR} min={0} max={100} unitType="none" section="diff" field="accelR" step={1} />
                    <TuningSlider label="Deceleration" value={tuning.diff.decelR} min={0} max={100} unitType="none" section="diff" field="decelR" step={1} />
                  </>
                )}
                {carParams?.drivetrain === 'AWD' && (
                  <>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Center</h4>
                    <TuningSlider label="Balance (% Rear)" value={tuning.diff.center} min={0} max={100} unitType="none" section="diff" field="center" step={1} />
                  </>
                )}
              </>
            )}

            {activeSubTab === 'Gearing' && (
              carParams?.adjustability?.gearbox === 'Fixed' ? <div style={{color:'gray'}}>Gearbox is unadjustable.</div> :
              <div style={{ display: 'flex', gap: '2rem', height: '450px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Max RPM</span>
                    <input type="number" value={tuning.gearing.maxRpm} onChange={(e) => updateSection('gearing', 'maxRpm', parseFloat(e.target.value))} step="100" style={{ width: '80px', background: 'rgba(255,0,0,0.2)', color: 'white', border: '1px solid rgba(255,0,0,0.5)', borderRadius: '4px', textAlign: 'right' }}/>
                  </div>
                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                  <TuningSlider label="Final Drive" value={tuning.gearing.finalDrive} min={2.0} max={6.0} unitType="none" section="gearing" field="finalDrive" step={0.01} />
                  
                  {carParams?.adjustability?.gearbox === 'Full' && Array.from({length: numGears}).map((_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{i + 1}{i===0?'st':i===1?'nd':i===2?'rd':'th'} Gear</span>
                        <input 
                          type="number" 
                          value={tuning.gearing.gears[i].toFixed(2)} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const newGears = [...tuning.gearing.gears];
                            newGears[i] = val;
                            for (let j = i + 1; j < newGears.length; j++) if (newGears[j] > newGears[j - 1]) newGears[j] = newGears[j - 1];
                            for (let j = i - 1; j >= 0; j--) if (newGears[j] < newGears[j + 1]) newGears[j] = newGears[j + 1];
                            setTuning(prev => ({...prev, gearing: {...prev.gearing, gears: newGears}}));
                          }} 
                          step="0.01"
                          style={{ width: '80px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right' }}
                        />
                      </div>
                      <input 
                        type="range" min={0.5} max={4.0} step="0.01" 
                        value={tuning.gearing.gears[i]} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const newGears = [...tuning.gearing.gears];
                          newGears[i] = val;
                          for (let j = i + 1; j < newGears.length; j++) if (newGears[j] > newGears[j - 1]) newGears[j] = newGears[j - 1];
                          for (let j = i - 1; j >= 0; j--) if (newGears[j] < newGears[j + 1]) newGears[j] = newGears[j + 1];
                          setTuning(prev => ({...prev, gearing: {...prev.gearing, gears: newGears}}));
                        }}
                        style={{ width: '100%', accentColor: 'var(--primary)' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ flex: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="speed" type="number" domain={[0, xMax]} ticks={xTicks10s} tickFormatter={(val) => val % 50 === 0 ? val : ''} stroke="var(--text-secondary)" label={{ value: 'Speed (km/h)', position: 'bottom', fill: 'var(--text-secondary)' }} />
                      <YAxis type="number" domain={[0, yMax]} ticks={yTicks100s} tickFormatter={(val) => val % 1000 === 0 ? val : ''} stroke="var(--text-secondary)" label={{ value: 'Engine RPM', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }} labelFormatter={(val) => `Speed: ${Number(val).toFixed(1)} km/h`} />
                      {xTicks50s.map(val => <ReferenceLine key={`x-${val}`} x={val} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />)}
                      {yTicks1000s.map(val => <ReferenceLine key={`y-${val}`} y={val} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />)}
                      <ReferenceLine y={maxRpm} stroke="red" strokeDasharray="5 5" label={{ position: 'top', value: 'Redline', fill: 'red' }} />
                      {Array.from({length: numGears}).map((_, i) => (
                        <Line key={i} type="linear" dataKey={`gear${i+1}`} stroke={`hsl(${i * 45}, 80%, 60%)`} strokeWidth={3} dot={false} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--primary)',
  color: 'black',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

export default TuningView;
