# Drift tuning stability research

## Findings

- The previous Drift AEGO profile derived final drive from a wheel-torque heuristic and then clamped it. On high-torque supercharged cars this frequently produced a very short first gear, while the engine-specific step ratio could still create a large 1st-to-2nd speed jump.
- The previous cold-pressure formula produced a large front/rear split (roughly 33 PSI front versus 20 PSI rear for a typical car) while declaring a 21 PSI hot target. That is internally inconsistent and makes rear grip change substantially as the tires heat.
- The Drift secondary speed correction reused Road step-ratio bounds. Applying a Road redistribution after a Drift correction could therefore undo the Drift 1st/2nd relationship.
- A fully locked coast differential is not a universal stability fix. The research baseline remains 100% acceleration and 25% rear deceleration for RWD, and 40/0 front plus 100/0 rear for AWD; this avoids introducing lift-off axle bind without discarding the power-lock behavior that starts the slide.

## Implemented baseline

- Clamp the Drift step ratio to a minimum of `0.68` and derive final drive from a bounded first-gear speed target (`62..90 km/h` at peak horsepower, scaled by power-to-weight).
- Preserve the Drift step ratio during secondary top-speed correction.
- Use a 32 PSI hot target with a narrow, compound-aware cold-pressure baseline around 29 PSI front and 30.5 PSI rear.
- Keep the documented Drift coast-lock values and add tests for 1st/2nd gear speed spacing and secondary-correction invariance.

## Follow-up calibration plan

The community article supports a second, deliberately scoped calibration pass:

- Stable RWD baseline: front 29 PSI, rear 33 PSI before season/compound offsets, front toe +0.2°, rear toe -0.3°, and rear coast lock 20%.
- Aggressive RWD baseline: retain the same pressure window, use front toe +0.8° and rear coast lock 10% for faster rotation and transitions.
- AWD baseline: keep front/rear cold pressure equal at 33 PSI before offsets; retain the existing 40/0 front, 100/0 rear, and 88% rear center split until vehicle samples disprove it.

These values are calibration hypotheses, not universal truths. The article presents them as starting points and does not provide repeatable telemetry, controlled vehicle samples, or error bounds. Future sample data should be evaluated one vehicle and one variable at a time.

Recommended measurements are launch speed, 1st-to-2nd shift RPM, drift-hold speed, rear slip stability, transition time, spin count, and score/segment time under fixed route, tire, power, and driver inputs.

## External references

- RacingGames, *Forza Horizon 5 Drifting: A beginner's guide*: https://racinggames.gg/article/forza-horizon-5-get-started-with-drift-tuning
- Windows Central, *Forza Horizon 5 tuning guide*: https://www.windowscentral.com/gaming/forza-horizon-5-tuning-guide
- SAE, *On the Dynamics of Automobile Drifting*: https://saemobilus.sae.org/papers/dynamics-automobile-drifting-2006-01-1019
- SAE, *The Tire-Force Ellipse and Tire Characteristics*: https://saemobilus.sae.org/papers/tire-force-ellipse-friction-ellipse-and-tire-characteristics-2011-01-0094
