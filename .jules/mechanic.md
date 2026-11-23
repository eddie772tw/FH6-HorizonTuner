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

## 2026-11-06 - Alignment Drivetrain Normalization & Gearing Kinematics Closure Protection
**物理洞察 (Physics Learning):** 四輪定位解算器原先以裸字串比對驅動形式 `drive == "FWD"` 與 `match drive { "FWD" => ..., "RWD" => ..., _ => ... }`，缺乏 trim 與大小寫正規化。當外部傳入小寫 `"fwd"` 或帶空白字符時，Road 模式會將 FWD 前輪轉向形變所需之 +1.5 psi 支撐補償誤判退化為 AWD 的 +0.2 psi（導致前胎胎壁支撐不足 1.3 psi）；更致命的是在 Drag 模式中，小寫 `"fwd"` 因比對失敗跌入後驅分支，將前驅直線加速車的驅動輪胎壓錯誤倒置為前高 (38 psi) 後低 (15 psi)，徹底破壞彈射接地印跡幾何。同時，齒輪比速度與轉速幾何雙向解算器（`calc_gear_speed` 與 `calc_gear_rpm`）在面對非正數、零或 IEEE 754 非有限值（`NaN`、`INFINITY`）時缺乏防護，會傳播非物理負值或觸發除以零；且次級修正（Secondary Correction）在讀取使用者或遙測速限時未過濾非有限數，導致頂檔目標總比退化或溢位。
**行動 (Action):** 定位解算器統一調用 `Drivetrain::from_str_loose` 進行大小寫與空白安全正規化，確保驅動形式全架構 SSOT 型別一致性並消除胎壓倒置陷阱；運動學速度/轉速純函式與次級修正全面強制嚴格正定性（Positive & Finite Protection），無效數值安全收斂至 0.0，確保幾何動力學閉包。
**署名:** Mechanic as Antigravity

## 2026-11-07 - Drift Degenerate Spring Damping Collapse & Differential Field Drivetrain Normalization
**物理洞察 (Physics Learning):** 在甩尾（Drift）模式底盤解算中，回彈阻尼依據彈簧剛度在可調區間之相對百分比位置 `spring_fraction = (bounded - k_min) / (k_max - k_min).max(1e-6)` 解算。當遇到不可調固定剛度彈簧（`k_min == k_max`，即調校區間退化為單點）時，分子 `bounded - k_min == 0.0`，導致 `spring_fraction` 突變退化為 `0.0`，使回彈阻尼與壓縮阻尼跌破為最底限 `1.0`（極限軟阻尼）。這在幾何動力學上造成嚴重的欠阻尼（Under-damped），車身劇烈振盪失控。同時，底盤工作流機械欄位解算器（`mechanical_fields`）在判定差速器欄位時，原先採用裸字串 `!= "RWD"`、`!= "FWD"` 與 `== "AWD"`，當傳入小寫 `"awd"` 或前後帶空白之驅動形式時，`== "AWD"` 評估為 `false`，導致 AWD 車輛的中央差速器 `diff.center` 欄位被意外吞噬；而在後驅/前驅小寫時亦會錯誤加入相反軸向差速器，破壞幾何結構與 UI 推薦契約。
**行動 (Action):** Drift 阻尼解算器落實退化區間防護（當 `k_max - k_min <= 1e-4` 時賦予 0.5 中性阻尼基準，保證 10.5 阻尼支撐），並對 `spring_fraction` 實施 `0.0..=1.0` 嚴格有限區間約束；全工作流差速器欄位生成統一調用 `Drivetrain::from_str_loose` 實施大小寫與空白正規化，維護跨組態動力學封閉性與欄位結構完整性。
**署名:** Mechanic as Antigravity

## 2026-11-08 - Chassis Load Quantize Closure, Critical Damping Scaling & FWD Normalization
**物理洞察 (Physics Learning):** 底盤工程負載基準模型（`rust/chassis-load-baseline/v1`）之滑桿取位純函式 `quantize` 原先直接以 `value.clamp(min, max)` 邊界限制，在面對倒置滑桿區間（`min > max`，常見於遊戲未初始化或極端配件改裝）或非有限數（`NaN`、`Infinity`）時，會直接觸發 Rust `f64::clamp` 的斷言 panic 崩潰。此外，前驅車（FWD）在前軸 10% 彈簧軟化以換取前輪機械抓地力與後軸 10% 剛性支撐轉向響應的動力學補償中，原先採用裸字串 `s.eq_ignore_ascii_case("FWD")` 判定，若驅動形式帶有前後空白字符（如 `" fwd "`、`"FWD "`）會判定失敗，導致前驅動力學偏置被靜默丟棄並退化為中性軸荷。同時，臨界阻尼平方根比例縮放缺少除以零與負數防護，且診斷旗標邊界欠缺微小浮點數精度保護。
**行動 (Action):** 底盤負載模型全面落實 `quantize` 數值有限性與區間正向排序重整（`(min.min(max), min.max(max))`）確保數學封閉性（Mathematical Closure）與零 panic；統一改用 `Drivetrain::from_str_loose` 嚴格消除大小寫與空白敏感性；臨界阻尼開根號全面落實 `(spring / reference.max(1e-6)).max(0.0).sqrt()` 與 `1e-7` 精度保護，杜絕浮點邊界抖動。
**署名:** Mechanic as Antigravity
## 2026-11-09 - Gearing Secondary Redistribution Closure & Step Ratio Monotonicity Bounds
**物理洞察 (Physics Learning):** 在變速箱次級修正（Secondary Correction）幾何閉環重分佈中，當引擎峰值馬力轉速相對於紅線轉速較低（如大排量或渦輪引擎 `rpm_hp / max_rpm < 0.68`）時，原演算法 `r_max = (0.92).min(r_redline_hp)` 會低於 `r_min`，引發 `r_min > r_max` 的步長比率倒置畸變，導致高檔位齒比間距比低檔位更疏的動力學倒置；且比例因子 `s = (new_gtop / (gears[0] * prod_raw)).powf(...)` 在底數非正或非有限時會觸發 `powf` 產生 IEEE 754 `NaN`，使中間檔位全數坍縮為 1.0。此外，多檔位變速箱單調性迴圈中 `max_step_ratio_rounded` 在非 Drift/Drag 模式下以 `(rpm_hp + 50.0) / max_rpm` 計算，在峰值馬力接近紅線時比率超過 1.0 導致步長約束失效，而在極低峰值轉速下又會過度縮小導致高檔位過早觸底至 0.10。
**行動 (Action):** 次級重分佈強制實施 `r_max = (0.92).min(r_redline_hp).max(r_min)` 杜絕步長比率倒置，並落實底數正定性保護（非正或非有限時安全回退至 1.0）確保幾何動力學閉包；多檔位單調性步長比例全面施加 `0.65..=0.95` 邊界防護，消除檔位重疊與非正常觸底陷阱。
**署名:** Mechanic as Antigravity


## 2026-11-14 - Drift 齒比反比凸性對 0.01 格點捨入的影響
**物理洞察 (Physics Learning):** 在固定轉速與終傳比下，輪速 $v(g) = \frac{\text{rpm} \cdot C \cdot 60}{1000 \cdot g \cdot \text{fd}}$ 對齒比 $g$ 為嚴格遞減且嚴格凸函式（$1/g$ 幾何）。當理想格點 $g_{\text{ideal}} = n + \delta$（$\delta < 0.5$）在低齒比或受限終傳比下（如 `drift.rs` 的 $n < \delta / (1 - 2\delta)$ 區間）僅以 `.round()` 取整為 $n$ 時，向左偏移會放大超速誤差並跨越 $\max(1\,\text{km/h}, 1\%)$ 容差，而向右相鄰格點 `.ceil()` ($n+1$) 因凸性斜率較緩反而能同時滿足輪速容差與有效轉速上限。
**行動 (Action):** 所有在 0.01 離散齒比格點上反求終端輪速的 AEGO 求解器（包含 Drift）皆須以 `[ideal.round(), ideal.floor(), ideal.ceil()]` 順序檢索鉗位後的相鄰可行格點，並在確定 `main_tick` 可行後才配置其餘檔位，確保不破壞既有通過案例的同時消除凸性誤差假失敗。
**署名:** Mechanic as Antigravity

## 2026-11-15 - Drag Endpoint Tick-Space Slack Scale Mismatch & Exact Monotone Refinement
**物理洞察 (Physics Learning):** 在 Drag 雙端點聯合求解器（`aego-drag-joint/v1`）中，`endpoint_ticks` 原先僅在 0.01 齒比格點空間（tick-space）加減 `1e-8` 估計可行區間 `[lo, hi]`，再以單點 `.round().clamp(lower, hi)` 選出端點後交由 `respects_hard_targets` 以實體單位（速度 `±1e-9 km/h`、轉速 `+1e-8 RPM`）驗證。由於速度與齒比呈反比而轉速與齒比呈正比，tick 空間 `1e-8` 誤差在高速（250+ km/h）或高轉速（5000+ RPM）與低齒比（如 `0.85`）下會被放大 $10^1\text{–}10^2$ 倍，遠超 `respects_hard_targets` 容差；當峰值馬力接近可用紅線（`usable_limit == reference_rpm`）且理想格點落在整數下方 `1e-8` 區間（如 `85.999999995`）時，會誤納入無效邊界格點並因單點命中而被整組拒絕，在存在合法內側格點（`0.85`）的情況下誤報 `unavailable`。
**行動 (Action):** 以 `±1e-6` 作為外包圍初估後，利用速度隨 tick 嚴格遞減與轉速隨 tick 嚴格遞增的單調性，在 `endpoint_ticks` 內直接調用 `calc_gear_speed` / `calc_gear_rpm` 與 `respects_hard_targets` 一致之實體謂詞向內單調收緊 `[lo, hi]`，確保離散求解域滿足 Soundness 與 Completeness。
**署名:** Mechanic as Antigravity

## 2026-11-17 - Legacy Chassis `clamp_round` Sub-Tenth Bounds Violation & Overflow Closure
**物理洞察 (Physics Learning):** `chassis.rs::clamp_round` 在將彈簧剛性與車高取整至 0.1 小數位時，當區間 `[min, max]` 未與 0.1 格點相交（例如鎖定或狹窄區間 `[3.11, 3.11]`、`[3.11, 3.14]`、`[3.16, 3.19]`，或單位換算後之次單位區間 `[0.01, 0.04]`），其 `floored >= min` 與 `ceiled <= max` 皆為偽，原演算法卻在 `else` 分支回退至 `r1(max)` 或 `r1(min)`，導致輸出跌出 `[min, max]` 邊界（如 `3.1` 或 `3.2`）甚至使正數彈簧退化為 `0.0`，直接觸發 `baseline::preview` 以 `"value-outside-range"` 拒絕 Drift / Drag / DangerSign / v1 底盤推薦。此外，當邊界接近 `f64::MAX / 10` 時，`(max * 10.0).floor() / 10.0` 會溢位成 `INFINITY` 並通過 `>= min` 檢查造成無限大數值外洩。
**行動 (Action):** 令 `chassis.rs::clamp_round` 在無 0.1 格點落入 `[min, max]` 或縮放溢位時直接回傳已鉗位值 `clamped`，並補齊邊界排序與 `NaN`/有限性防護，與 `chassis_load::quantize` 達成嚴格包含性閉包（`min <= result <= max`）而不改變任何既有 21 個金標案例數值。
**署名:** Mechanic as Antigravity

## 2026-11-18 - `chassis_load::quantize` IEEE-754 乘法捨入溢位與部分上界溢位保護
**物理洞察 (Physics Learning):** 現行 Road／Rally v2 工程基準 `chassis_load::quantize` 原先透過 `low = (min * 10.0).ceil() / 10.0` 與 `high = (max * 10.0).floor() / 10.0` 預先建構 0.1 格點區間再進行鉗位。然而在 IEEE-754 雙精度浮點數下，當邊界處於高精度捨入區間（如 `7_974_024_817_625_809.0`）時，`x * 10.0` 會發生捨入進位並使 `(min * 10.0).ceil() / 10.0` 與 `(max * 10.0).floor() / 10.0` 同時向上越過 `max`（得出 `7_974_024_817_625_810.0 > max`），因 `low <= high` 仍成立而違反 `min <= result <= max` 邊界閉包，進而導致 `baseline::preview` 以 `"value-outside-range"` 拒絕推薦。此外，當單側上界接近 `1e307` 使 `max * 10.0` 溢位為 `INFINITY` 時，原先會放棄對區間內有限常規數值（如 `10.14`）執行 0.1 取整。
**行動 (Action):** 改由 `bounded = value.clamp(min, max)` 直接取整 `rounded = (bounded * 10.0).round() / 10.0`，先檢查 `rounded` 有限性，僅在 `rounded > max` 或 `rounded < min` 且向內取整格點（`high`/`low`）嚴格滿足 `min <= grid <= max` 時才採用格點，否則回退至 `bounded`，使現行 v2 `chassis_load::quantize` 與 `chassis::clamp_round` 在全有限浮點域達成等價的嚴格邊界閉包。
**署名:** Mechanic as Antigravity

## 2026-11-19 - Road 診斷與求解器 `limit_rpm`／輪徑 SSOT 對齊與衝突原因保留
**物理洞察 (Physics Learning):** 在 Road 齒比模型（`aego-road-launch-envelope/v3`）中，`road::calculate` 與 `road::versioned_diagnostics` 先前各自重複實作目標包絡推導；其中 `calculate` 對非正或非有限 `limit_rpm`（`0.0`、負數、`NaN`、`INFINITY`）設有 `7500.0` 安全回退，但 `versioned_diagnostics` 遺漏該防護，導致在 `max_hp_rpm`/`max_torque_rpm` 缺失或附帶 `secondary_correction` 時產生 `0.0`/`NaN`/除以零與 4500 倍扭力推導畸變，使 `respects_hard_targets` 在齒比已合法求解下誤判為 `"unavailable"`。此外，`road_launch_diagnostics` 亦缺少 `raw_c > 0.1` 輪胎周長回退與 `limit_rpm` 正規化，且 `versioned_diagnostics` 在求解衝突時會被 `adjusted_diagnostics` 覆寫原始衝突原因。
**行動 (Action):** 將 `road::calculate` 與 `road::versioned_diagnostics` 之目標推導收斂至單一純函式 `road_envelope_targets`，並於 `road_launch_diagnostics` 共用 `normalize_limit_rpm` 與 `safe_tire_circumference`，同時在 `result.unsupported == Some(true)` 時保留模型衝突原因，確保求解結果、診斷目標與硬性目標驗證在全輸入域嚴格一致。
**署名:** Mechanic as Antigravity

## 2026-11-20 - Drift 主檔 RPM 上界格點空間與實體限轉容差尺度失配修正
**物理洞察 (Physics Learning):** 在 Drift 主檔工作點求解器（`aego-drift-working/v1`）中，主檔齒比上限 `rpm_bound` 先前於 0.01 格點空間直接以固定常數 `+ 1e-9` 取整（`floor(t_0 + 1e-9)`），而 `respects_hard_targets` 實際係在實體轉速空間判定 `actual_rpm <= usable_limit_rpm + 1e-7`。因實際轉速隨格點線性縮放，實體 `+1e-7 RPM` 容差映射到格點空間為 $\Delta t = t_0 \cdot 10^{-7} / \text{usable\_limit\_rpm}$：在典型 Drift 主檔（如 $t_0 \in [100, 289]$、限轉 5000–7500 RPM）下 $\Delta t \in [1.3 \times 10^{-9}, 5.8 \times 10^{-9}] > 10^{-9}$，當 $t_0$ 落入 $(N - \Delta t, N - 10^{-9})$ 區間時 `rpm_bound` 會短估 1 格為 $N - 1$，造成鎖定觀測邊界或低齒比（相鄰格點跨越 1% 速度容差）時誤報 `unavailable`，即使未鎖定亦會捨棄近零誤差格點 $N$ 而退化至次佳相鄰格點；反之在高轉速低齒比（$t_0 / \text{limit} < 0.01$）則會高估 1 格。
**行動 (Action):** 於 `drift.rs` 抽離純函式 `rpm_upper_tick`，以 `(usable_limit_rpm + 1e-7)` 計算外包圍並加 1 格（`saturating_add(1)`）確保覆蓋全 `i32::MAX` 格點域，再利用實際轉速對齒比格點的嚴格單調遞增性，直接以與 `respects_hard_targets` 一致的實體 `calc_gear_speed` / `actual_rpm <= usable_limit_rpm + 1e-7` 謂詞向下單調收緊上界，達成離散主檔求解域之 Soundness 與 Completeness。
**署名:** Mechanic as Antigravity

## 2026-11-21 - 多檔位 EV 稀疏齒比跨 `None` 單調性斷裂、動力帶順序相依與 `INF/INF` 奇異值繞過
**物理洞察 (Physics Learning):** 在固定齒比 EV 模型（`ev/v1`）與設定檔就緒檢核（`profile::ev_ready`）中，齒比遞減檢查原先僅以 `.windows(2)` 比對相鄰兩檔；當多檔位 EV 中間存在未確認檔位（`None`／`null`，例如 `[Some(1.0), None, Some(4.0)]` 或 `[Some(2.0), None, Some(2.0)]`）時，相鄰比對會跨過缺口而完全放行非物理倒置或重複齒比。同時，實測運動學一致性檢查 `known = rpm_per_kmh / r` 在極小正數次正規（subnormal）齒比下會溢位成 `INFINITY`，使 `INFINITY / INFINITY = NaN` 導致 IEEE-754 條件 `(r / known[0] - 1.0).abs() > 0.05` 誤判為 `false` 而放行完全矛盾之齒比組；`band.first()`／`band.last()` 在未依 RPM 遞增排序之馬力曲線下會造成 `power_band_start_rpm > power_band_end_rpm` 倒置；終傳比縮放因子 `scale` 與極速邊界 `bound_speed_kmh` 亦缺少正有限數閉包。
**行動 (Action):** 以單一純函式 `ev::confirmed_ratios_decreasing` 統一檢驗所有已確認齒比子序列的嚴格遞減性（`ev.rs` 與 `profile.rs` 共用 SSOT），改以順序無關之 `(min_rpm, max_rpm)` 折疊求取 95% 峰值馬力帶區間，並將運動學一致性、`scale` 與 `bound_speed_kmh` 全面納入正有限數閉包防護（`!positive(v)` 及 `!((...) <= 0.05)` 雙重杜絕 `NaN`/`INFINITY` 繞過）。
**署名:** Mechanic as Antigravity
