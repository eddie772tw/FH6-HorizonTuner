import pefile
import os

def extract_resources(pe_path, output_dir):
    print(f"[*] Loading PE file: {pe_path}")
    try:
        pe = pefile.PE(pe_path)
    except Exception as e:
        print(f"[-] Failed to load PE file: {e}")
        return

    if not hasattr(pe, 'DIRECTORY_ENTRY_RESOURCE'):
        print("[-] No resources found in the PE file.")
        return

    os.makedirs(output_dir, exist_ok=True)
    count = 0

    # Resource directory structure: Type -> ID -> Language -> Data
    for resource_type in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        type_id = resource_type.id
        type_name = resource_type.name
        
        # If type has no numeric ID, it might have a name
        type_str = str(type_name) if type_name else str(type_id)
        
        for resource_id in resource_type.directory.entries:
            res_id = resource_id.id
            res_name = resource_id.name
            res_str = str(res_name) if res_name else str(res_id)
            
            for resource_lang in resource_id.directory.entries:
                data_rva = resource_lang.data.struct.OffsetToData
                size = resource_lang.data.struct.Size
                
                try:
                    data = pe.get_data(data_rva, size)
                except Exception as e:
                    print(f"[-] Failed to read data for Type={type_str}, ID={res_str}: {e}")
                    continue
                
                # Determine extension based on file signature
                ext = ".dat"
                if data.startswith(b"DDS "):
                    ext = ".dds"
                elif data.startswith(b"\x89PNG\r\n\x1a\n"):
                    ext = ".png"
                elif data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
                    ext = ".gif"
                elif data.startswith(b"\xff\xd8\xff"):
                    ext = ".jpg"
                elif data.startswith(b"BM"):
                    ext = ".bmp"
                
                # We can also detect typical string content
                # Save file
                filename = f"res_{type_str}_{res_str}{ext}"
                file_path = os.path.join(output_dir, filename)
                
                try:
                    with open(file_path, "wb") as f:
                        f.write(data)
                    print(f"[+] Saved: {filename} (Size: {size} bytes)")
                    count += 1
                except Exception as e:
                    print(f"[-] Failed to save {filename}: {e}")

    print(f"[*] Extraction complete. Successfully extracted {count} resources to {output_dir}")

if __name__ == "__main__":
    pe_file = r"D:\FH6-Bundle\FH6-HorizonTuner\.ref\ForzaHUD\ForzaHUD.exe"
    out_dir = r"D:\FH6-Bundle\FH6-HorizonTuner\tools\ForzaHUD_RE\extracted_resources"
    extract_resources(pe_file, out_dir)
