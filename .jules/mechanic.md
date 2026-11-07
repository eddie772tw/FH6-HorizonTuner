<!-- Autonomous work log for Mechanic. Promote only after local verification; see .agents/Journal.md. -->

## 2026-10-30 - Initialized Autonomous Mechanic Persona
**Physics Learning:** Formalized the Mechanic persona for dedicated maintenance of pure physics calculation functions and golden fixture numerical contracts (`backend-rust/src/tuning/` and `tests/fixtures/tuning_golden_fixtures.json`).
**Action:** Enforce pure functions with zero side-effects, unit strictness, and SSOT alignment on all chassis, gearing, and damping algorithms.
**署名:** Mechanic as Antigravity

## 2026-11-01 - Gearing Boundary Singular Value & Geometric Rolling Circumference Protection
**物理洞察 (Physics Learning):** 變速箱齒比解算在特定調校目標（如 DangerSign）或極端輸入下，若 `num_gears == 0` 或 `max_rpm` 為 NaN/非正值，會引發索引越界或數值傳播崩潰；此外若輪胎尺寸未設定或為 0，幾何滾動周長會退化為 0 導致終傳比除以零。同時，齒比單調性修正若採用靜態下限常數 clamp，可能在低檔比時造成相鄰檔位齒比相等。
**行動 (Action):** 全目標統一 `num_gears`（1..=10，預設 6）與 `max_rpm`（有限正數，預設 7500.0）純函式防護；幾何輪胎滾動周長保證正下界與合理 fallback（2.0m）；齒比單調性依循動態 `max_allowed_ratio` 階梯維護嚴格單調遞減。
**署名:** Mechanic as Antigravity

## 2026-11-02 - Chassis Inverted Bounds & Aerodynamic Mass Conservation Protection
**物理洞察 (Physics Learning):** 底盤懸吊剛性與車高在未正規化調校目標（Drift / Drag）或極端改裝下，若 `k_min > k_max`（上下限倒置）或 `k_min <= 0`，會在 Drift 阻尼計算中觸發 `(bounded - k_min) / (k_max - k_min).max(1e-6)`；因分子為負、分母為 `1e-6`，引發數值放大千百萬倍產生千萬級負值阻尼；Drag 模式亦會發生彈簧跌破下界。此外，在空力下壓力推導中，若配重 `weight_distribution` 超出物理範圍（如 `100.0%` 或 `120.0%`），`wr = (100.0 - wf).max(0.1)` 會打破質量守恆 `wf + wr != 100`，並使軸荷比率 `ratio = (wf / wr) * drivetrain_modifier` 出現千倍病態膨脹。
**行動 (Action):** 底盤純函式解算器全面強制 `k_min > 0`, `k_max >= k_min`, `h_min > 0`, `h_max >= h_min` 與配重 `1.0..=99.0` 有限數保護，建立嚴格的動力學數學封閉性（Mathematical Closure）與質量守恆不變量。
**署名:** Mechanic as Antigravity

## 2026-11-03 - Wheel Alignment Camber Sign Invariance & Tire Geometry Positivity Protection
**物理洞察 (Physics Learning):** 靜態車輪定位與胎壓解算器在面對極端前後配重比（如 `weight_distribution >= 100.0%` 或負值）時，原先直接計算後軸配重 `wr = 1.0 - wf`，導致 `wr` 轉為負值；在 Road 模式中使得後外傾角 `cr = -fixed1(0.8 + 0.6 * wr + 0.2)` 發生致命的幾何符號反轉（Camber Sign Inversion），由負外傾角畸變為正外傾角，徹底破壞車身側傾時的外側接地幾何。同時，原先輪胎尺寸以 `nonzero` 判斷，允許負數胎寬與扁平比通過，導致胎壁高度 `hw_f/hw_r` 出現非物理負值並反向干擾 Rally 模式胎壓修正。此外，極端輕量化或奇異配置下冷胎壓缺乏邊界收斂保證。
**行動 (Action):** 定位解算器全面落實配重 `1.0..=99.0%` 質量守恆約束、輪胎幾何空間尺寸嚴格正定性（淘汰 `nonzero` 改採 `positive` 確保有限正數）以及冷胎壓 `15.0..=55.0 psi` 物理操作區間防護，保障幾何解算動力學封閉性與外傾角符號不變量。
**署名:** Mechanic as Antigravity

## 2026-11-04 - Aerodynamic Downforce Non-Finite Singularity & Asymmetric Degradation Protection
**物理洞察 (Physics Learning):** 在空氣動力學下壓力解算中，當車輛僅裝配單側空力套件（例如僅安裝後尾翼 `aero_downforce_rear = 150.0 kgf`），而另一側因遙測未就緒或未改裝傳入 `f64::NAN`、負數或極端值時，原演算法直接以 `f_val <= 0.0` 進行二分判定。依據 IEEE 754 規範，`NaN <= 0.0` 評估為 `false`，導致單側推導條件無法命中，直接跌入雙軸皆未安裝的預設分支，將使用者設定的真實下壓力徹底丟棄並錯誤覆蓋為車重 20% 推導值。此外，`INFINITY` 下壓力會直接傳播污染底盤剛度計算，造成懸吊彈簧數值溢位；AWD 後軸動力偏置若接收到 `NaN`，原 `r.max(0.0).min(100.0)` 會退化為 0.0%（全前驅），破壞驅動動力分配。
**行動 (Action):** 下壓力解算器落實 `clean_aero` 有限正數過濾（`val.filter(|v| v.is_finite() && *v > 0.0).unwrap_or(0.0)`），確保單側空力套件的幾何推導二分覆蓋達成嚴格數學封閉性（Mathematical Closure），並將 AWD 後軸分配的非有限輸入安全回退至基於軸荷的動力學推導區間（60.0%..=85.0%）。
**署名:** Mechanic as Antigravity

## 2026-11-05 - Chassis Weight Distribution Non-Finite Singularity & Suspension Symmetry Protection
**物理洞察 (Physics Learning):** 底盤正規化函式（`normalize_road_inputs` 與 `rally_calculation_inputs`）及 AWD 後軸動力偏置解算在處理前後配重比時，原先採用 `p.weight_distribution.unwrap_or(50.0).max(1.0).min(99.0)`。依據 IEEE 754 規範，當配重傳入 `Some(f64::NAN)` 時，`NaN.max(1.0)` 會錯誤評估為 `1.0`（即 1% 前軸 / 99% 後軸），導致原本應安全回退至 50.0% 中性配重的車輛突變為極端重尾病態模型；更嚴重的是，空力解算 `resolve_aero_downforce` 內部具備有限數過濾會正確回退至 50.0%，造成同一車輛調校流程中空力載荷依據 50% 配重解算，而底盤彈簧、防傾桿與 AWD 扭力偏置（退化至 85.0% 極限）卻依據 1% 配重解算，引發嚴重的懸吊剛性對稱性破裂（Suspension Stiffness Symmetry Breaking）與動力學不一致。同時，Road 起步齒比解算在面對零扭力或非有限扭力時，原先直接除算引發除以零產生 `INFINITY` 總齒比並癱瘓整車變速箱解算。
**行動 (Action):** 底盤解算器與 AWD 後軸偏置全面落實 `p.weight_distribution.filter(|v| v.is_finite()).unwrap_or(50.0).clamp(1.0, 99.0)`，消除非有限數污染並保證 50.0% 中性配重下的防傾桿與阻尼完全對稱性；起步齒比解算補齊扭力有限正數防護，在無有效扭力輸出時安全由速度上限先驗平滑接管，確保動力學封閉性。
**署名:** Mechanic as Antigravity

## 2026-11-08 - Chassis Load Quantize Closure, Critical Damping Scaling & FWD Normalization
**物理洞察 (Physics Learning):** 底盤工程負載基準模型（`rust/chassis-load-baseline/v1`）之滑桿取位純函式 `quantize` 原先直接以 `value.clamp(min, max)` 邊界限制，在面對倒置滑桿區間（`min > max`，常見於遊戲未初始化或極端配件改裝）或非有限數（`NaN`、`Infinity`）時，會直接觸發 Rust `f64::clamp` 的斷言 panic 崩潰。此外，前驅車（FWD）在前軸 10% 彈簧軟化以換取前輪機械抓地力與後軸 10% 剛性支撐轉向響應的動力學補償中，原先採用裸字串 `s.eq_ignore_ascii_case("FWD")` 判定，若驅動形式帶有前後空白字符（如 `" fwd "`、`"FWD "`）會判定失敗，導致前驅動力學偏置被靜默丟棄並退化為中性軸荷。同時，臨界阻尼平方根比例縮放缺少除以零與負數防護，且診斷旗標邊界欠缺微小浮點數精度保護。
**行動 (Action):** 底盤負載模型全面落實 `quantize` 數值有限性與區間正向排序重整（`(min.min(max), min.max(max))`）確保數學封閉性（Mathematical Closure）與零 panic；統一改用 `Drivetrain::from_str_loose` 嚴格消除大小寫與空白敏感性；臨界阻尼開根號全面落實 `(spring / reference.max(1e-6)).max(0.0).sqrt()` 與 `1e-7` 精度保護，杜絕浮點邊界抖動。
**署名:** Mechanic as Antigravity
