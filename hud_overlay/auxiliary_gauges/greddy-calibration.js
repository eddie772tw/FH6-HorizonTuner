// Measured from assets/aux_greddy.png, not from the padded image bounds.
// The printed arc is centered at (131.5, 131.5) in the 264 x 267 source.
// See tests/visual/README.md for the asset identity and all nine tick anchors.
export const GREDDY_DIAL_CENTER = Object.freeze({ x: 131.5, y: 131.5 });

// Canvas angles increase clockwise from the right. The original face spans
// 0..80 PSI from 135..405 degrees, with 40 PSI pointing straight up.
export function greddyOilPressureAngle(pressurePsi) {
    const ratio = Math.min(1, Math.max(0, pressurePsi / 80));
    return 135 + ratio * 270;
}
