1. **Move Flaky Tests**: Create `tests/test_portable_host_diagnostics.py` and move `test_executable_bootstrap_and_config_interaction` and `test_portable_executable_releases_udp_port_for_restart` from `tests/test_executable_bundle.py`.
2. **Enhance Diagnostics in Tests**: Update the moved tests to capture stdout/stderr instead of using DEVNULL. On failure (e.g. timeout or missing files), collect:
   - command line
   - executable SHA-256
   - parent PID and exit code
   - child process tree rooted at the parent PID
   - captured streams and logs (`backend.log`, `web_port.txt`)
   - Write this data to a `diagnostics_output` directory.
   - Read the repeat count from an environment variable (e.g. `DIAGNOSTICS_REPEAT_COUNT`).
3. **Update CI Workflow**: In `.github/workflows/ci.yml`:
   - Update `backend-unit-test` to ignore `tests/test_portable_host_diagnostics.py` alongside `test_sidecar_process_contract.py`.
   - Update the GitHub Actions summary for the executable verification job to reflect that it only tests sidecar compilation and PE metadata (deterministic package gates) and that headless host tests are moved to non-blocking diagnostics.
4. **Create Diagnostics Workflow**: Create `.github/workflows/diagnostics.yml`:
   - Trigger on `workflow_dispatch` (with `repeat_count` input) and `schedule`.
   - Build sidecar, stage it, build Tauri executable.
   - Run `tests/test_portable_host_diagnostics.py`.
   - Use `actions/upload-artifact@v4` to upload the `diagnostics_output` directory if the job fails.
5. **Add Documentation**: Append to `README.md` a section explaining how maintainers manually trigger the diagnostics workflow and how a release candidate is approved (one successful diagnostics run + manual clean-Windows portable smoke testing).
6. **Testing & Pre-commit**:
   - Run `PYTHONPATH=backend python3 -m pytest tests/` to verify tests pass.
   - Run the pre-commit steps tool.
