const { performance } = require('perf_hooks');

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readFourArrayFrom(values) {
  return Array.from({ length: 4 }, (_, index) => finiteOrNull(values?.[index]));
}

function readFourManual(values) {
  return [
    finiteOrNull(values?.[0]),
    finiteOrNull(values?.[1]),
    finiteOrNull(values?.[2]),
    finiteOrNull(values?.[3])
  ];
}

function averageFourSome(values) {
  return values.length < 4 || values.some((value) => value === null)
    ? null
    : (values[0] + values[1] + values[2] + values[3]) / 4;
}

function averageFourManual(values) {
  if (values.length < 4 || values[0] === null || values[1] === null || values[2] === null || values[3] === null) return null;
  return (values[0] + values[1] + values[2] + values[3]) / 4;
}

const val = [1.1, 2.2, 3.3, 4.4];
const runs = 1000000;

console.log(`Running ${runs} iterations...\n`);

let start = performance.now();
for (let i = 0; i < runs; i++) {
  readFourArrayFrom(val);
}
let end = performance.now();
console.log(`readFourArrayFrom (baseline): ${(end - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < runs; i++) {
  readFourManual(val);
}
end = performance.now();
console.log(`readFourManual (optimized): ${(end - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < runs; i++) {
  averageFourSome(val);
}
end = performance.now();
console.log(`\naverageFourSome (baseline): ${(end - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < runs; i++) {
  averageFourManual(val);
}
end = performance.now();
console.log(`averageFourManual (optimized): ${(end - start).toFixed(2)}ms`);
