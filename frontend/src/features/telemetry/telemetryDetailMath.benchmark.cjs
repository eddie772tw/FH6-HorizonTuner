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
const warmupRuns = 100000;
const repetitions = 5;

console.log(`Warming up V8...`);
for (let i = 0; i < warmupRuns; i++) {
  readFourArrayFrom(val);
  readFourManual(val);
  averageFourSome(val);
  averageFourManual(val);
}
console.log(`Running ${repetitions} repetitions of ${runs} iterations...\n`);

let readFourArrayFromTimes = [];
let readFourManualTimes = [];
let averageFourSomeTimes = [];
let averageFourManualTimes = [];

for (let rep = 0; rep < repetitions; rep++) {
  let start = performance.now();
  for (let i = 0; i < runs; i++) {
    readFourArrayFrom(val);
  }
  readFourArrayFromTimes.push(performance.now() - start);

  start = performance.now();
  for (let i = 0; i < runs; i++) {
    readFourManual(val);
  }
  readFourManualTimes.push(performance.now() - start);

  start = performance.now();
  for (let i = 0; i < runs; i++) {
    averageFourSome(val);
  }
  averageFourSomeTimes.push(performance.now() - start);

  start = performance.now();
  for (let i = 0; i < runs; i++) {
    averageFourManual(val);
  }
  averageFourManualTimes.push(performance.now() - start);
}

const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const min = arr => Math.min(...arr);
const max = arr => Math.max(...arr);

console.log(`readFourArrayFrom (baseline): avg ${avg(readFourArrayFromTimes).toFixed(2)}ms (min: ${min(readFourArrayFromTimes).toFixed(2)}ms, max: ${max(readFourArrayFromTimes).toFixed(2)}ms)`);
console.log(`readFourManual (optimized): avg ${avg(readFourManualTimes).toFixed(2)}ms (min: ${min(readFourManualTimes).toFixed(2)}ms, max: ${max(readFourManualTimes).toFixed(2)}ms)`);
console.log(`Speedup (readFour): ${(avg(readFourArrayFromTimes) / avg(readFourManualTimes)).toFixed(1)}x\n`);

console.log(`averageFourSome (baseline): avg ${avg(averageFourSomeTimes).toFixed(2)}ms (min: ${min(averageFourSomeTimes).toFixed(2)}ms, max: ${max(averageFourSomeTimes).toFixed(2)}ms)`);
console.log(`averageFourManual (optimized): avg ${avg(averageFourManualTimes).toFixed(2)}ms (min: ${min(averageFourManualTimes).toFixed(2)}ms, max: ${max(averageFourManualTimes).toFixed(2)}ms)`);
console.log(`Speedup (averageFour): ${(avg(averageFourSomeTimes) / avg(averageFourManualTimes)).toFixed(1)}x\n`);
