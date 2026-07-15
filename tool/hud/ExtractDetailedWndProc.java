import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import java.io.PrintWriter;

public class ExtractDetailedWndProc extends GhidraScript {
    @Override
    public void run() throws Exception {
        PrintWriter out = new PrintWriter("D:\\FH6-Bundle\\FH6-HorizonTuner\\tools\\ForzaHUD_RE\\wndproc_detail.txt");
        out.println("=== Detailed WndProc & Hook Callback Analysis ===\n");
        
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        
        // 1. WndProc (FUN_140009c70)
        Address wndproc_addr = currentProgram.getAddressFactory().getAddress("140009c70");
        Function wndproc_func = getFunctionContaining(wndproc_addr);
        if (wndproc_func != null) {
            out.println("--- WndProc Function at 140009c70 ---");
            DecompileResults res = ifc.decompileFunction(wndproc_func, 120, getMonitor());
            if (res.decompileCompleted()) {
                out.println(res.getDecompiledFunction().getC());
            } else {
                out.println("Decompilation failed");
            }
        } else {
            out.println("WndProc function not found at 140009c70");
        }

        // 2. Keyboard Hook Callback (FUN_140009870)
        Address hook_addr = currentProgram.getAddressFactory().getAddress("140009870");
        Function hook_func = getFunctionContaining(hook_addr);
        if (hook_func != null) {
            out.println("\n--- Keyboard Hook Callback at 140009870 ---");
            DecompileResults res = ifc.decompileFunction(hook_func, 120, getMonitor());
            if (res.decompileCompleted()) {
                out.println(res.getDecompiledFunction().getC());
            } else {
                out.println("Decompilation failed");
            }
        } else {
            out.println("Keyboard Hook callback not found at 140009870");
        }
        
        out.close();
    }
}
