import pefile
import os

pe_path = r"D:\FH6-Bundle\FH6-HorizonTuner\.ref\ForzaHUD\ForzaHUD.exe"
pe = pefile.PE(pe_path)

print("[*] Scanning USER32.dll imports...")
if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
    for entry in pe.DIRECTORY_ENTRY_IMPORT:
        dll_name = entry.dll.decode('utf-8', 'ignore').lower()
        if "user32" in dll_name:
            for imp in entry.imports:
                if imp.name:
                    name = imp.name.decode('utf-8', 'ignore')
                    if "class" in name.lower() or "window" in name.lower() or "msg" in name.lower() or "message" in name.lower():
                        print(f"  {name}: {hex(imp.address)}")
