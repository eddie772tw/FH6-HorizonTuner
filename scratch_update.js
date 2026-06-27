const fs = require('fs');

const path = 'd:\\FH6-HorizonTuner\\frontend\\src\\components\\TuningView.tsx';
let code = fs.readFileSync(path, 'utf8');

const startIdx = code.indexOf(`          {activeSubTab !== 'Gearing' ? (`);
const endIdx = code.indexOf(`          )}`, startIdx) + 12;

const newCode = `          <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
            <div style={{ flex: 1, maxWidth: '550px', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '1rem' }}>
            
            {activeSubTab === 'Theoretical Performance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Enter the game's theoretical performance data here to reverse-calculate locked tuning settings. 
                  Calculated values will try to update when tuning changes.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Weight ({convertWeight(1).label})</span>
                    <input type="number" value={theoreticalData.weight} onChange={(e) => setTheoreticalData(p => ({...p, weight: e.target.value}))} style={{ width: '120px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }} placeholder="e.g. 1500"/>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Front Weight Bias (%)</span>
                    <input type="number" value={theoreticalData.frontBias} onChange={(e) => setTheoreticalData(p => ({...p, frontBias: e.target.value}))} style={{ width: '120px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }} placeholder="e.g. 52"/>
                  </div>
                </div>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />
                <h4 style={{ color: 'var(--primary)', margin: 0 }}>Performance Stats</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Top Speed (Calculated from Gearing)</span>
                    <span style={{ color: 'white', fontWeight: 'bold' }}>{maxSpeed.toFixed(1)} {convertSpeed(1/3.6).label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>0-100 km/h (In-game)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="number" value={theoreticalData.zeroTo100} onChange={(e) => setTheoreticalData(p => ({...p, zeroTo100: e.target.value}))} style={{ width: '100px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }}/>
                      <span style={{color: 'gray'}}>s</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Lateral Gs ({settings.units.speed === 'mph' ? '120 mph' : '193 km/h'})</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="number" value={theoreticalData.lateralG} onChange={(e) => setTheoreticalData(p => ({...p, lateralG: e.target.value}))} style={{ width: '100px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', padding: '0.5rem' }}/>
                      <span style={{color: 'gray'}}>Gs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
              <>
                <TuningSlider label="Front ARB" value={arbFixed ? arbBaseline.front : tuning.arb.front} min={limits.arbMin} max={limits.arbMax} unitType="none" section="arb" field="front" baseline={arbBaseline.front} disabled={arbFixed} isUnknown={arbFixed && !hasTheoData} />
                <TuningSlider label="Rear ARB" value={arbFixed ? arbBaseline.rear : tuning.arb.rear} min={limits.arbMin} max={limits.arbMax} unitType="none" section="arb" field="rear" baseline={arbBaseline.rear} disabled={arbFixed} isUnknown={arbFixed && !hasTheoData} />
              </>
            )}

            {activeSubTab === 'Springs' && (
              <>
                <TuningSlider label="Front Springs" value={springsFixed ? springsBaseline.front : tuning.springs.front} min={limits.springMin} max={limits.springMax} unitType="spring" section="springs" field="front" step={1} baseline={springsBaseline.front} disabled={springsFixed} isUnknown={springsFixed && !hasTheoData} />
                <TuningSlider label="Rear Springs" value={springsFixed ? springsBaseline.rear : tuning.springs.rear} min={limits.springMin} max={limits.springMax} unitType="spring" section="springs" field="rear" step={1} baseline={springsBaseline.rear} disabled={springsFixed} isUnknown={springsFixed && !hasTheoData} />
                <TuningSlider label="Front Ride Height" value={tuning.springs.heightF} min={5.0} max={30.0} unitType="height" section="springs" field="heightF" step={0.5} disabled={springsFixed} />
                <TuningSlider label="Rear Ride Height" value={tuning.springs.heightR} min={5.0} max={30.0} unitType="height" section="springs" field="heightR" step={0.5} disabled={springsFixed} />
              </>
            )}

            {activeSubTab === 'Damping' && (
              <>
                <TuningSlider label="Front Rebound" value={dampersFixed ? dampingBaseline.frontRebound : tuning.damping.reboundF} min={1.0} max={20.0} unitType="none" section="damping" field="reboundF" baseline={dampingBaseline.frontRebound} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
                <TuningSlider label="Rear Rebound" value={dampersFixed ? dampingBaseline.rearRebound : tuning.damping.reboundR} min={1.0} max={20.0} unitType="none" section="damping" field="reboundR" baseline={dampingBaseline.rearRebound} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
                <TuningSlider label="Front Bump" value={dampersFixed ? dampingBaseline.frontBump : tuning.damping.bumpF} min={1.0} max={20.0} unitType="none" section="damping" field="bumpF" baseline={dampingBaseline.frontBump} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
                <TuningSlider label="Rear Bump" value={dampersFixed ? dampingBaseline.rearBump : tuning.damping.bumpR} min={1.0} max={20.0} unitType="none" section="damping" field="bumpR" baseline={dampingBaseline.rearBump} disabled={dampersFixed} isUnknown={dampersFixed && !hasTheoData} />
              </>
            )}

            {activeSubTab === 'Aero' && (
              <>
                <TuningSlider label="Front Downforce" value={tuning.aero.front} min={50} max={500} unitType="force" section="aero" field="front" step={1} disabled={carParams?.adjustability?.aero === 'Fixed' || carParams?.adjustability?.aero === 'Rear Only'} />
                <TuningSlider label="Rear Downforce" value={tuning.aero.rear} min={50} max={500} unitType="force" section="aero" field="rear" step={1} disabled={carParams?.adjustability?.aero === 'Fixed' || carParams?.adjustability?.aero === 'Front Only'} />
              </>
            )}

            {activeSubTab === 'Brake' && (
              <>
                <TuningSlider label="Braking Balance (% Front)" value={tuning.brake.balance} min={0} max={100} unitType="none" section="brake" field="balance" step={1} disabled={carParams?.adjustability?.brakes === 'Fixed'} />
                <TuningSlider label="Braking Pressure (%)" value={tuning.brake.pressure} min={10} max={200} unitType="none" section="brake" field="pressure" step={1} disabled={carParams?.adjustability?.brakes === 'Fixed'} />
              </>
            )}

            {activeSubTab === 'Differential' && (
              <>
                {(carParams?.drivetrain === 'FWD' || carParams?.drivetrain === 'AWD') && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Front</h4>
                    <TuningSlider label="Acceleration" value={tuning.diff.accelF} min={0} max={100} unitType="none" section="diff" field="accelF" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                    <TuningSlider label="Deceleration" value={tuning.diff.decelF} min={0} max={100} unitType="none" section="diff" field="decelF" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                  </div>
                )}
                {(carParams?.drivetrain === 'RWD' || carParams?.drivetrain === 'AWD') && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Rear</h4>
                    <TuningSlider label="Acceleration" value={tuning.diff.accelR} min={0} max={100} unitType="none" section="diff" field="accelR" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                    <TuningSlider label="Deceleration" value={tuning.diff.decelR} min={0} max={100} unitType="none" section="diff" field="decelR" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                  </div>
                )}
                {carParams?.drivetrain === 'AWD' && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ color: 'var(--text-secondary)' }}>Center</h4>
                    <TuningSlider label="Balance (% Rear)" value={tuning.diff.center} min={0} max={100} unitType="none" section="diff" field="center" step={1} disabled={carParams?.adjustability?.diff === 'Fixed'} />
                  </div>
                )}
              </>
            )}

            {activeSubTab === 'Gearing' && (
              <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', opacity: gearboxFixed ? 0.6 : 1, alignItems: 'center' }}>
                    <div>
                      <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Max RPM {gearboxFixed && <span style={{ color: 'gray', fontSize: '0.8rem', fontWeight: 'normal' }}>(Locked)</span>}</span>
                      {telemetryData?.EngineMaxRpm ? (
                        <span style={{ color: 'var(--primary)', fontSize: '0.7rem', marginLeft: '0.5rem', opacity: 0.8 }}>(Auto-Synced)</span>
                      ) : null}
                    </div>
                    <input type="number" value={tuning.gearing.maxRpm} onChange={(e) => updateSection('gearing', 'maxRpm', parseFloat(e.target.value))} step="100" disabled={gearboxFixed || !!telemetryData?.EngineMaxRpm} style={{ width: '100px', background: gearboxFixed ? 'rgba(0,0,0,0.1)' : 'rgba(255,0,0,0.2)', color: gearboxFixed ? 'gray' : 'white', border: '1px solid rgba(255,0,0,0.5)', borderRadius: '4px', textAlign: 'right', cursor: (gearboxFixed || !!telemetryData?.EngineMaxRpm) ? 'not-allowed' : 'text' }}/>
                  </div>
                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0' }} />
                  <TuningSlider label="Final Drive" value={tuning.gearing.finalDrive} min={limits.finalDriveMin} max={limits.finalDriveMax} unitType="none" section="gearing" field="finalDrive" step={0.01} disabled={gearboxFixed} />
                  
                  {gearboxFull && Array.from({length: numGears}).map((_, i) => (
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
                        type="range" min={limits.gearMin} max={limits.gearMax} step="0.01" 
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
              </>
            )}

            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1.5rem', overflowY: 'auto' }}>
            
            {activeSubTab === 'Tires' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Tires Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Calculates optimized tire pressures based on race type, drivetrain, and current alignment settings.</p>
                
                <div style={{ background: 'rgba(255, 165, 0, 0.1)', borderLeft: '3px solid orange', padding: '0.5rem', borderRadius: '2px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'orange', fontSize: '0.8rem', fontWeight: 'bold' }}>⚠️ Note:</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Tire pressures depend heavily on Alignment (Camber, Toe, Caster). Please ensure your Alignment is set before applying Tire Assist.</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>Drivetrain:</span>
                  <select value={tireDriveType} onChange={(e) => setTireDriveType(e.target.value as Drivetrain)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', width: '120px' }}>
                    <option value="AWD">AWD (四驅)</option>
                    <option value="RWD">RWD (後驅)</option>
                    <option value="FWD">FWD (前驅)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>Race Type:</span>
                  <select value={tireRaceType} onChange={(e) => setTireRaceType(e.target.value as RaceType)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', width: '120px' }}>
                    <option value="Road">Road (公路/街頭)</option>
                    <option value="Rally">Rally (拉力/越野)</option>
                    <option value="Drift">Drift (甩尾賽)</option>
                    <option value="Drag">Drag (直線加速)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setActiveSubTab('Alignment')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white' }}>Go to Alignment</button>
                  <button onClick={applyTireAssist} style={{ ...btnStyle, flex: 2 }}>Apply Tire Assist</button>
                </div>
                
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Alignment Corrections Applied:</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Camber (F/R):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>-{ (0.04 * Math.abs(tuning.alignment.camberF)).toFixed(2) } / -{ (0.04 * Math.abs(tuning.alignment.camberR)).toFixed(2) } bar</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Toe (F/R):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>-{ (0.15 * Math.abs(tuning.alignment.toeF)).toFixed(2) } / -{ (0.15 * Math.abs(tuning.alignment.toeR)).toFixed(2) } bar</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Caster (F):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>-{ (0.01 * Math.max(0, tuning.alignment.caster - 5.0)).toFixed(2) } bar</span>
                </div>
              </div>
            )}

            {activeSubTab === 'Alignment' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Alignment Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Calculates optimized alignment based on Spring Stiffness Ratio (SR), ARB bias, and race type.
                </p>

                <div style={{ background: 'rgba(255, 165, 0, 0.1)', borderLeft: '3px solid orange', padding: '0.5rem', borderRadius: '2px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'orange', fontSize: '0.8rem', fontWeight: 'bold' }}>⚠️ Note:</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Alignment calculations depend heavily on Spring Stiffness Ratio (SR) and ARB bias. Please finish tuning Springs and ARBs first.</p>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>Race Type:</span>
                  <select value={alignRaceType} onChange={(e) => setAlignRaceType(e.target.value as RaceType)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', width: '130px' }}>
                    <option value="Road">Road (公路/街頭)</option>
                    <option value="Rally">Rally (拉力/越野)</option>
                    <option value="Drift">Drift (漂移賽)</option>
                    <option value="Drag">Drag (直線加速)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setActiveSubTab('Springs')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.8rem' }}>Go to Springs</button>
                  <button onClick={() => setActiveSubTab('Anti-roll bars')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.8rem' }}>Go to ARBs</button>
                  <button onClick={applyAlignmentAssist} style={{ ...btnStyle, flex: 2 }}>Apply Alignment Assist</button>
                </div>
                
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Current Spring SR (Stiffness Ratio):</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Front SR:</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>
                    {limits.springMax > limits.springMin 
                      ? ((tuning.springs.front - limits.springMin) / (limits.springMax - limits.springMin)).toFixed(2)
                      : '0.50'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Rear SR:</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>
                    {limits.springMax > limits.springMin 
                      ? ((tuning.springs.rear - limits.springMin) / (limits.springMax - limits.springMin)).toFixed(2)
                      : '0.50'}
                  </span>
                </div>
              </div>
            )}

            {activeSubTab === 'Springs' && (
              <>
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Dynamic Tuning Bounds</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ color: 'gray', fontSize: '0.8rem' }}>Springs Min/Max</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="number" value={limits.springMin} onChange={e => setLimits(p => ({...p, springMin: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                        <input type="number" value={limits.springMax} onChange={e => setLimits(p => ({...p, springMax: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Springs Assist</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Target Natural Frequency (Hz):</span>
                    <select value={targetFreq} onChange={(e) => setTargetFreq(parseFloat(e.target.value))} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px' }}>
                      <option value={1.75}>Soft (1.5 - 2.0 Hz)</option>
                      <option value={2.25}>Medium (2.0 - 2.5 Hz)</option>
                      <option value={2.75}>Hard (2.5 - 3.0 Hz)</option>
                    </select>
                  </div>
                  <button onClick={applySpringsAssist} disabled={springsFixed} style={{ ...btnStyle, opacity: springsFixed ? 0.5 : 1 }}>Apply Springs Assist</button>
                  
                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Theoretical Parameters</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'gray', fontSize: '0.8rem' }}>Base Frequency:</span>
                    <span style={{ color: 'white', fontSize: '0.8rem' }}>2.0 Hz</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'gray', fontSize: '0.8rem' }}>Target Frequency:</span>
                    <span style={{ color: 'white', fontSize: '0.8rem' }}>{targetFreq.toFixed(2)} Hz</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'gray', fontSize: '0.8rem' }}>Frequency Multiplier:</span>
                    <span style={{ color: 'white', fontSize: '0.8rem' }}>{Math.pow(targetFreq / 2.0, 2).toFixed(3)}x</span>
                  </div>
                </div>
              </>
            )}

            {activeSubTab === 'Anti-roll bars' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>ARB Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Calculates base ARB values based on weight distribution and drivetrain.
                </p>
                <button onClick={applyArbAssist} disabled={arbFixed} style={{ ...btnStyle, opacity: arbFixed ? 0.5 : 1 }}>Apply ARB Assist</button>
              </div>
            )}
            
            {activeSubTab === 'Damping' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Damping Assist</span>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Uses Critical Damping formula mapping current spring rates.</p>
                
                <div style={{ background: 'rgba(255, 165, 0, 0.1)', borderLeft: '3px solid orange', padding: '0.5rem', borderRadius: '2px', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'orange', fontSize: '0.8rem', fontWeight: 'bold' }}>⚠️ Note:</span>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Damping calculations map to your current Springs. Please finish tuning Springs first.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Target Rebound Ratio (0.65 - 0.85):</span>
                    <span style={{ color: 'var(--primary)' }}>{reboundRatio.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="1.0" step="0.01" value={reboundRatio} onChange={(e) => setReboundRatio(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--primary)' }} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Target Bump Ratio (0.45 - 0.65):</span>
                    <span style={{ color: 'var(--primary)' }}>{bumpRatio.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.3" max="0.8" step="0.01" value={bumpRatio} onChange={(e) => setBumpRatio(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--primary)' }} />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setActiveSubTab('Springs')} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white' }}>Go to Springs</button>
                  <button onClick={applyDampingAssist} disabled={dampersFixed} style={{ ...btnStyle, flex: 2, opacity: dampersFixed ? 0.5 : 1 }}>Apply Damping Assist</button>
                </div>
                
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Theoretical Parameters</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Front Spring (lbs/in):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>{(tuning.springs.front * 55.9974).toFixed(1)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>Critical Damping (Front):</span>
                  <span style={{ color: 'white', fontSize: '0.8rem' }}>{(2 * Math.sqrt(tuning.springs.front * 55.9974 * (currentWeightLbs * (theoWd/100)))).toFixed(0)}</span>
                </div>
              </div>
            )}
            
            {activeSubTab === 'Differential' && (
              <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Differential Assist</span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={applyDiffBaseline} disabled={carParams?.adjustability?.diff === 'Fixed'} style={{ ...btnStyle, flex: 1 }}>Apply Baseline</button>
                </div>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                <span style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Dynamic Feedback (Manual)</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <select value={slipFeedback} onChange={(e) => setSlipFeedback(e.target.value)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', flex: 1 }}>
                    <option value="none">-- Select Issue --</option>
                    <option value="accel_slip">Inner wheel slip on corner exit</option>
                    <option value="decel_understeer">Understeer on corner entry</option>
                  </select>
                  <button onClick={applyDiffDynamicAdjustment} disabled={slipFeedback === 'none' || carParams?.adjustability?.diff === 'Fixed'} style={{ ...btnStyle, padding: '0.3rem 1rem' }}>Adjust</button>
                </div>
              </div>
            )}

            {activeSubTab === 'Gearing' && (
              <>
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Dynamic Tuning Bounds</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ color: 'gray', fontSize: '0.8rem' }}>Final Drive Min/Max</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="number" value={limits.finalDriveMin} onChange={e => setLimits(p => ({...p, finalDriveMin: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                        <input type="number" value={limits.finalDriveMax} onChange={e => setLimits(p => ({...p, finalDriveMax: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ color: 'gray', fontSize: '0.8rem' }}>Gears Min/Max</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="number" value={limits.gearMin} onChange={e => setLimits(p => ({...p, gearMin: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                        <input type="number" value={limits.gearMax} onChange={e => setLimits(p => ({...p, gearMax: parseFloat(e.target.value)}))} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '0.3rem' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Gearing Assist (Based on 1st Gear)</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Discipline:</span>
                    <select value={gearingDiscipline} onChange={(e) => setGearingDiscipline(e.target.value as any)} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px' }}>
                      <option value="GT">GT (Circuit / Logarithmic)</option>
                      <option value="Rally">Rally (Constant / High Torque)</option>
                      <option value="Drift">Drift (Step / Platform)</option>
                    </select>
                  </div>
                  {gearingDiscipline === 'GT' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>Mech Balance (Front Ratio):</span>
                        <input type="number" min="0" max="1" step="0.001" value={gearingAssistParams.mechBalance} onChange={(e) => setGearingAssistParams(p => ({...p, mechBalance: parseFloat(e.target.value)}))} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.2rem', borderRadius: '4px', textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>Aero Drag Index:</span>
                        <input type="number" min="0" max="1" step="0.001" value={gearingAssistParams.aeroEfficiency} onChange={(e) => setGearingAssistParams(p => ({...p, aeroEfficiency: parseFloat(e.target.value)}))} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.2rem', borderRadius: '4px', textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.8rem' }}>Aero Balance (Front Ratio):</span>
                        <input type="number" min="0" max="1" step="0.001" value={gearingAssistParams.aeroBalance} onChange={(e) => setGearingAssistParams(p => ({...p, aeroBalance: parseFloat(e.target.value)}))} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.2rem', borderRadius: '4px', textAlign: 'right' }} />
                      </div>
                    </div>
                  )}
                  <button onClick={applySuggestedGearing} style={{ background: 'var(--primary)', color: 'black', border: 'none', padding: '0.5rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Apply Envelope to Gears 2-{numGears}</button>

                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Secondary Correction (Drag Optimizer)</span>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Anchors 1st Gear and Top Gear, generating a custom drag-optimized curve in between.</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>Calculated Mechanical Limit:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{calcSpeed(tuning.gearing.maxRpm, tuning.gearing.gears[numGears - 1] || 1).toFixed(1)} {convertSpeed(1).label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem' }}>In-Game Top Speed ({convertSpeed(1).label}):</span>
                    <input type="number" value={inGameTopSpeed} onChange={(e) => setInGameTopSpeed(parseFloat(e.target.value))} style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid gray', padding: '0.3rem', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                  <button onClick={applyDragCorrection} style={{ background: 'var(--primary)', color: 'black', border: 'none', padding: '0.5rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Anchor Top Gear & Smooth</button>
                </div>
                
                <div style={{ flex: 1, minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="speed" type="number" domain={[0, xMax]} ticks={xTicks10s} tickFormatter={(val) => val % 50 === 0 ? val : ''} stroke="var(--text-secondary)" label={{ value: \`Speed (\${convertSpeed(1/3.6).label})\`, position: 'bottom', fill: 'var(--text-secondary)' }} />
                      <YAxis type="number" domain={[0, yMax]} ticks={yTicks100s} tickFormatter={(val) => val % 1000 === 0 ? val : ''} stroke="var(--text-secondary)" label={{ value: 'Engine RPM', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }} labelFormatter={(val) => \`Speed: \${Number(val).toFixed(1)} \${convertSpeed(1/3.6).label}\`} />
                      {xTicks50s.map(val => <ReferenceLine key={\`x-\${val}\`} x={val} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />)}
                      {yTicks1000s.map(val => <ReferenceLine key={\`y-\${val}\`} y={val} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />)}
                      <ReferenceLine y={maxRpm} stroke="red" strokeDasharray="5 5" label={{ position: 'top', value: 'Redline', fill: 'red' }} />
                      {Array.from({length: numGears}).map((_, i) => (
                        <Line key={\`gear-\${i}\`} type="linear" dataKey={\`gear\${i+1}\`} stroke={\`hsl(\${i * 45}, 80%, 60%)\`} strokeWidth={3} dot={false} isAnimationActive={false} connectNulls={true} />
                      ))}
                      <Line type="monotone" dataKey="currentEnvelope" stroke="rgba(255,255,255,0.8)" strokeWidth={2} strokeDasharray="5 5" dot={{r: 4, fill: 'white'}} isAnimationActive={false} connectNulls={true} name="Current Envelope" />
                      <Line type="monotone" dataKey="theoreticalEnvelope" stroke="var(--primary)" strokeWidth={2} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={true} name="Theoretical Envelope" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            
            </div>
          </div>`;

code = code.substring(0, startIdx) + newCode + code.substring(endIdx);
fs.writeFileSync(path, code, 'utf8');
console.log('Update complete.');
