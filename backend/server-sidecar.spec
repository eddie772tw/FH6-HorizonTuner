# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# 1. 自動收集 FastAPI 與後端核心依賴
datas = []
binaries = []
hiddenimports = [
    "fastapi",
    "starlette",
    "uvicorn",
    "websockets",
    "pydantic",
    "winsdk",
    "winsdk.windows.media.control",
    "numpy",
    "soundcard",
    "multiprocessing",
    "multipart",
    "httpx",
]

packages_to_collect = [
    "fastapi", 
    "uvicorn", 
    "starlette", 
    "websockets", 
    "pydantic", 
    "winsdk",
    "numpy",
    "soundcard",
    "multiprocessing",
    "multipart",
    "httpx",
]

for pkg in packages_to_collect:
    try:
        pkg_datas, pkg_bins, pkg_hidden = collect_all(pkg)
        datas += pkg_datas
        binaries += pkg_bins
        hiddenimports += pkg_hidden
    except Exception:
        pass

# 2. 靜態資源 (不包含 frontend.exe)
added_files = [
    ('backend/car_database.json', '.'),
    ('backend/car_params', 'car_params'),
    ('lang', 'lang'),
    ('hud_overlay', 'hud_overlay'),
]

datas.extend(added_files)

# 3. 分析與打包 Sidecar 可執行檔
a = Analysis(
    ['main.py'],
    pathex=['.', 'backend'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'PIL._imagingcms',
        'PIL.ImageCms',
        'PIL._webp',
        'PIL._imagingtk',
        'PIL.ImageTk',
        'PIL._imagingmorph'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='server-sidecar-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='backend/version_info.txt',
    icon="app.ico",
)
