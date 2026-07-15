import pefile
import os
import json
import re

def extract_offsets(file_path):
    print(f"[*] Extracting key offsets from {file_path}...")
    try:
        pe = pefile.PE(file_path)
    except Exception as e:
        print(f"[-] Error loading PE file: {e}")
        return

    result = {
        "image_base": hex(pe.OPTIONAL_HEADER.ImageBase),
        "imports": {},
        "interesting_strings": {}
    }

    # 1. 提取關鍵匯入函式的 IAT RVA
    print("[+] Scanning Imports (IAT)...")
    target_dlls = ["vigemclient.dll", "d3d11.dll", "dcomp.dll", "ws2_32.dll"]
    if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            dll_name = entry.dll.decode('utf-8', 'ignore').lower()
            if any(t in dll_name for t in target_dlls):
                result["imports"][dll_name] = {}
                for imp in entry.imports:
                    if imp.name:
                        func_name = imp.name.decode('utf-8', 'ignore')
                        # imp.address returns the absolute virtual address in memory (ImageBase + RVA)
                        result["imports"][dll_name][func_name] = hex(imp.address)

    # 2. 掃描 .rdata 區段中的關鍵字串位址
    print("[+] Scanning Strings in .rdata...")
    target_strings = [
        b"init_d3d: flip-model composition swap chain",
        b"load_dds_from_resource",
        b"load_texture_from_resource",
        b"vigem_connect failed",
        b"drift_assist: vigem_connect"
    ]
    
    for section in pe.sections:
        sec_name = section.Name.decode('utf-8', 'ignore').strip(chr(0))
        if sec_name == ".rdata" or sec_name == ".data":
            data = section.get_data()
            for ts in target_strings:
                offset = 0
                while True:
                    idx = data.find(ts, offset)
                    if idx == -1:
                        break
                    # Calculate absolute address: ImageBase + Section VirtualAddress + index within section
                    abs_addr = pe.OPTIONAL_HEADER.ImageBase + section.VirtualAddress + idx
                    ts_decoded = ts.decode('utf-8', 'ignore')
                    if ts_decoded not in result["interesting_strings"]:
                        result["interesting_strings"][ts_decoded] = []
                    result["interesting_strings"][ts_decoded].append(hex(abs_addr))
                    offset = idx + len(ts)

    # Save to JSON
    output_path = os.path.join(os.path.dirname(__file__), "analysis_offsets.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=4)
        
    print(f"[+] Extraction complete. Data saved to {output_path}")

if __name__ == "__main__":
    target = r"D:\FH6-Bundle\FH6-HorizonTuner\.ref\ForzaHUD\ForzaHUD.exe"
    if not os.path.exists(target):
        print(f"[-] Target file not found: {target}")
    else:
        extract_offsets(target)
