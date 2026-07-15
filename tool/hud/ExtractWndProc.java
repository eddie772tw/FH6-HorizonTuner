import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.listing.Function;
import java.io.PrintWriter;

public class ExtractWndProc extends GhidraScript {
    @Override
    public void run() throws Exception {
        PrintWriter out = new PrintWriter("D:\\FH6-Bundle\\FH6-HorizonTuner\\tools\\ForzaHUD_RE\\wndproc_output.txt");
        out.println("=== WndProc & RegisterClass Window Analysis ===\n");
        
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        
        // 1. RegisterClassExW address
        Address reg_class_addr = currentProgram.getAddressFactory().getAddress("1400bd8a8");
        out.println("[*] Looking for Xrefs to RegisterClassExW (0x1400bd8a8)...");
        Reference[] refs = getReferencesTo(reg_class_addr);
        for (Reference ref : refs) {
            Address refAddr = ref.getFromAddress();
            Function func = getFunctionContaining(refAddr);
            if (func != null) {
                out.println("\n--- Function at " + func.getEntryPoint().toString() + " calling RegisterClassExW ---");
                DecompileResults res = ifc.decompileFunction(func, 60, getMonitor());
                if (res.decompileCompleted()) {
                    out.println(res.getDecompiledFunction().getC());
                } else {
                    out.println("Decompilation failed");
                }
            }
        }

        // 2. SetWindowsHookExW address
        Address set_hook_addr = currentProgram.getAddressFactory().getAddress("1400bd818");
        out.println("\n[*] Looking for Xrefs to SetWindowsHookExW (0x1400bd818)...");
        refs = getReferencesTo(set_hook_addr);
        for (Reference ref : refs) {
            Address refAddr = ref.getFromAddress();
            Function func = getFunctionContaining(refAddr);
            if (func != null) {
                out.println("\n--- Function at " + func.getEntryPoint().toString() + " calling SetWindowsHookExW ---");
                DecompileResults res = ifc.decompileFunction(func, 60, getMonitor());
                if (res.decompileCompleted()) {
                    out.println(res.getDecompiledFunction().getC());
                } else {
                    out.println("Decompilation failed");
                }
            }
        }
        
        out.close();
    }
}
