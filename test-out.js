const arrayKeys = ['TireTemp', 'NormalizedSuspensionTravel', 'TireSlipRatio', 'TireSlipAngle', 'tire_temp_f'];
const prev = { TireTemp: [1, 2, 3, 4], NormalizedSuspensionTravel: [0.1, 0.2, 0.3, 0.4], TireSlipRatio: [0.5, 0.6, 0.7, 0.8], TireSlipAngle: [10, 20, 30, 40], tire_temp_f: [100, 110, 120, 130] };
const curr = { TireTemp: [5, 6, 7, 8], NormalizedSuspensionTravel: [0.5, 0.6, 0.7, 0.8], TireSlipRatio: [0.1, 0.2, 0.3, 0.4], TireSlipAngle: [50, 60, 70, 80], tire_temp_f: [150, 160, 170, 180] };
const alpha = 0.5;

function lerp(a, b, t) { return a + (b - a) * t; }

function method2() {
    const out = { ...curr };
    for (let i = 0; i < arrayKeys.length; i++) {
        const key = arrayKeys[i];
        const arr0 = prev[key];
        const arr1 = curr[key];
        if (Array.isArray(arr0) && Array.isArray(arr1) && arr0.length === arr1.length) {
            const interpolatedArr = new Array(arr1.length);
            for (let j = 0; j < arr1.length; j++) {
                const val0 = arr0[j];
                const val1 = arr1[j];
                if (typeof val0 === 'number' && typeof val1 === 'number') {
                    interpolatedArr[j] = lerp(val0, val1, alpha);
                } else {
                    interpolatedArr[j] = val1;
                }
            }
            out[key] = interpolatedArr;
        }
    }
    return out;
}

function method1() {
    const out = { ...curr };
    for (let i = 0; i < arrayKeys.length; i++) {
        const key = arrayKeys[i];
        const arr0 = prev[key];
        const arr1 = curr[key];
        if (Array.isArray(arr0) && Array.isArray(arr1)) {
            if (arr1.length === 4 && arr0.length === 4) {
                out[key] = [
                    typeof arr0[0] === 'number' && typeof arr1[0] === 'number' ? lerp(arr0[0], arr1[0], alpha) : arr1[0],
                    typeof arr0[1] === 'number' && typeof arr1[1] === 'number' ? lerp(arr0[1], arr1[1], alpha) : arr1[1],
                    typeof arr0[2] === 'number' && typeof arr1[2] === 'number' ? lerp(arr0[2], arr1[2], alpha) : arr1[2],
                    typeof arr0[3] === 'number' && typeof arr1[3] === 'number' ? lerp(arr0[3], arr1[3], alpha) : arr1[3]
                ];
            } else if (arr0.length === arr1.length) {
                const interpolatedArr = new Array(arr1.length);
                for (let j = 0; j < arr1.length; j++) {
                    const val0 = arr0[j];
                    const val1 = arr1[j];
                    if (typeof val0 === 'number' && typeof val1 === 'number') {
                        interpolatedArr[j] = lerp(val0, val1, alpha);
                    } else {
                        interpolatedArr[j] = val1;
                    }
                }
                out[key] = interpolatedArr;
            }
        }
    }
    return out;
}

const N = 1000000;
console.time("method2");
for (let i = 0; i < N; i++) method2();
console.timeEnd("method2");
console.time("method1");
for (let i = 0; i < N; i++) method1();
console.timeEnd("method1");
