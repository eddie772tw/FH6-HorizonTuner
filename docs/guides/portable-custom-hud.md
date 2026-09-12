# Release Build custom HUD packages

The Release Build keeps every built-in HUD package inside its embedded
sidecar. Users can add their own packages without rebuilding the application.

Place one package beside the release executable using this layout:

```text
FH6-HorizonTuner.exe
hud_overlay/
  my-hud/
    index.html
    assets/
```

Start the release executable, then select `my-hud` from the HUD selector. The
sidecar exposes user packages under `/hud_user/my-hud/`, while built-in packages
remain under `/hud/`. A user package with an existing built-in style id takes
precedence for that id, allowing a local override without removing any bundled
HUD.

`hud_overlay/shared`, `assets`, `telemetry`, `common`, `fonts`, `css`, and `js`
are reserved helper-directory names and are not offered as selectable packages.
