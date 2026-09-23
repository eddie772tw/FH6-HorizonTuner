//! Bounded command relay. The desktop owns tuning state and all calculations.
use crate::error::{ApiError, ApiResult};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    time::{Duration, Instant},
};

const HOST_TTL: Duration = Duration::from_secs(5);
const COMMAND_TTL: Duration = Duration::from_secs(15);
const MAX_COMMANDS: usize = 64;

struct Command {
    body: Value,
    created: Instant,
    status: &'static str,
    error: Option<String>,
}

#[derive(Default)]
pub struct CompanionWorkflow {
    host: Option<(String, Instant)>,
    snapshot: Option<Value>,
    revision: u64,
    commands: VecDeque<Command>,
    clients: HashMap<String, Instant>,
}

impl CompanionWorkflow {
    pub fn touch_client(&mut self, id: Option<&str>) {
        self.clients.retain(|_, seen| seen.elapsed() < HOST_TTL);
        if let Some(id) = id.filter(|id| !id.is_empty() && id.len() <= 80) {
            if self.clients.len() < MAX_COMMANDS || self.clients.contains_key(id) {
                self.clients.insert(id.to_owned(), Instant::now());
            }
        }
    }

    pub fn client_count(&mut self) -> usize {
        self.touch_client(None);
        self.clients.len()
    }

    fn online(&self) -> bool {
        self.host
            .as_ref()
            .is_some_and(|(_, seen)| seen.elapsed() < HOST_TTL)
    }

    fn expire(&mut self) {
        for command in &mut self.commands {
            if command.status == "pending" && command.created.elapsed() >= COMMAND_TTL {
                command.status = "rejected";
                command.error =
                    Some("Desktop did not acknowledge the command. Refresh and retry.".into());
            }
        }
    }

    pub fn state(&mut self) -> Value {
        self.expire();
        json!({"hostOnline":self.online(),"snapshot":self.snapshot,"revision":self.revision,
            "commands":self.commands.iter().map(|c|json!({"id":c.body["id"],"status":c.status,"error":c.error})).collect::<Vec<_>>()})
    }

    pub fn enqueue(&mut self, body: Value) -> ApiResult<Value> {
        self.expire();
        let id = required_string(&body, "id", 80)?;
        if let Some(existing) = self.commands.iter().find(|c| c.body["id"] == id) {
            if existing.body != body {
                return Err(ApiError::new(409, "Command ID already used"));
            }
            return Ok(self.state());
        }
        if !self.online() {
            return Err(ApiError::new(
                503,
                "Open HorizonTuner on the PC before sending changes.",
            ));
        }
        required_string(&body, "carId", 100)?;
        required_string(&body, "profileKey", 32_768)?;
        if !matches!(
            body["kind"].as_str(),
            Some("profile" | "workflow" | "measurement")
        ) {
            return Err(ApiError::invalid("Unsupported companion command"));
        }
        if body.to_string().len() > 65_536 {
            return Err(ApiError::new(413, "Command too large"));
        }
        let snapshot = self
            .snapshot
            .as_ref()
            .ok_or_else(|| ApiError::new(503, "Desktop is loading"))?;
        if body["carId"] != snapshot["carId"] || body["profileKey"] != snapshot["profileKey"] {
            return Err(ApiError::new(
                409,
                "Vehicle parameters changed. Refresh before applying edits.",
            ));
        }
        while self.commands.len() >= MAX_COMMANDS {
            if self.commands.front().is_some_and(|c| c.status != "pending") {
                self.commands.pop_front();
            } else {
                return Err(ApiError::new(429, "Too many pending commands"));
            }
        }
        self.commands.push_back(Command {
            body,
            created: Instant::now(),
            status: "pending",
            error: None,
        });
        Ok(self.state())
    }

    pub fn exchange(&mut self, body: Value) -> ApiResult<Value> {
        self.expire();
        let client = required_string(&body, "clientId", 80)?.to_owned();
        if self.online() && self.host.as_ref().is_some_and(|(id, _)| *id != client) {
            return Err(ApiError::new(
                409,
                "Another desktop owns the companion workflow",
            ));
        }
        let snapshot = &body["snapshot"];
        if !snapshot.is_object()
            || !snapshot["carId"].is_string()
            || !snapshot["profileKey"].is_string()
        {
            return Err(ApiError::invalid("Invalid desktop snapshot"));
        }
        if snapshot.to_string().len() > 262_144 {
            return Err(ApiError::new(413, "Snapshot too large"));
        }
        // Never replay an old desktop's unacknowledged actions in a new session.
        if self.host.as_ref().is_some_and(|(id, _)| *id != client) {
            for command in &mut self.commands {
                if command.status == "pending" {
                    command.status = "rejected";
                    command.error = Some("Desktop session changed. Refresh and retry.".into());
                }
            }
        }
        if let Some(acks) = body["acks"].as_array() {
            for ack in acks {
                if let Some(command) = self
                    .commands
                    .iter_mut()
                    .find(|c| c.body["id"] == ack["id"] && c.status == "pending")
                {
                    if ack["status"] == "applied" {
                        command.status = "applied";
                    } else if ack["status"] == "rejected" {
                        command.status = "rejected";
                        command.error = Some(
                            ack["error"]
                                .as_str()
                                .unwrap_or("Desktop rejected the command")
                                .chars()
                                .take(300)
                                .collect(),
                        );
                    }
                }
            }
        }
        if self.snapshot.as_ref() != Some(snapshot) {
            self.revision += 1;
        }
        self.snapshot = Some(snapshot.clone());
        self.host = Some((client, Instant::now()));
        Ok(
            json!({"commands":self.commands.iter().filter(|c|c.status=="pending").map(|c|&c.body).collect::<Vec<_>>()}),
        )
    }
}

fn required_string<'a>(body: &'a Value, key: &str, max: usize) -> ApiResult<&'a str> {
    body[key]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= max)
        .ok_or_else(|| ApiError::invalid(&format!("Invalid {key}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot() -> Value {
        json!({"carId":"123","profileKey":"profile-1","results":{"chassis":{"frontSpring":65}}})
    }
    fn command() -> Value {
        json!({"id":"one","kind":"profile","carId":"123","profileKey":"profile-1","patch":{"weight":1420}})
    }
    #[test]
    fn relay_requires_host_and_acknowledgement_and_is_idempotent() {
        let mut relay = CompanionWorkflow::default();
        assert!(relay.enqueue(command()).is_err());
        relay
            .exchange(json!({"clientId":"desktop","snapshot":snapshot()}))
            .unwrap();
        relay.enqueue(command()).unwrap();
        relay.enqueue(command()).unwrap();
        let exchange = relay
            .exchange(json!({"clientId":"desktop","snapshot":snapshot()}))
            .unwrap();
        assert_eq!(exchange["commands"].as_array().unwrap().len(), 1);
        assert_eq!(relay.state()["commands"][0]["status"], "pending");
        relay.exchange(json!({"clientId":"desktop","snapshot":snapshot(),"acks":[{"id":"one","status":"applied"}]})).unwrap();
        assert_eq!(relay.state()["commands"][0]["status"], "applied");
        assert_eq!(
            relay.state()["snapshot"]["results"]["chassis"]["frontSpring"],
            65
        );
    }
    #[test]
    fn stale_edits_and_competing_hosts_are_rejected() {
        let mut relay = CompanionWorkflow::default();
        relay
            .exchange(json!({"clientId":"desktop","snapshot":snapshot()}))
            .unwrap();
        let mut stale = command();
        stale["profileKey"] = json!("old");
        assert!(relay.enqueue(stale).is_err());
        assert!(relay
            .exchange(json!({"clientId":"other","snapshot":snapshot()}))
            .is_err());
        relay.enqueue(command()).unwrap();
        relay.host.as_mut().unwrap().1 = Instant::now() - HOST_TTL;
        assert_eq!(relay.state()["hostOnline"], false);
        relay
            .exchange(json!({"clientId":"other","snapshot":snapshot()}))
            .unwrap();
        assert_eq!(relay.state()["commands"][0]["status"], "rejected");
    }
    #[test]
    fn pending_commands_expire_instead_of_replaying_late() {
        let mut relay = CompanionWorkflow::default();
        relay
            .exchange(json!({"clientId":"desktop","snapshot":snapshot()}))
            .unwrap();
        relay.enqueue(command()).unwrap();
        relay.commands[0].created = Instant::now() - COMMAND_TTL;
        assert_eq!(relay.state()["commands"][0]["status"], "rejected");
    }

    #[test]
    fn client_status_follows_live_heartbeats() {
        let mut relay = CompanionWorkflow::default();
        relay.touch_client(Some("tablet"));
        relay.touch_client(Some("tablet"));
        assert_eq!(relay.client_count(), 1);
        *relay.clients.get_mut("tablet").unwrap() = Instant::now() - HOST_TTL;
        assert_eq!(relay.client_count(), 0);
    }
}
