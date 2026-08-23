import { describe, it, expect } from "vitest";
import { S650_HMI_STYLE_ID, S650_HMI_THEMES } from "../../src/features/overlay_control/s650/config";
import { formatHudDropdownOptions, HudStyleEntry } from "../../src/features/overlay_control/hudStyleScanner";

describe("hud_frontend contract & options", () => {
  it("formats HUD dropdown styles correctly for hud_frontend", () => {
    const mockStyles: HudStyleEntry[] = [
      { id: "vfd", name: "VFD Digital Dash", path: "/hud/vfd/index.html", urlPrefix: "/hud", isUser: false },
      { id: S650_HMI_STYLE_ID, name: "S650 Mustang HMI", path: "/hud/s650_hmi/index.html", urlPrefix: "/hud", isUser: false },
    ];

    const options = formatHudDropdownOptions(mockStyles);
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({ value: "vfd", label: "Retro VFD", isCustom: false });
    expect(options[1]).toEqual({ value: "s650_hmi", label: "Ford Mustang HMI", isCustom: false });
  });

  it("contains all expected S650 HMI themes for compact controller", () => {
    const themeValues = S650_HMI_THEMES.map((t) => t.value);
    expect(themeValues).toContain("normal");
    expect(themeValues).toContain("heritage67");
    expect(themeValues).toContain("foxbody");
    expect(themeValues).toContain("track");
  });
});
