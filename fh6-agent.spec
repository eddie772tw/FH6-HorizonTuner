# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller specification for FH6-HorizonTuner Agent CLI (fh6-agent.exe).

Produces a self-contained, standalone Windows executable suitable for:
- Direct release assets distribution on GitHub Release.
- Packaging as a Tauri sidecar or agent companion.
- No Python installation is required. Solve commands require Node.js 22.12+ on PATH
  and the bundled solver built from the canonical frontend source.
"""

import os

solver_bundle = os.path.join('frontend', 'dist-solver', 'tuning-solver.mjs')
if not os.path.isfile(solver_bundle):
    raise RuntimeError('Run pnpm -C frontend run build:solver before packaging fh6-agent.')

block_cipher = None

# Embedded static assets
added_files = [
    ('backend/car_database.json', '.'),
    (solver_bundle, 'tuning-solver'),
]

# Exclude heavy unnecessary GUI / web frameworks to keep binary lean & startup instant
excluded_modules = [
    'matplotlib',
    'scipy',
    'numpy',
    'PIL',
    'soundcard',
    'uvicorn',
    'fastapi',
    'tkinter',
    'pytest',
]

a = Analysis(
    [os.path.join('backend', 'agent_cli.py')],
    pathex=['.', 'backend'],
    binaries=[],
    datas=added_files,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_modules,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

version_file = 'backend/version_info.txt'
version_param = version_file if os.path.isfile(version_file) else None

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='fh6-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Command line interface
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=version_param,
)
