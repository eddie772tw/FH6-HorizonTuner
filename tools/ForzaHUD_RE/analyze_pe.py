import pefile
import sys
import os
import json

def analyze_pe(file_path):
    print(f"[*] Analyzing {file_path}...")
    try:
        pe = pefile.PE(file_path)
    except Exception as e:
        print(f"[-] Error loading PE file: {e}")
        return

    # Basic Info
    print("\n[+] Basic Information:")
    print(f"  - Machine: {hex(pe.FILE_HEADER.Machine)}")
    print(f"  - Number of Sections: {pe.FILE_HEADER.NumberOfSections}")
    print(f"  - Entry Point: {hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint)}")
    print(f"  - Image Base: {hex(pe.OPTIONAL_HEADER.ImageBase)}")

    # Sections
    print("\n[+] Sections:")
    for section in pe.sections:
        print(f"  - {section.Name.decode('utf-8', 'ignore').strip(chr(0))}: VirtAddr: {hex(section.VirtualAddress)}, Size: {section.Misc_VirtualSize}")

    # Imports
    print("\n[+] Imports:")
    if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            dll_name = entry.dll.decode('utf-8', 'ignore')
            print(f"  > {dll_name}")
            # Highlight interesting DLLs
            if "vigem" in dll_name.lower() or "d3d" in dll_name.lower() or "dxgi" in dll_name.lower():
                for imp in entry.imports:
                    if imp.name:
                        print(f"      - {imp.name.decode('utf-8', 'ignore')}")
    else:
        print("  - No imports found (might be packed or a different format)")

if __name__ == "__main__":
    target = r"D:\FH6-Bundle\FH6-HorizonTuner\.ref\ForzaHUD\ForzaHUD.exe"
    if not os.path.exists(target):
        print(f"[-] Target file not found: {target}")
    else:
        analyze_pe(target)
