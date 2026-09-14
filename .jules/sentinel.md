## 2025-02-27 - Custom Math Formula Remote Code Execution (RCE) via `new Function`
**Vulnerability:** The math expression engine `evaluateCustomMath` in `frontend/src/utils/customMathEngine.ts` evaluated user-provided formulas using `new Function(...)` without rigorous sanitization, resulting in an arbitrary code execution vulnerability.
**Learning:** Naive regex-based token substitution combined with string evaluation (`new Function`, `eval`) is fundamentally insecure when parsing untrusted user inputs (like custom telemetry channels).
**Prevention:** Always implement a proper parser/evaluator algorithm (like the Shunting-Yard algorithm) to interpret mathematical expressions securely, completely avoiding native dynamic execution mechanisms when handling user-provided strings.
