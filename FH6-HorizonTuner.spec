# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:\\FH6-Bundle\\FH6-HorizonTuner\\backend\\main.py'],
    pathex=['D:\\FH6-Bundle\\FH6-HorizonTuner\\backend'],
    binaries=[],
    datas=[('D:\\FH6-Bundle\\FH6-HorizonTuner\\frontend\\src-tauri\\target\\release\\frontend.exe', '.'), ('backend\\car_database.json', '.'), ('backend\\car_params\\*', 'car_params'), ('lang\\*', 'lang')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='FH6-HorizonTuner',
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
    icon=['D:\\FH6-Bundle\\FH6-HorizonTuner\\app.ico'],
)
