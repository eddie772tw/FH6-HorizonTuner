import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import java.io.PrintWriter;

public class ExtractKeyCheck extends GhidraScript {
    @Override
    public void run() throws Exception {
        PrintWriter out = new PrintWriter("D:\\FH6-Bundle\\FH6-HorizonTuner\\.ref\\ForzaHUD\\ForzaHUD_RE\\key_check_decompiled.txt");
        out.println("=== Key Check Function Analysis ===\n");
        
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        
        String[] targets = {
            "140019db0", // FUN_140019db0 (Initialize key check/network?)
            "14001aa30"  // FUN_14001aa30 (Verify key status?)
        };
        
        for (String addrStr : targets) {
            Address addr = currentProgram.getAddressFactory().getAddress(addrStr);
            Function func = getFunctionContaining(addr);
            if (func != null) {
                out.println("--- Function at " + addrStr + " ---");
                DecompileResults res = ifc.decompileFunction(func, 120, getMonitor());
                if (res.decompileCompleted()) {
                    out.println(res.getDecompiledFunction().getC());
                } else {
                    out.println("Decompilation failed");
                }
            } else {
                out.println("Function not found at " + addrStr);
            }
        }
        
        out.close();
    }
}
