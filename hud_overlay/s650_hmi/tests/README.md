# S650 HMI Tests

These tests own the standalone S650 Canvas runtime. They are run by the
frontend Vitest entry point so local development and CI use one command:

```powershell
pnpm -C frontend run test
```

- `unit/` exercises contract, frame, tokens, primitives, components, and
  layout recipes without React.
- `integration/` verifies the HUD launcher boundary.

React-only S650 configuration validation remains in
`frontend/src/features/overlay_control/s650/`.
