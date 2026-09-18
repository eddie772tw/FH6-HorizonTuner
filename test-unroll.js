const prev = { TireTemp: [1, 2, 3, 4] };
const curr = { TireTemp: [5, 6, 7, 8] };
const alpha = 0.5;

function lerp(a, b, t) { return a + (b - a) * t; }

function method1() {
    const arr0 = prev.TireTemp;
    const arr1 = curr.TireTemp;
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
    return interpolatedArr;
}

function method2() {
    const arr0 = prev.TireTemp;
    const arr1 = curr.TireTemp;
    if (arr1.length === 4) {
        return [
            typeof arr0[0] === 'number' && typeof arr1[0] === 'number' ? arr0[0] + (arr1[0] - arr0[0]) * alpha : arr1[0],
            typeof arr0[1] === 'number' && typeof arr1[1] === 'number' ? arr0[1] + (arr1[1] - arr0[1]) * alpha : arr1[1],
            typeof arr0[2] === 'number' && typeof arr1[2] === 'number' ? arr0[2] + (arr1[2] - arr0[2]) * alpha : arr1[2],
            typeof arr0[3] === 'number' && typeof arr1[3] === 'number' ? arr0[3] + (arr1[3] - arr0[3]) * alpha : arr1[3]
        ];
    }
}

const N = 10000000;
let t0 = performance.now();
for(let i=0; i<N; i++) method1();
console.log("method1:", performance.now() - t0);

t0 = performance.now();
for(let i=0; i<N; i++) method2();
console.log("method2:", performance.now() - t0);
