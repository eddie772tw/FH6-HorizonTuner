# FH6 external tuning evidence report

Date: 2026-08-13
Scope: FH6 tuning boundaries, Chinese community practice, tire/physics parameter relationships

## Executive conclusion

External research is sufficient to improve the capability contract, but not sufficient to promote numeric solver constants as FH6-calibrated. The safe boundary is:

- accept control families and several upgrade gates as medium/high-confidence evidence;
- keep numeric min/max, step, precision, and per-car exceptions as `unknown` unless captured in-game;
- keep current tire μ, surface multipliers, peak slip, pressure, temperature, and load-sensitivity values as `calibration-prior`;
- use Chinese community tunes as reproducible candidate fixtures, not as universal formulas.

## FH6 control and upgrade evidence

| Control | Evidence | Confidence | Implementation action |
|---|---|---:|---|
| Alignment, springs, ride height, damping | Race Spring and Damper upgrades unlock the family; front/rear and bump/rebound controls are shown. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/) | Medium-high | Gate the family by suspension capability; leave exact ranges/steps unknown. |
| ARB | Race Front Antiroll Bar upgrade is named; an observed value is displayed with two decimals. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/) | Medium | Keep front/rear ARB capability separate; do not hard-code the community 1–65 range. |
| Aero | Front downforce is tied to the Race Front Bumper upgrade; aero is vehicle-specific. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/), [Forza car culture](https://forza.net/news/forza-horizon-6-car-culture) | Medium-high | Model front/rear aero unlocks independently. |
| Brakes | Race Brake upgrades unlock balance and pressure. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/) | Medium-high | Gate both controls together; numeric ranges remain unknown. |
| Differential | Race or Sport Differential upgrades unlock accel/decel and centre-balance controls, conditional on drivetrain. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/) | Medium-high | Keep drivetrain-conditional axes and unknown numeric bounds. |
| Gearing | Final drive and up to ten gear ratios are shown; count is vehicle/upgrade-dependent. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/) | Medium-high | Treat gear count as discrete and capability-dependent; ratio step remains unknown. |
| Tire pressure | Front/rear pressure is independently displayed; one captured screenshot shows one-decimal BAR values. [Destructoid tuning guide](https://www.destructoid.com/complete-forza-horizon-6-tuning-guide-all-sliders-explained/) | Medium | Do not infer universal bounds or precision from one screenshot. |

The strongest conclusion is about *which controls exist and what upgrades unlock them*. No source found provides a complete official FH6 numeric slider specification. A community guide's ARB, caster and brake-pressure ranges remain hypotheses only. [ForzaFire handling guide](https://www.forzafire.com/guides/forza-horizon-6-platform-and-handling-tuning-guide)

## Chinese community findings

The Chinese player community predominantly distributes car-specific share codes partitioned by PI/class and event/surface, rather than publishing cross-car slider equations.

| Orientation | Community evidence | Confidence | Use |
|---|---|---:|---|
| Road | Honda Beat, Autozam AZ-1, Abarth 595 and Honda Acty road/山道 share-code demonstrations. [Bilibili BV1j3Ew6EEXY](https://www.bilibili.com/video/BV1j3Ew6EEXY) | Medium | Candidate replay fixtures; not a general formula. |
| Road | FXX-K Evo route result and separate road share codes. [Bilibili BV1TnLn65EFe](https://www.bilibili.com/video/BV1TnLn65EFe/) | Medium | Candidate performance fixture; require repeat runs and disclosed assists. |
| Road | Toyota Starlet A-class open tune. [Bilibili BV17K7N6xE7e](https://www.bilibili.com/video/BV17K7N6xE7e/) | Medium | Candidate vehicle-specific fixture. |
| Rally/dirt | Subaru WRX seasonal event tune codes. [Bilibili BV1bpVW6QESA](https://www.bilibili.com/video/BV1bpVW6QESA/) | Medium | Candidate event fixture; preserve season/event metadata. |
| Drift | GR Supra/AE86 beginner tune codes and an explicit personal-opinion disclaimer. [Bilibili BV1KKLY6GExv](https://www.bilibili.com/video/BV1KKLY6GExv/) | Medium-low | Test hypotheses about controllability, not numeric truth. |
| Shared practice | QQ community sheet separates R/S/A/B/C PI and road, dirt, off-road pages. [Tencent Docs sheet](https://docs.qq.com/sheet/DYWZVRWR0dnh3aHhZ?tab=o07r66) | Medium-high for workflow | Use its dimensions as capture metadata. |
| Tire/differential anecdotes | Drift pressure 1.5–1.8 bar and 80%+ lock; generic handling advice. [biubiu guide](https://www.biubiu001.com/news/194875.html) | Low | Seed controlled tests only; never promote directly. |

One Chinese reference explicitly warns that FH5 tuning material does not transfer directly to FH6 because the physics changed. [Bilibili FH5/FH6 note](https://www.bilibili.com/opus/625126537111254345)

## Tire and physics evidence

The technical evidence supports model *forms*, not FH6 parameter values:

- Pure longitudinal/lateral force can use a Pacejka/Magic Formula form fitted per compound and surface. [Technical tire-force paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC5876603/)
- Load sensitivity is better represented as `Fmax = F0 * (Fz/Fz0)^a`, `0 < a < 1`, but `a = 0.70` is not FH6 evidence. [NHTSA/SAE tire-force study](https://www.nhtsa.gov/sites/nhtsa.gov/files/nadssae_paper2006010559.pdf)
- A friction ellipse is a useful baseline constraint, but the exponent and combined-slip reduction need capture-based fitting. [NHTSA/SAE tire-force study](https://www.nhtsa.gov/sites/nhtsa.gov/files/nadssae_paper2006010559.pdf)
- Surface, pressure and temperature affect more than a single scalar μ; they can change stiffness and force-curve shape. [Operational-parameter study](https://www.mdpi.com/1424-8220/22/17/6380/html), [extended Pacejka study](https://arxiv.org/abs/2305.18422)
- FH6/Forza official material does not publish tire-force coefficients or peak-slip values. Motorsport tire physics is useful as a qualitative warning about nonlinear, condition-dependent behaviour, not as Horizon numeric data. [Forza Motorsport tire physics](https://forza.net/news/forza-motorsport-drivatars-tire-physics)

### Current priors that must remain unverified

- compound μ values, including Drag `1.40/0.70` and Drift `1.05/0.82`;
- gravel/snow/drag surface multipliers;
- `loadSensitivity = 0.70` and default peak slip ratio/angle;
- pressure and temperature multipliers currently set to `1.0`;
- fixed hot-pressure targets and convergence/temperature heuristics;
- friction-ellipse exponent `n = 2` as an FH6 law.

The current telemetry has slip ratio, slip angle, combined slip, temperature, speed and suspension travel, but no direct per-wheel normal load. Consequently, a capture alone cannot uniquely identify μ(Fz) without a load-estimation model or a controlled axle-load experiment.

## Recommended evidence policy

1. Add every external claim as a fixture with URL, date, build, car, PI, installed parts, assists and confidence.
2. Require at least three repeated runs for a candidate performance claim.
3. Require one-variable-at-a-time captures for slider boundary claims.
4. Keep community share codes and screenshots as `community`, never `in_game_capture`.
5. Promote a number only after an in-game capture reproduces it across a known car/part/build combination.
