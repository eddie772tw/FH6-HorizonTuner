#[cfg(test)]
mod tests {
    use fh6_backend::{
        app::App,
        motec,
        network::{ApiRequest, Backend},
        telemetry::{
            parse_packet, ActiveRoute, DragRecorder, RaceRecorder, RaceRecorderConfig,
            RecorderCommand, TelemetryStore,
        },
    };
    use serde_json::{json, Value};
    use std::collections::BTreeMap;

    fn route(mode: &str) -> ActiveRoute {
        ActiveRoute {
            route_id: "09c0201b-a5be-42a4-83c0-04a104fe1e4d".into(),
            name: "Review route".into(),
            mode: mode.into(),
            start_x: 0.0,
            start_y: 0.0,
            start_z: 0.0,
            start_radius: 5.0,
            end_x: Some(100.0),
            end_y: Some(0.0),
            end_z: Some(0.0),
            end_radius: Some(5.0),
        }
    }

    fn frame(x: f64, ts: f64) -> Value {
        json!({"PositionX":x,"PositionY":0.0,"PositionZ":0.0,"TimestampMS":ts,"CarOrdinal":1,"IsRaceOn":0,"SpeedMetersPerSecond":10.0,"LapNumber":0})
    }

    fn points(recorder: &mut RaceRecorder) -> Vec<Value> {
        recorder
            .drain_commands()
            .into_iter()
            .flat_map(|c| match c {
                RecorderCommand::WritePoints { points, .. } => points,
                _ => vec![],
            })
            .collect()
    }

    fn request(app: &App, method: &str, path: &str, body: Value) -> Result<Value, String> {
        app.request(ApiRequest {
            method: method.into(),
            path: path.into(),
            query: BTreeMap::new(),
            headers: Default::default(),
            body: serde_json::to_vec(&body).unwrap(),
            upload_filename: None,
        })
        .map(|r| serde_json::from_slice(&r.body).unwrap())
        .map_err(|e| format!("{e:?}"))
    }

    #[test]
    fn full_free_roam_packet_reaches_recording_pipeline() {
        let mut packet = vec![0u8; 324];
        packet[4..8].copy_from_slice(&1000u32.to_le_bytes());
        assert!(
            parse_packet(&packet).is_ok(),
            "324-byte free-roam packet rejected: {:?}",
            parse_packet(&packet)
        );
    }

    #[test]
    fn recording_decisions_are_independent_of_is_race_on() {
        let mut disabled_flag = RaceRecorder::new(RaceRecorderConfig::default());
        let mut enabled_flag = RaceRecorder::new(RaceRecorderConfig::default());
        let mut observed = frame(0.0, 1000.0);
        observed["CurrentRaceTime"] = json!(1.0);
        observed["CurrentLap"] = json!(1.0);
        observed["LapNumber"] = json!(1);
        disabled_flag.record_at(&observed, 1.0);
        observed["IsRaceOn"] = json!(1);
        enabled_flag.record_at(&observed, 1.0);
        assert_eq!(
            disabled_flag.status().is_recording,
            enabled_flag.status().is_recording,
            "identical evidence changes eligibility when unreliable IsRaceOn changes"
        );
    }

    #[test]
    fn arming_while_inside_waits_for_a_new_entry() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.record_at(&frame(0.0, 1000.0), 1.0);
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(0.0, 1100.0), 1.1);
        assert!(
            !r.status().is_recording,
            "stationary inside gate starts immediately"
        );
    }

    #[test]
    fn armed_custom_route_works_with_auto_recording_disabled() {
        let mut r = RaceRecorder::new_with_context(
            RaceRecorderConfig::default(),
            json!({"race_recording":false}),
            json!({}),
        );
        r.arm_route(route("time_trial")).unwrap();
        let mut before = frame(-10.0, 1000.0);
        let mut crossing = frame(0.0, 1100.0);
        before["IsRaceOn"] = json!(1);
        crossing["IsRaceOn"] = json!(1);
        r.record_at(&before, 1.0);
        r.record_at(&crossing, 1.1);
        assert!(
            r.status().is_recording,
            "default race_recording=false disables armed route start"
        );
    }

    #[test]
    fn second_swept_crossing_closes_time_trial_lap() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        for (x, ts) in [
            (-10.0, 1000.0),
            (0.0, 1100.0),
            (20.0, 1200.0),
            (-20.0, 1300.0),
        ] {
            r.record_at(&frame(x, ts), ts / 1000.0);
        }
        r.save_latest_and_clear("manual-stop");
        let pts = points(&mut r);
        assert_eq!(
            pts.last().unwrap()["LapNumber"],
            2,
            "swept re-entry never advances lap: {pts:?}"
        );
    }

    #[test]
    fn roaming_persists_destination_crossing_sample() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("roaming")).unwrap();
        for (x, ts) in [
            (-10.0, 1000.0),
            (0.0, 2000.0),
            (50.0, 3000.0),
            (100.0, 4000.0),
        ] {
            r.record_at(&frame(x, ts), ts / 1000.0);
        }
        assert!(!r.status().is_recording);
        let pts = points(&mut r);
        assert_eq!(
            pts.last().unwrap()["TimestampMS"],
            4000.0,
            "destination frame discarded: {pts:?}"
        );
    }

    fn time_trial_points() -> Vec<Value> {
        [0, 1, 2, 3]
            .into_iter()
            .map(|t| {
                json!({"time":t,"TimestampMS":t*1000,"LapNumber":if t<2 {1}else{2},"IsRaceOn":0,"SpeedMetersPerSecond":10.0})
            })
            .collect()
    }

    #[test]
    fn time_trial_duration_includes_closing_crossing() {
        let dir = tempfile::tempdir().unwrap();
        let store = TelemetryStore::new(&dir.path().join("timing.db")).unwrap();
        store.create_session("review", 1, "Car", 0, 0, 0.0).unwrap();
        store
            .insert_points_batch("review", &time_trial_points())
            .unwrap();
        store
            .finalize_session(
                "review",
                json!({"recording_mode":"time_trial","endReason":"manual-stop"}),
            )
            .unwrap();
        let laps = store.get_session_laps("review").unwrap();
        assert_eq!(
            laps[0]["lap_time"], 2.0,
            "crossings are t=0 and t=2, lap rows: {laps:?}"
        );
    }

    #[test]
    fn time_trial_trim_excludes_unclosed_tail() {
        let dir = tempfile::tempdir().unwrap();
        let store = TelemetryStore::new(&dir.path().join("trim.db")).unwrap();
        store.create_session("review", 1, "Car", 0, 0, 0.0).unwrap();
        store
            .insert_points_batch("review", &time_trial_points())
            .unwrap();
        store
            .finalize_session(
                "review",
                json!({"recording_mode":"time_trial","endReason":"manual-stop"}),
            )
            .unwrap();
        let metadata = store.get_session_metadata("review").unwrap();
        assert!(
            metadata["trim_analysis"]["valid_end_time"]
                .as_f64()
                .unwrap()
                <= 2.0,
            "unclosed tail remains in trimmed window: {metadata:?}"
        );
    }

    #[test]
    fn incomplete_fragment_never_becomes_fastest_lap() {
        let laps = vec![
            json!({"lap_number":1,"lap_time":60.0,"observed_span":60.0,"complete":1}),
            json!({"lap_number":2,"lap_time":null,"observed_span":2.0,"complete":0}),
        ];
        let xml = motec::generate_ldx_xml(&laps, &[]);
        assert!(
            xml.contains("Id=\"Fastest Lap\" Value=\"1\""),
            "incomplete tail wins fastest lap: {xml}"
        );
    }

    #[test]
    fn trimmed_ldx_beacons_stay_on_exported_time_axis() {
        let laps = vec![json!({"lap_number":1,"lap_time":60.0,"observed_span":60.0,"complete":1})];
        let pts = vec![
            json!({"time":10.0,"LapNumber":1}),
            json!({"time":50.0,"LapNumber":1}),
        ];
        let xml = motec::generate_ldx_xml(&laps, &pts);
        assert!(
            !xml.contains("Time=\"6.00000000000000000E+07\""),
            "60s beacon extends past 40s trimmed log: {xml}"
        );
    }

    #[test]
    fn unsupported_route_schema_does_not_import() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let mut doc = serde_json::to_value(route("roaming")).unwrap();
        doc["route_id"] = json!("not-a-uuid");
        doc["end_x"] = Value::Null;
        doc["end_y"] = Value::Null;
        doc["end_z"] = Value::Null;
        let result = request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            json!({"schema":"fh6-custom-route/v999","route":doc}),
        );
        assert!(
            result.is_err(),
            "unsupported schema, invalid UUID and missing destination accepted: {result:?}"
        );
    }

    #[test]
    fn failed_batch_import_does_not_partially_persist_routes() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let good = serde_json::to_value(route("time_trial")).unwrap();
        let bad = json!({"route_id":"b","name":"bad","mode":"roaming"});
        assert!(request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            json!({"routes":[good,bad]})
        )
        .is_err());
        assert!(
            app.database.list_routes().unwrap().is_empty(),
            "failed import has already changed existing route set"
        );
    }

    #[test]
    fn invalid_timestamp_cannot_finish_roaming_route() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("roaming")).unwrap();
        r.record_at(&frame(-10.0, 1000.0), 1.0);
        r.record_at(&frame(0.0, 2000.0), 2.0);
        r.record_at(&frame(50.0, 3000.0), 3.0);
        r.record_at(&frame(100.0, 2500.0), 4.0);
        assert!(
            r.status().is_recording,
            "regressed packet incorrectly finalizes as destination-reached"
        );
    }

    #[test]
    fn drag_recorder_records_in_free_roam_without_immediate_abort() {
        let mut r = fh6_backend::telemetry::DragRecorder::default();
        r.prepare();
        r.record(&json!({"SpeedMetersPerSecond":0.1,"Gear":1,"AccelInput":255,"TimestampMS":1000,"IsRaceOn":0,"CarOrdinal":42}));
        assert_eq!(
            r.status(),
            "recording",
            "drag recorder should not abort on frame 1 in free roam"
        );
        r.record(&json!({"SpeedMetersPerSecond":15.0,"Gear":2,"AccelInput":255,"TimestampMS":2000,"IsRaceOn":0}));
        assert_eq!(r.status(), "recording");
        r.record(&json!({"SpeedMetersPerSecond":25.0,"Gear":3,"AccelInput":0,"TimestampMS":2100,"IsRaceOn":0}));
        r.record(&json!({"SpeedMetersPerSecond":25.0,"Gear":3,"AccelInput":0,"TimestampMS":3000,"IsRaceOn":0}));
        assert_eq!(r.status(), "finished");
        assert!(r.analysis().get("drivetrain").is_some());
    }

    #[test]
    fn invalid_schema_and_radius_types_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let mut doc = serde_json::to_value(route("roaming")).unwrap();
        doc["start_radius"] = json!("not-a-number");
        let res = request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            json!({"schema":"fh6-custom-route/v1","route":doc}),
        );
        assert!(res.is_err(), "non-numeric start_radius must be rejected");

        let doc2 = serde_json::to_value(route("time_trial")).unwrap();
        let res2 = request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            json!({"schema":12345,"route":doc2}),
        );
        assert!(res2.is_err(), "numeric schema must be rejected");
    }

    #[test]
    fn regressed_timestamp_while_armed_is_rejected() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(-10.0, 2000.0), 1.0);
        assert!(!r.status().is_recording);
        r.record_at(&frame(0.0, 1000.0), 1.1);
        assert!(
            !r.status().is_recording,
            "regressed timestamp packet must not trigger gate entry"
        );
    }

    #[test]
    fn drag_recording_does_not_stop_when_unreliable_flag_changes() {
        let mut r = DragRecorder::default();
        r.prepare();
        r.record(
            &json!({"TimestampMS":1000,"CarOrdinal":1,"SpeedMetersPerSecond":0.1,
                        "Gear":1,"AccelInput":255,"IsRaceOn":1}),
        );
        assert_eq!(r.status(), "recording");
        r.record(
            &json!({"TimestampMS":1100,"CarOrdinal":1,"SpeedMetersPerSecond":10.0,
                        "Gear":1,"AccelInput":255,"IsRaceOn":0}),
        );
        assert_eq!(
            r.status(),
            "recording",
            "flag change alone stopped valid recording"
        );
    }

    #[test]
    fn parked_inside_arming_waits_with_auto_recording_disabled() {
        let mut r = RaceRecorder::new_with_context(
            RaceRecorderConfig::default(),
            json!({"race_recording":false}),
            json!({}),
        );
        r.record_at(&frame(0.0, 1000.0), 1.0);
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(0.0, 1100.0), 1.1);
        assert!(
            !r.status().is_recording,
            "parked car starts immediately under default setting"
        );
    }

    #[test]
    fn missing_timestamp_point_cannot_create_a_start_crossing() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(20.0, 1000.0), 1.0);
        let mut invalid = frame(0.0, 1050.0);
        invalid.as_object_mut().unwrap().remove("TimestampMS");
        r.record_at(&invalid, 1.05);
        r.record_at(&frame(20.0, 1100.0), 1.1);
        assert!(
            !r.status().is_recording,
            "invalid point fabricates crossing between identical valid positions"
        );
    }

    #[test]
    fn armed_crossing_cannot_connect_two_different_cars() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(-20.0, 1000.0), 1.0);
        let mut other_car = frame(20.0, 1100.0);
        other_car["CarOrdinal"] = json!(2);
        r.record_at(&other_car, 1.1);
        assert!(
            !r.status().is_recording,
            "different vehicles are connected into a false crossing"
        );
    }

    #[test]
    fn armed_crossing_cannot_bridge_a_long_telemetry_gap() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(-20.0, 1000.0), 1.0);
        r.tick(61.0);
        r.record_at(&frame(20.0, 61000.0), 61.0);
        assert!(
            !r.status().is_recording,
            "60-second gap is joined into a false crossing"
        );
    }

    #[test]
    fn zero_origin_trimmed_ldx_does_not_include_unclosed_tail_beacon() {
        let laps = vec![
            json!({"lap_number":1,"lap_time":60.0,"observed_span":60.0,"complete":1}),
            json!({"lap_number":2,"lap_time":null,"observed_span":2.0,"complete":0}),
        ];
        let points = vec![
            json!({"time":0.0,"LapNumber":1}),
            json!({"time":60.0,"LapNumber":2}),
        ];
        let xml = motec::generate_ldx_xml(&laps, &points);
        assert!(
            !xml.contains("Time=\"6.20000000000000000E+07\""),
            "62s tail beacon exceeds 60s exported log: {xml}"
        );
    }

    #[test]
    fn timestamp_regression_breaks_the_gate_chain() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        for (x, ts) in [(-20.0, 2000.0), (20.0, 1000.0), (20.0, 2100.0)] {
            r.record_at(&frame(x, ts), 1.0);
        }
        assert!(!r.status().is_recording);
    }

    #[test]
    fn first_inside_sample_is_only_a_baseline() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(0.0, 1000.0), 1.0);
        r.record_at(&frame(0.0, 1100.0), 1.1);
        assert!(!r.status().is_recording);
        r.record_at(&frame(20.0, 1200.0), 1.2);
        r.record_at(&frame(0.0, 1300.0), 1.3);
        assert!(r.status().is_recording);
    }

    #[test]
    fn first_inside_sample_after_gap_cannot_finish_or_close() {
        for mode in ["time_trial", "roaming"] {
            let mut r = RaceRecorder::new(RaceRecorderConfig::default());
            r.arm_route(route(mode)).unwrap();
            for (x, ts) in [(-20.0, 1000.0), (0.0, 1100.0), (50.0, 1200.0)] {
                r.record_at(&frame(x, ts), ts / 1000.0);
            }
            r.record_at(
                &frame(if mode == "roaming" { 100.0 } else { 0.0 }, 6000.0),
                1.3,
            );
            assert!(r.status().is_recording);
            r.save_latest_and_clear("manual-stop");
            assert!(points(&mut r).iter().all(|p| p["LapNumber"] == 1));
        }
    }

    #[test]
    fn recording_cannot_be_relabelled_by_arming() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.start_manual(1, "Car".into(), 0, 700, 0.0).unwrap();
        let original_id = r.status().current_session_id;
        assert!(r.arm_route(route("time_trial")).is_err());
        assert_eq!(r.status().recording_mode, "circuit");
        assert_eq!(r.status().current_session_id, original_id);
    }

    #[test]
    fn manual_route_ignores_game_clock_restart_and_preserves_snapshot() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("time_trial")).unwrap();
        r.record_at(&frame(-20.0, 1000.0), 1.0);
        let mut start = frame(0.0, 1100.0);
        start["CurrentRaceTime"] = json!(20.0);
        r.record_at(&start, 1.1);
        let mut next = frame(20.0, 1200.0);
        next["CurrentRaceTime"] = json!(1.0);
        r.record_at(&next, 1.2);
        assert!(r.status().manual_mode);
        assert_eq!(r.status().recording_mode, "time_trial");
        r.save_latest_and_clear("manual-stop");
        let metadata = r
            .drain_commands()
            .into_iter()
            .find_map(|c| match c {
                RecorderCommand::Finalize { metadata, .. } => Some(metadata),
                _ => None,
            })
            .unwrap();
        assert_eq!(
            metadata["route_snapshot"],
            serde_json::to_value(route("time_trial")).unwrap()
        );
    }

    #[test]
    fn roaming_is_one_trip_and_retains_original_game_lap() {
        let mut r = RaceRecorder::new(RaceRecorderConfig::default());
        r.arm_route(route("roaming")).unwrap();
        r.record_at(&frame(-20.0, 1000.0), 1.0);
        for (x, ts, lap) in [(0.0, 1100.0, 1), (50.0, 1200.0, 2), (100.0, 1300.0, 2)] {
            let mut f = frame(x, ts);
            f["LapNumber"] = json!(lap);
            r.record_at(&f, ts / 1000.0);
        }
        let recorded = points(&mut r);
        assert!(recorded.iter().all(|p| p["LapNumber"] == 1));
        assert_eq!(recorded.last().unwrap()["gameLapNumber"], 2);
    }

    #[test]
    fn duplicate_uuid_batch_is_rejected_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let one = serde_json::to_value(route("time_trial")).unwrap();
        let mut two = one.clone();
        two["name"] = json!("Second");
        assert!(request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            json!({"schema":"fh6-custom-route/v1", "routes":[one,two]})
        )
        .is_err());
        assert!(app.database.list_routes().unwrap().is_empty());
    }

    #[test]
    fn wrong_route_mode_does_not_replace_an_active_recording() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let r = serde_json::to_value(route("time_trial")).unwrap();
        request(&app, "POST", "/api/analysis/routes", r.clone()).unwrap();
        let started = request(&app, "POST", "/api/analysis/recorder/start", json!({})).unwrap();
        assert!(request(
            &app,
            "POST",
            "/api/analysis/recorder/start",
            json!({"mode":"roaming", "route_id":r["route_id"]})
        )
        .is_err());
        let status = request(&app, "GET", "/api/analysis/status", json!({})).unwrap();
        assert_eq!(status["currentSessionId"], started["sessionId"]);
    }

    #[test]
    fn save_current_endpoint_finalizes_and_flushes_the_session() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let started = request(&app, "POST", "/api/analysis/recorder/start", json!({})).unwrap();
        let saved = request(
            &app,
            "POST",
            "/api/analysis/sessions/save_latest",
            json!({}),
        )
        .unwrap();
        assert_eq!(saved["filename"], started["sessionId"]);
        let meta = app
            .database
            .get_session_metadata(saved["filename"].as_str().unwrap())
            .unwrap();
        assert_eq!(meta["state"], "finalized");
        assert_eq!(meta["endReason"], "manual-save");
    }

    #[test]
    fn motec_boost_and_discrete_channels_preserve_units_and_event_times() {
        let metadata = json!({"session_id":"boost"});
        let samples = vec![
            json!({"time":0.0,"LapNumber":1,"Gear":1,"Boost":151987.5}),
            json!({"time":1.0,"LapNumber":2,"Gear":2,"Boost":151987.5}),
        ];
        let csv = motec::export(&metadata, &samples).unwrap();
        let (_, imported) = motec::import(&csv).unwrap();
        let boost = imported[0]["Boost"].as_f64().unwrap();
        assert!((boost - 151987.5).abs() < 1.0, "boost unit drift: {boost}");
        let resampled = motec::resample_to_grid(&samples, 10.0);
        assert!((resampled[0].channels[14] - 22.044).abs() < 0.01);
        assert_eq!(resampled[6].channels[2], 1.0);
        assert_eq!(resampled[6].channels[5], 1.0);
        assert_eq!(resampled[10].channels[2], 2.0);
    }

    #[test]
    fn ldx_uses_observed_window_and_never_completes_unknown_fragments() {
        let laps = vec![
            json!({"lap_number":1,"complete":0,"observed_span":40}),
            json!({"lap_number":2,"complete":1,"lap_time":60}),
            json!({"lap_number":3,"complete":0}),
        ];
        let samples = vec![
            json!({"time":0.0,"LapNumber":1}),
            json!({"time":40.0,"LapNumber":2}),
            json!({"time":100.0,"LapNumber":3}),
        ];
        let xml = motec::generate_ldx_xml(&laps, &samples);
        assert!(xml.contains("Time=\"4.00000000000000000E+07\""));
        assert!(xml.contains("Time=\"1.00000000000000000E+08\""));
        assert!(!xml.contains("Time=\"6.00000000000000000E+07\""));
        let cropped = motec::generate_ldx_xml(
            &laps,
            &[
                json!({"time":45.0,"LapNumber":2}),
                json!({"time":90.0,"LapNumber":2}),
            ],
        );
        assert!(cropped.contains("Id=\"Total Laps\" Value=\"0\""));
        let unknown = motec::generate_ldx_xml(
            &[],
            &[
                json!({"time":0.0,"LapNumber":1}),
                json!({"time":10.0,"LapNumber":1}),
            ],
        );
        assert!(!unknown.contains("Id=\"Fastest Time\""));
    }

    fn persist_recording(store: &TelemetryStore, recorder: &mut RaceRecorder) -> String {
        let mut id = String::new();
        for command in recorder.drain_commands() {
            match command {
                RecorderCommand::CreateSession {
                    session_id,
                    car_ordinal,
                    car_name,
                    car_class,
                    car_pi,
                    start_time,
                } => {
                    store
                        .create_session(
                            &session_id,
                            car_ordinal,
                            &car_name,
                            car_class,
                            car_pi,
                            start_time,
                        )
                        .unwrap();
                    id = session_id;
                }
                RecorderCommand::WritePoints { session_id, points } => {
                    store.insert_points_batch(&session_id, &points).unwrap()
                }
                RecorderCommand::Finalize {
                    session_id,
                    metadata,
                } => {
                    store.finalize_session(&session_id, metadata).unwrap();
                }
            }
        }
        id
    }

    #[test]
    fn broken_custom_lap_is_excluded_and_a_later_continuous_lap_recovers() {
        let dir = tempfile::tempdir().unwrap();
        let store = TelemetryStore::new(&dir.path().join("recover.db")).unwrap();
        let mut recorder = RaceRecorder::new(RaceRecorderConfig::default());
        recorder.arm_route(route("time_trial")).unwrap();
        for (x, ts) in [(-20.0, 1000.0), (0.0, 1100.0), (20.0, 1200.0)] {
            recorder.record_at(&frame(x, ts), ts / 1000.0);
        }
        let mut broken = frame(20.0, 1300.0);
        broken.as_object_mut().unwrap().remove("PositionX");
        recorder.record_at(&broken, 1.3);
        for (x, ts) in [(20.0, 1400.0), (0.0, 1500.0), (20.0, 1600.0), (0.0, 1700.0)] {
            recorder.record_at(&frame(x, ts), ts / 1000.0);
        }
        recorder.save_latest_and_clear("manual-stop");
        let id = persist_recording(&store, &mut recorder);
        let laps = store.get_session_laps(&id).unwrap();
        assert_eq!(laps[0]["complete"], 0);
        assert!(laps[0]["lap_time"].is_null());
        assert_eq!(laps[1]["complete"], 1);
        let meta = store.get_session_metadata(&id).unwrap();
        assert_eq!(meta["completeLaps"], 1);
        assert_eq!(meta["invalid_laps"], json!([1]));
        assert_eq!(
            meta["trim_analysis"]["valid_lap_windows"],
            json!([{"lap_number":2,"start_time":0.4,"end_time":0.6}])
        );
        assert_eq!(meta["trim_analysis"]["trimmed_sample_count"], 3);
    }

    #[test]
    fn broken_roaming_trip_has_no_valid_samples_and_raw_export_is_explicit() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let mut recorder = RaceRecorder::new(RaceRecorderConfig::default());
        recorder.arm_route(route("roaming")).unwrap();
        for (x, ts) in [(-20.0, 1000.0), (0.0, 1100.0), (20.0, 1200.0)] {
            recorder.record_at(&frame(x, ts), ts / 1000.0);
        }
        let mut broken = frame(20.0, 1300.0);
        broken.as_object_mut().unwrap().remove("PositionX");
        recorder.record_at(&broken, 1.3);
        for (x, ts) in [(20.0, 1400.0), (100.0, 1500.0)] {
            recorder.record_at(&frame(x, ts), ts / 1000.0);
        }
        let id = persist_recording(&app.database, &mut recorder);
        let meta = app.database.get_session_metadata(&id).unwrap();
        assert_eq!(meta["endReason"], "destination-reached");
        assert_eq!(meta["completeLaps"], 0);
        assert_eq!(meta["trim_analysis"]["trimmed_sample_count"], 0);
        assert!(request(
            &app,
            "GET",
            &format!("/api/analysis/export/motec/{id}"),
            json!({})
        )
        .is_err());
        let raw = app
            .request(ApiRequest {
                method: "GET".into(),
                path: format!("/api/analysis/export/motec/{id}"),
                query: BTreeMap::from([("raw".into(), "true".into())]),
                headers: Default::default(),
                body: vec![],
                upload_filename: None,
            })
            .unwrap();
        assert!(String::from_utf8(raw.body).unwrap().contains("Time"));
    }

    #[test]
    fn custom_modes_cannot_bypass_the_armed_start_gate_via_manual_api() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        for mode in ["time_trial", "roaming"] {
            assert!(request(
                &app,
                "POST",
                "/api/analysis/recorder/start",
                json!({"mode":mode})
            )
            .is_err());
            let status = request(&app, "GET", "/api/analysis/status", json!({})).unwrap();
            assert_eq!(status["isRecording"], false);
        }
    }

    #[test]
    fn public_route_creation_and_share_import_enforce_uuid_without_collision_relabeling() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        let mut invalid = serde_json::to_value(route("time_trial")).unwrap();
        invalid["route_id"] = json!("not-a-uuid");
        assert!(request(&app, "POST", "/api/analysis/routes", invalid).is_err());
        let valid = serde_json::to_value(route("time_trial")).unwrap();
        assert!(request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            json!({"route":valid.clone()})
        )
        .is_err());
        request(&app, "POST", "/api/analysis/routes", valid.clone()).unwrap();
        let exported = request(
            &app,
            "GET",
            &format!(
                "/api/analysis/routes/{}/export",
                valid["route_id"].as_str().unwrap()
            ),
            json!({}),
        )
        .unwrap();
        assert!(request(
            &app,
            "POST",
            "/api/analysis/routes/import",
            exported.clone()
        )
        .is_err());
        assert_eq!(app.database.list_routes().unwrap().len(), 1);
        let other_dir = tempfile::tempdir().unwrap();
        let other_app = App::new(other_dir.path()).unwrap();
        request(&other_app, "POST", "/api/analysis/routes/import", exported).unwrap();
        let imported = other_app.database.list_routes().unwrap();
        assert_eq!(imported[0]["route_id"], valid["route_id"]);
        assert_eq!(imported[0]["start_radius"], valid["start_radius"]);
        for uuid in [Value::Null, json!(""), json!(123)] {
            let mut missing = valid.clone();
            missing["route_id"] = uuid;
            assert!(request(
                &other_app,
                "POST",
                "/api/analysis/routes/import",
                json!({"schema":"fh6-custom-route/v1","route":missing})
            )
            .is_err());
        }
        let mut absent = valid.clone();
        absent.as_object_mut().unwrap().remove("route_id");
        assert!(request(
            &other_app,
            "POST",
            "/api/analysis/routes/import",
            json!({"schema":"fh6-custom-route/v1","route":absent})
        )
        .is_err());
        let mut uppercase = valid.clone();
        uppercase["route_id"] = json!(valid["route_id"].as_str().unwrap().to_uppercase());
        assert!(request(
            &other_app,
            "POST",
            "/api/analysis/routes/import",
            json!({"schema":"fh6-custom-route/v1","routes":[valid.clone(),uppercase]})
        )
        .is_err());
        assert_eq!(other_app.database.list_routes().unwrap().len(), 1);
    }

    #[test]
    fn imported_zero_based_laps_are_normalized_once_for_selection() {
        let samples = vec![
            json!({"time":0,"LapNumber":0}),
            json!({"time":60,"LapNumber":1}),
            json!({"time":120,"LapNumber":2}),
        ];
        let csv = motec::export(&json!({}), &samples).unwrap();
        let (_, imported) = motec::import(&csv).unwrap();
        assert_eq!(
            imported
                .iter()
                .map(|p| p["LapNumber"].as_i64().unwrap())
                .collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
        let csv = motec::export(&json!({}), &imported).unwrap();
        let (_, twice) = motec::import(&csv).unwrap();
        assert_eq!(
            twice
                .iter()
                .map(|p| p["LapNumber"].as_i64().unwrap())
                .collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn native_default_export_rejects_disjoint_valid_laps_and_csv_preserves_the_gap() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::new(dir.path()).unwrap();
        app.database
            .create_session("gap", 1, "Car", 0, 0, 0.0)
            .unwrap();
        let points: Vec<_> = [1, 1, 2, 2, 3, 3, 4]
            .into_iter()
            .enumerate()
            .map(|(t, lap)| json!({"time":t,"LapNumber":lap,"SpeedMetersPerSecond":10}))
            .collect();
        app.database.insert_points_batch("gap", &points).unwrap();
        app.database
            .finalize_session(
                "gap",
                json!({"recording_mode":"time_trial","invalid_laps":[2]}),
            )
            .unwrap();
        let get = |query: BTreeMap<String, String>| {
            app.request(ApiRequest {
                method: "GET".into(),
                path: "/api/analysis/export/motec/gap".into(),
                query,
                headers: Default::default(),
                body: vec![],
                upload_filename: None,
            })
        };
        assert!(get(BTreeMap::from([("format".into(), "ld".into())])).is_err());
        let csv = get(BTreeMap::new()).unwrap();
        let (_, exported) = motec::import(&csv.body).unwrap();
        assert_eq!(
            exported
                .iter()
                .map(|p| p["time"].as_f64().unwrap())
                .collect::<Vec<_>>(),
            vec![0.0, 1.0, 2.0, 4.0, 5.0, 6.0]
        );
        assert_eq!(
            app.database
                .get_telemetry_points("gap", None)
                .unwrap()
                .len(),
            7
        );
    }
}
