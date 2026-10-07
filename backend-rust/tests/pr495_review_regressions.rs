#[cfg(test)]
mod tests {
    use fh6_backend::{
        app::App,
        motec,
        network::{ApiRequest, Backend},
        telemetry::{
            parse_packet, ActiveRoute, RaceRecorder, RaceRecorderConfig, RecorderCommand,
            TelemetryStore,
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
        r.arm_route(route("time_trial"));
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
        r.arm_route(route("time_trial"));
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
        r.arm_route(route("time_trial"));
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
        r.arm_route(route("roaming"));
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
        r.arm_route(route("roaming"));
        r.record_at(&frame(-10.0, 1000.0), 1.0);
        r.record_at(&frame(0.0, 2000.0), 2.0);
        r.record_at(&frame(50.0, 3000.0), 3.0);
        r.record_at(&frame(100.0, 2500.0), 4.0);
        assert!(
            r.status().is_recording,
            "regressed packet incorrectly finalizes as destination-reached"
        );
    }
}
