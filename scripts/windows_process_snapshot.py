"""Read process relationships through Toolhelp without WMI or command lines."""

import ctypes
import sys
from collections import defaultdict, deque
from ctypes import wintypes
from typing import TypedDict


class ProcessInfo(TypedDict):
    ProcessId: int
    ParentProcessId: int
    Name: str


class _ProcessEntry32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.c_size_t),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", wintypes.LONG),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", wintypes.WCHAR * 260),
    ]


def snapshot_processes() -> list[ProcessInfo]:
    """Return one read-only snapshot of PIDs, parent PIDs and executable names."""
    if sys.platform != "win32":
        raise OSError("Windows process snapshots require Windows")
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    for name in ("Process32FirstW", "Process32NextW"):
        function = getattr(kernel32, name)
        function.argtypes = [wintypes.HANDLE, ctypes.POINTER(_ProcessEntry32)]
        function.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    snapshot = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)  # TH32CS_SNAPPROCESS
    if snapshot == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        entry = _ProcessEntry32()
        entry.dwSize = ctypes.sizeof(entry)
        processes = []
        available = kernel32.Process32FirstW(snapshot, ctypes.byref(entry))
        while available:
            processes.append(
                {
                    "ProcessId": entry.th32ProcessID,
                    "ParentProcessId": entry.th32ParentProcessID,
                    "Name": entry.szExeFile,
                }
            )
            available = kernel32.Process32NextW(snapshot, ctypes.byref(entry))
        error = ctypes.get_last_error()
        if error != 18:  # ERROR_NO_MORE_FILES is the expected end of enumeration.
            raise ctypes.WinError(error)
        return processes
    finally:
        kernel32.CloseHandle(snapshot)


def rooted_process_tree(
    processes: list[ProcessInfo], root_pid: int
) -> list[ProcessInfo]:
    """Select a root and descendants, including children of an already-exited root."""
    by_pid = {process["ProcessId"]: process for process in processes}
    children = defaultdict(list)
    for process in processes:
        children[process["ParentProcessId"]].append(process["ProcessId"])
    pending = deque([root_pid])
    visited = set()
    selected = []
    while pending:
        process_id = pending.popleft()
        if process_id in visited:
            continue
        visited.add(process_id)
        if process_id in by_pid:
            selected.append(dict(by_pid[process_id]))
        pending.extend(children[process_id])
    return selected
