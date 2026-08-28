"""Process and port cleanup utilities for FH6-HorizonTuner.

Provides zero-dependency Windows port inspection via iphlpapi.dll (GetExtendedUdpTable/GetExtendedTcpTable)
and safe termination of stale/orphan HorizonTuner processes holding required ports.
"""

from __future__ import annotations

import ctypes
import logging
import os
import socket
import subprocess
import sys
import time
from typing import List, Set

logger = logging.getLogger(__name__)

# Windows API Constants
AF_INET = 2
AF_INET6 = 23
UDP_TABLE_OWNER_PID = 1
TCP_TABLE_OWNER_PID_ALL = 5
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_TERMINATE = 0x0001
SYNCHRONIZE = 0x00100000


# Structure definitions for 32-bit/64-bit Windows iphlpapi
class MIB_UDPROW_OWNER_PID(ctypes.Structure):
    _fields_ = [
        ("dwLocalAddr", ctypes.c_uint32),
        ("dwLocalPort", ctypes.c_uint32),
        ("dwOwningPid", ctypes.c_uint32),
    ]


class MIB_UDPTABLE_OWNER_PID(ctypes.Structure):
    _fields_ = [
        ("dwNumEntries", ctypes.c_uint32),
        ("table", MIB_UDPROW_OWNER_PID * 1),
    ]


class MIB_UDP6ROW_OWNER_PID(ctypes.Structure):
    _fields_ = [
        ("ucLocalAddr", ctypes.c_ubyte * 16),
        ("dwLocalScopeId", ctypes.c_uint32),
        ("dwLocalPort", ctypes.c_uint32),
        ("dwOwningPid", ctypes.c_uint32),
    ]


class MIB_UDP6TABLE_OWNER_PID(ctypes.Structure):
    _fields_ = [
        ("dwNumEntries", ctypes.c_uint32),
        ("table", MIB_UDP6ROW_OWNER_PID * 1),
    ]


class MIB_TCPROW_OWNER_PID(ctypes.Structure):
    _fields_ = [
        ("dwState", ctypes.c_uint32),
        ("dwLocalAddr", ctypes.c_uint32),
        ("dwLocalPort", ctypes.c_uint32),
        ("dwRemoteAddr", ctypes.c_uint32),
        ("dwRemotePort", ctypes.c_uint32),
        ("dwOwningPid", ctypes.c_uint32),
    ]


class MIB_TCPTABLE_OWNER_PID(ctypes.Structure):
    _fields_ = [
        ("dwNumEntries", ctypes.c_uint32),
        ("table", MIB_TCPROW_OWNER_PID * 1),
    ]


def _decode_port(raw_port: int) -> int:
    """Convert network byte order (big-endian) port from Windows table to host integer."""
    return socket.ntohs(raw_port & 0xFFFF)


def get_udp_port_owning_pids_windows(target_port: int) -> list[int]:
    """Query owning PIDs for a local UDP port on Windows using GetExtendedUdpTable."""
    if sys.platform != "win32":
        return []

    pids: Set[int] = set()
    iphlpapi = getattr(ctypes.windll, "iphlpapi", None)
    if iphlpapi is None:
        return []

    # 1. Query IPv4 UDP Table
    size = ctypes.c_ulong(0)
    res = iphlpapi.GetExtendedUdpTable(
        None, ctypes.byref(size), True, AF_INET, UDP_TABLE_OWNER_PID, 0
    )
    if size.value > 0:
        buf = ctypes.create_string_buffer(size.value)
        res = iphlpapi.GetExtendedUdpTable(
            buf, ctypes.byref(size), True, AF_INET, UDP_TABLE_OWNER_PID, 0
        )
        if res == 0:
            table = ctypes.cast(buf, ctypes.POINTER(MIB_UDPTABLE_OWNER_PID)).contents
            entries_count = table.dwNumEntries
            row_array = ctypes.cast(
                ctypes.addressof(table.table),
                ctypes.POINTER(MIB_UDPROW_OWNER_PID * entries_count),
            ).contents
            for row in row_array:
                port = _decode_port(row.dwLocalPort)
                if port == target_port and row.dwOwningPid > 0:
                    pids.add(int(row.dwOwningPid))

    # 2. Query IPv6 UDP Table
    size6 = ctypes.c_ulong(0)
    res6 = iphlpapi.GetExtendedUdpTable(
        None, ctypes.byref(size6), True, AF_INET6, UDP_TABLE_OWNER_PID, 0
    )
    if size6.value > 0:
        buf6 = ctypes.create_string_buffer(size6.value)
        res6 = iphlpapi.GetExtendedUdpTable(
            buf6, ctypes.byref(size6), True, AF_INET6, UDP_TABLE_OWNER_PID, 0
        )
        if res6 == 0:
            table6 = ctypes.cast(buf6, ctypes.POINTER(MIB_UDP6TABLE_OWNER_PID)).contents
            entries_count6 = table6.dwNumEntries
            row_array6 = ctypes.cast(
                ctypes.addressof(table6.table),
                ctypes.POINTER(MIB_UDP6ROW_OWNER_PID * entries_count6),
            ).contents
            for row in row_array6:
                port = _decode_port(row.dwLocalPort)
                if port == target_port and row.dwOwningPid > 0:
                    pids.add(int(row.dwOwningPid))

    return sorted(list(pids))


def get_tcp_port_owning_pids_windows(target_port: int) -> list[int]:
    """Query owning PIDs for a local TCP port on Windows using GetExtendedTcpTable."""
    if sys.platform != "win32":
        return []

    pids: Set[int] = set()
    iphlpapi = getattr(ctypes.windll, "iphlpapi", None)
    if iphlpapi is None:
        return []

    size = ctypes.c_ulong(0)
    res = iphlpapi.GetExtendedTcpTable(
        None, ctypes.byref(size), True, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0
    )
    if size.value > 0:
        buf = ctypes.create_string_buffer(size.value)
        res = iphlpapi.GetExtendedTcpTable(
            buf, ctypes.byref(size), True, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0
        )
        if res == 0:
            table = ctypes.cast(buf, ctypes.POINTER(MIB_TCPTABLE_OWNER_PID)).contents
            entries_count = table.dwNumEntries
            row_array = ctypes.cast(
                ctypes.addressof(table.table),
                ctypes.POINTER(MIB_TCPROW_OWNER_PID * entries_count),
            ).contents
            for row in row_array:
                port = _decode_port(row.dwLocalPort)
                if port == target_port and row.dwOwningPid > 0:
                    pids.add(int(row.dwOwningPid))

    return sorted(list(pids))


def get_port_owning_pids_fallback(target_port: int, is_udp: bool = True) -> list[int]:
    """Fallback parser using netstat -ano."""
    proto_flag = "udp" if is_udp else "tcp"
    pids: Set[int] = set()
    try:
        cmd = ["netstat", "-ano", "-p", proto_flag]
        output = subprocess.check_output(
            cmd, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), text=True
        )
        for line in output.splitlines():
            parts = line.strip().split()
            if len(parts) >= 4 and parts[0].lower() == proto_flag:
                local_addr = parts[1]
                if ":" in local_addr:
                    port_str = local_addr.rsplit(":", 1)[1]
                    if port_str.isdigit() and int(port_str) == target_port:
                        pid_str = parts[-1]
                        if pid_str.isdigit():
                            pids.add(int(pid_str))
    except Exception as e:
        logger.debug(f"Netstat fallback error: {e}")
    return sorted(list(pids))


def get_port_owning_pids(target_port: int, is_udp: bool = True) -> list[int]:
    """Get all process IDs holding or listening on the specified port."""
    if sys.platform == "win32":
        try:
            if is_udp:
                pids = get_udp_port_owning_pids_windows(target_port)
            else:
                pids = get_tcp_port_owning_pids_windows(target_port)
            if pids:
                return pids
        except Exception as e:
            logger.debug(f"Windows API port query failed, falling back to netstat: {e}")

    return get_port_owning_pids_fallback(target_port, is_udp=is_udp)


def get_process_image_path(pid: int) -> str | None:
    """Retrieve full executable path for a given process ID on Windows."""
    if sys.platform != "win32" or pid <= 0:
        return None

    kernel32 = getattr(ctypes.windll, "kernel32", None)
    if kernel32 is None:
        return None

    h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h_proc:
        return None

    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = ctypes.c_ulong(1024)
        if kernel32.QueryFullProcessImageNameW(h_proc, 0, buf, ctypes.byref(size)):
            return buf.value
    except Exception:
        pass
    finally:
        kernel32.CloseHandle(h_proc)

    return None


def is_horizontuner_stale_process(pid: int, current_pid: int | None = None) -> bool:
    """Check if the PID belongs to a stale HorizonTuner backend or sidecar process."""
    if pid <= 0:
        return False
    if current_pid is not None and pid == current_pid:
        return False
    if pid == os.getpid():
        return False

    image_path = get_process_image_path(pid)
    if not image_path:
        return False

    lower_path = image_path.lower()
    lower_exe = os.path.basename(lower_path)

    # 1. Direct Sidecar Executable matches
    if "server-sidecar" in lower_exe or "horizontuner" in lower_exe:
        return True

    # 2. Python executable matches
    if "python" in lower_exe or "pythonw" in lower_exe:
        cwd_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).lower()
        if cwd_dir and cwd_dir in lower_path:
            return True
        if ".venv" in lower_path:
            return True

    return False


def terminate_stale_process(pid: int, timeout_sec: float = 1.5) -> bool:
    """Terminate a stale orphan process using taskkill / os.kill and wait for termination."""
    if pid <= 0 or pid == os.getpid():
        return False

    logger.info(f"Terminating stale HorizonTuner process (PID={pid})...")
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        else:
            os.kill(pid, 9)
    except Exception as e:
        logger.warning(f"Failed to send termination signal to PID={pid}: {e}")

    start_t = time.monotonic()
    while time.monotonic() - start_t < timeout_sec:
        image = get_process_image_path(pid)
        if image is None:
            return True
        time.sleep(0.05)

    return False


def cleanup_stale_port_listeners(
    port: int,
    current_pid: int | None = None,
    is_udp: bool = True,
    timeout_sec: float = 1.5,
) -> list[int]:
    """Scan the given port for stale HorizonTuner listener processes and safely clean them up.

    :param port: The target UDP or TCP port number (e.g. 8000 or 8001)
    :param current_pid: The current process PID to protect from termination
    :param is_udp: True for UDP port check, False for TCP port check
    :param timeout_sec: Max wait duration in seconds for socket release
    :return: List of successfully terminated PIDs
    """
    if current_pid is None:
        current_pid = os.getpid()

    owning_pids = get_port_owning_pids(port, is_udp=is_udp)
    cleaned_pids: List[int] = []

    for pid in owning_pids:
        if pid == current_pid:
            continue

        if is_horizontuner_stale_process(pid, current_pid=current_pid):
            proto = "UDP" if is_udp else "TCP"
            logger.warning(
                f"Found stale HorizonTuner process PID={pid} occupying {proto} port {port}. Initiating cleanup..."
            )
            success = terminate_stale_process(pid, timeout_sec=timeout_sec)
            if success:
                cleaned_pids.append(pid)
                logger.info(
                    f"Successfully cleaned up stale process PID={pid}, {proto} port {port} is released."
                )
            else:
                logger.error(
                    f"Timed out waiting for PID={pid} to terminate on {proto} port {port}."
                )
        else:
            image = get_process_image_path(pid) or "Unknown Process"
            proto = "UDP" if is_udp else "TCP"
            logger.warning(
                f"{proto} Port {port} is occupied by third-party process (PID={pid}, Image={image}). "
                "Skipping automated cleanup to preserve external application integrity."
            )

    return cleaned_pids
