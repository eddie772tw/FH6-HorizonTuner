import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.listing.Function;
import java.io.PrintWriter;

public class ExtractCode extends GhidraScript {
    @Override
    public void run() throws Exception {
        PrintWriter out = new PrintWriter("D:\\FH6-Bundle\\FH6-HorizonTuner\\tools\\ForzaHUD_RE\\decompiled_output.txt");
        out.println("=== Target Decompilation Output ===\n");
        
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        
        Address vigem_addr = currentProgram.getAddressFactory().getAddress("1400bd998");
        out.println("[*] Looking for Xrefs to vigem_target_x360_update (0x1400bd998)...");
        Reference[] vigemRefs = getReferencesTo(vigem_addr);
        for (Reference ref : vigemRefs) {
            Address refAddr = ref.getFromAddress();
            Function func = getFunctionContaining(refAddr);
            if (func != null) {
                out.println("\n--- Function at " + func.getEntryPoint().toString() + " calling vigem_target_x360_update ---");
                DecompileResults res = ifc.decompileFunction(func, 60, getMonitor());
                if (res.decompileCompleted()) {
                    out.println(res.getDecompiledFunction().getC());
                } else {
                    out.println("Decompilation failed");
                }
            } else {
                out.println("Reference at " + refAddr.toString() + " but no function found.");
            }
        }
        
        Address init_d3d_addr = currentProgram.getAddressFactory().getAddress("1400bf298");
        out.println("\n[*] Looking for Xrefs to init_d3d string (0x1400bf298)...");
        Reference[] strRefs = getReferencesTo(init_d3d_addr);
        for (Reference ref : strRefs) {
            Address refAddr = ref.getFromAddress();
            Function func = getFunctionContaining(refAddr);
            if (func != null) {
                out.println("\n--- Function at " + func.getEntryPoint().toString() + " referencing init_d3d string ---");
                DecompileResults res = ifc.decompileFunction(func, 60, getMonitor());
                if (res.decompileCompleted()) {
                    out.println(res.getDecompiledFunction().getC());
                } else {
                    out.println("Decompilation failed");
                }
            } else {
                out.println("Reference at " + refAddr.toString() + " but no function found.");
            }
        }
        
        out.close();
    }
}
