//! Bounded local ADB operations for the Companion Android USB path.
//!
//! This module deliberately owns no background scanner and never invokes a shell. The
//! caller supplies the packaged `adb` executable path; every operation uses a fixed
//! argument list and has a short process lifetime.

use serde::{Deserialize, Serialize};
use std::{
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const COMPANION_PACKAGE: &str = "org.horizontuner.companion";
const COMPANION_ACTIVITY: &str = "org.horizontuner.companion.app.MainActivity";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UsbConnection {
    pub serial: String,
    pub backend_port: u16,
    pub reverse_local: String,
    pub reverse_remote: String,
    pub launched: bool,
}

#[derive(Debug)]
pub enum AdbError {
    InvalidExecutable,
    InvalidSerial,
    InvalidBackendPort,
    NotFound,
    NotReady(String),
    AppMissing,
    MissingBinary,
    TimedOut,
    Failed,
    Io(io::Error),
}

impl std::fmt::Display for AdbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidExecutable => write!(f, "ADB executable path must name adb or adb.exe"),
            Self::InvalidSerial => write!(f, "Invalid ADB device serial"),
            Self::InvalidBackendPort => write!(f, "Backend port must be between 1 and 65535"),
            Self::NotFound => write!(f, "Requested ADB device was not found"),
            Self::NotReady(state) => write!(f, "ADB device is not ready ({state})"),
            Self::AppMissing => write!(f, "HorizonTuner Companion is not installed"),
            Self::MissingBinary => write!(f, "ADB executable is unavailable"),
            Self::TimedOut => write!(f, "ADB operation timed out"),
            Self::Failed => write!(f, "ADB operation failed"),
            Self::Io(_) => write!(f, "ADB operation could not be started"),
        }
    }
}

impl std::error::Error for AdbError {}

pub struct AdbClient {
    adb_path: PathBuf,
}

impl AdbClient {
    pub fn new(adb_path: impl AsRef<Path>) -> Result<Self, AdbError> {
        let path = adb_path.as_ref();
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !name.eq_ignore_ascii_case("adb") && !name.eq_ignore_ascii_case("adb.exe") {
            return Err(AdbError::InvalidExecutable);
        }
        Ok(Self {
            adb_path: path.to_path_buf(),
        })
    }

    pub fn list_devices(&self) -> Result<Vec<AdbDevice>, AdbError> {
        let output = self.run(&["devices", "-l"])?;
        if !output.status.success() {
            return Err(AdbError::Failed);
        }
        Ok(parse_devices(&output.stdout))
    }

    /// Configure the host reverse tunnel and launch the installed Companion activity.
    /// The device list is refreshed immediately before the serial is accepted.
    pub fn connect(&self, serial: &str, backend_port: u16) -> Result<UsbConnection, AdbError> {
        validate_serial(serial)?;
        if backend_port == 0 {
            return Err(AdbError::InvalidBackendPort);
        }
        let device = self
            .list_devices()?
            .into_iter()
            .find(|device| device.serial == serial)
            .ok_or(AdbError::NotFound)?;
        if device.state != "device" {
            return Err(AdbError::NotReady(device.state));
        }

        let package_args = ["-s", serial, "shell", "pm", "path", COMPANION_PACKAGE];
        let package = self.run(&package_args)?;
        if !package.status.success()
            || !String::from_utf8_lossy(&package.stdout).contains(COMPANION_PACKAGE)
        {
            return Err(AdbError::AppMissing);
        }

        let remote = format!("tcp:{backend_port}");
        let reverse_args = ["-s", serial, "reverse", "tcp:8001", remote.as_str()];
        let output = self.run(&reverse_args)?;
        if !output.status.success() {
            return Err(AdbError::Failed);
        }

        let list_args = ["-s", serial, "reverse", "--list"];
        let reverse_list = self.run(&list_args)?;
        if !reverse_list.status.success()
            || !has_reverse(&reverse_list.stdout, serial, "tcp:8001", &remote)
        {
            return Err(AdbError::Failed);
        }

        let component = format!("{COMPANION_PACKAGE}/{COMPANION_ACTIVITY}");
        let launch_args = [
            "-s",
            serial,
            "shell",
            "am",
            "start",
            "-n",
            component.as_str(),
            "--ez",
            "companionAutoConnect",
            "true",
        ];
        let launch = self.run(&launch_args)?;
        let launch_output = String::from_utf8_lossy(&launch.stdout);
        let launch_error = String::from_utf8_lossy(&launch.stderr);
        if !launch.status.success()
            || launch_output
                .lines()
                .any(|line| line.trim_start().starts_with("Error"))
            || launch_error
                .lines()
                .any(|line| line.trim_start().starts_with("Error"))
        {
            return Err(AdbError::Failed);
        }

        Ok(UsbConnection {
            serial: serial.to_owned(),
            backend_port,
            reverse_local: "tcp:8001".to_owned(),
            reverse_remote: remote,
            launched: true,
        })
    }

    fn run(&self, args: &[&str]) -> Result<Output, AdbError> {
        let mut command = Command::new(&self.adb_path);
        command
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let child = command.spawn().map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                AdbError::MissingBinary
            } else {
                AdbError::Io(error)
            }
        })?;
        collect_output(child)
    }
}

fn collect_output(mut child: Child) -> Result<Output, AdbError> {
    let stdout = child.stdout.take().ok_or(AdbError::Failed)?;
    let stderr = child.stderr.take().ok_or(AdbError::Failed)?;
    let stdout_thread = thread::spawn(move || read_bounded(stdout));
    let stderr_thread = thread::spawn(move || read_bounded(stderr));
    let deadline = Instant::now() + COMMAND_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().map_err(AdbError::Io)? {
            let stdout = stdout_thread
                .join()
                .unwrap_or_else(|_| Ok(Vec::new()))
                .map_err(AdbError::Io)?;
            let stderr = stderr_thread
                .join()
                .unwrap_or_else(|_| Ok(Vec::new()))
                .map_err(AdbError::Io)?;
            return Ok(Output {
                status,
                stdout,
                stderr,
            });
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(AdbError::TimedOut);
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn read_bounded(reader: impl Read) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .take((MAX_OUTPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    bytes.truncate(MAX_OUTPUT_BYTES);
    Ok(bytes)
}

pub fn parse_devices(output: &[u8]) -> Vec<AdbDevice> {
    String::from_utf8_lossy(output)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let serial = fields.next()?;
            let state = fields.next()?;
            if serial == "List" && state == "of" {
                return None;
            }
            let mut model = None;
            let mut product = None;
            let mut transport_id = None;
            for field in fields {
                if let Some(value) = field.strip_prefix("model:") {
                    model = Some(value.to_owned());
                }
                if let Some(value) = field.strip_prefix("product:") {
                    product = Some(value.to_owned());
                }
                if let Some(value) = field.strip_prefix("transport_id:") {
                    transport_id = Some(value.to_owned());
                }
            }
            Some(AdbDevice {
                serial: serial.to_owned(),
                state: state.to_owned(),
                model,
                product,
                transport_id,
            })
        })
        .collect()
}

fn has_reverse(output: &[u8], serial: &str, local: &str, remote: &str) -> bool {
    String::from_utf8_lossy(output).lines().any(|line| {
        let fields: Vec<_> = line.split_whitespace().collect();
        (fields.len() >= 3 && fields[0] == "UsbFfs" && fields[1] == local && fields[2] == remote)
            || (fields.len() >= 4
                && fields[0] == serial
                && fields[1] == "UsbFfs"
                && fields[2] == local
                && fields[3] == remote)
    })
}

fn validate_serial(serial: &str) -> Result<(), AdbError> {
    if serial.is_empty()
        || serial.starts_with('-')
        || serial
            .chars()
            .any(|ch| ch.is_whitespace() || ch.is_control())
    {
        return Err(AdbError::InvalidSerial);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ready_unauthorized_and_offline_devices_without_hiding_state() {
        let devices = parse_devices(b"List of devices attached\nusb-1 device product:pixel model:Pixel_8 transport_id:4\nusb-2 unauthorized usb:1-2\nusb-3 offline\n\n");
        assert_eq!(devices.len(), 3);
        assert_eq!(devices[0].model.as_deref(), Some("Pixel_8"));
        assert_eq!(devices[0].transport_id.as_deref(), Some("4"));
        assert_eq!(devices[1].state, "unauthorized");
        assert_eq!(devices[2].state, "offline");
    }

    #[test]
    fn reverse_verification_requires_exact_serial_and_ports() {
        assert!(has_reverse(
            b"UsbFfs tcp:8001 tcp:8001\n",
            "usb-1",
            "tcp:8001",
            "tcp:8001"
        ));
        assert!(has_reverse(
            b"usb-1 UsbFfs tcp:8001 tcp:8001\n",
            "usb-1",
            "tcp:8001",
            "tcp:8001"
        ));
        assert!(!has_reverse(
            b"usb-10 UsbFfs tcp:8001 tcp:8001\n",
            "usb-1",
            "tcp:8001",
            "tcp:8001"
        ));
        assert!(!has_reverse(
            b"UsbFfs tcp:8002 tcp:8001\n",
            "usb-1",
            "tcp:8001",
            "tcp:8001"
        ));
    }

    #[test]
    fn serial_and_port_validation_rejects_shell_like_values() {
        assert!(validate_serial("-sneaky").is_err());
        assert!(validate_serial("serial with spaces").is_err());
        assert!(validate_serial("usb-1").is_ok());
    }
}
