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
]

for pkg in ["fastapi", "uvicorn", "starlette", "websockets", "pydantic"]:
    try:
        pkg_datas, pkg_bins, pkg_hidden = collect_all(pkg)
        datas += pkg_datas
        binaries += pkg_bins
        hiddenimports += pkg_hidden
    except Exception:
        pass

# 2. 手動定義靜態資源與 Tauri 前端編譯產出的 exe
added_files = [
    # 關鍵：將 Tauri 編譯產出的 frontend.exe 封裝進去（目標放在根目錄）
    ('frontend/src-tauri/target/release/frontend.exe', '.'),
    
    # 專案靜態資料
    ('backend/car_database.json', '.'),
    ('backend/car_params/*', 'car_params'),
    ('lang/*', 'lang'),
]

datas.extend(added_files)

# 3. 分析與打包核心設定
a = Analysis(
    [os.path.join('backend', 'main.py')], # 入口程式碼
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
    ], # 排除不需要的 Pillow 子模組以減輕體積
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
    name='FH6-HorizonTuner',   # 產出的 EXE 檔名
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,                 # 避免病毒誤報
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,            # False 等同於 --windowed (不顯示控制台視窗)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="app.ico",
)
