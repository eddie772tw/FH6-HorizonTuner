import { useCarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';

/** Vehicle/profile navigation only; evidence qualification stays with the archive owner. */
export function TuneVehicleSelector() {
  const { t } = useSettings();
  const { carId, carsWithParams, setCarId, selectionSource, followLiveCar, telemetryCarId,
    loadedCarId, profileError, savedCarsStatus } = useCarParams();
  const selected = selectionSource === 'saved' && carsWithParams?.some(car => car.id === carId) ? carId : '';
  return <section className="glass-panel p-3 mb-3" aria-label={t('Tune vehicle selection')}>
    <div className="d-flex flex-wrap align-items-end gap-2">
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <label className="form-label" htmlFor="tune-saved-vehicle">{t('Saved vehicle / profile')}</label>
        <select id="tune-saved-vehicle" className="form-select" value={selected}
          disabled={!carsWithParams?.length} aria-describedby="tune-vehicle-source"
          onChange={event => { if (event.target.value) setCarId(event.target.value); }}>
          <option value="" disabled>{t(savedCarsStatus === 'loading' ? 'Loading saved vehicles…' : savedCarsStatus === 'error'
            ? 'Saved vehicles are unavailable.' : !carsWithParams?.length ? 'No saved vehicle profiles.' : 'Choose a saved vehicle')}</option>
          {carsWithParams?.map(car => <option key={car.id} value={car.id}>{car.name} · {car.id}</option>)}
        </select>
      </div>
      <button type="button" className="btn btn-outline-secondary" disabled={!telemetryCarId || selectionSource === 'live'}
        onClick={followLiveCar}>{t('Follow Data Out')}</button>
    </div>
    <div id="tune-vehicle-source" className="small text-body-secondary mt-2" role="status">
      {t(selectionSource === 'saved' ? 'Saved vehicle · offline' : selectionSource === 'live' ? 'Following Data Out' : 'Waiting for Data Out or a saved vehicle')}
      {' · '}{t(profileError ? 'Vehicle profile is unavailable. Retrying…' : loadedCarId !== carId ? 'Loading vehicle profile…' : 'Vehicle profile loaded')}
    </div>
    <p className="small text-body-secondary mb-0 mt-2">{t('Select a saved profile, then open Engine data & gearing to confirm a compatible saved observation. Offline selection does not supply live telemetry. A new Data Out vehicle or reconnection resumes live selection.')}</p>
  </section>;
}
