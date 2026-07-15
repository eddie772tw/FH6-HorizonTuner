from ghidra.app.decompiler import DecompInterface
import time

def decompile_function(func, ifc):
    res = ifc.decompileFunction(func, 60, monitor)
    if res.decompileCompleted():
        return res.getDecompiledFunction().getC()
    return "Decompilation failed"

def run():
    print("[*] Starting targeted decompilation script...")
    out_path = r"D:\FH6-Bundle\FH6-HorizonTuner\tools\ForzaHUD_RE\decompiled_output.txt"
    
    with open(out_path, "w") as f:
        f.write("=== Target Decompilation Output ===\n\n")
        
        ifc = DecompInterface()
        ifc.openProgram(currentProgram)
        
        # Address for vigem_target_x360_update IAT entry
        vigem_addr = currentProgram.getAddressFactory().getAddress("1400bd998")
        
        f.write("[*] Looking for Xrefs to vigem_target_x360_update (0x1400bd998)...\n")
        refs = getReferencesTo(vigem_addr)
        for ref in refs:
            ref_addr = ref.getFromAddress()
            func = getFunctionContaining(ref_addr)
            if func:
                f.write(f"\n--- Function at {func.getEntryPoint()} calling vigem_target_x360_update ---\n")
                code = decompile_function(func, ifc)
                f.write(code + "\n")
            else:
                f.write(f"Reference at {ref_addr} but no function found.\n")
                
        # Address for init_d3d string
        init_d3d_addr = currentProgram.getAddressFactory().getAddress("1400bf298")
        f.write("\n[*] Looking for Xrefs to init_d3d string (0x1400bf298)...\n")
        refs = getReferencesTo(init_d3d_addr)
        for ref in refs:
            ref_addr = ref.getFromAddress()
            func = getFunctionContaining(ref_addr)
            if func:
                f.write(f"\n--- Function at {func.getEntryPoint()} referencing init_d3d string ---\n")
                code = decompile_function(func, ifc)
                f.write(code + "\n")
            else:
                f.write(f"Reference at {ref_addr} but no function found.\n")

    print(f"[*] Decompilation complete. Saved to {out_path}")

run()
