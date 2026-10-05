import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const scope: any = {};
runInNewContext(readFileSync(resolve(process.cwd(), '../hud_overlay/stack_st8100/stack-schedule.js'), 'utf8'), scope);
const S = scope.StackSchedule;
const none = [{ active: false }, { active: false }, { active: false }];
const all = [{ active: true }, { active: true }, { active: true }];
const frame = (currentLap: number | null, lastLap: number | null = 60, lap = 1) => ({ currentLap, lastLap, lap });
function racing() { const s = S.create(); S.ingest(s, frame(10), 0); S.ingest(s, frame(10.1), 100); return s; }
function keep(s: any, now: number, alarms = none) { S.ingest(s, frame(10 + now / 1000), now); S.advance(s, alarms, now); }
describe('ST8100 bounded LCD presentation clock', () => {
  it('does not enter timing from race-on, one timer sample, zero or an unchanged timer', () => {
    const s = S.create(); S.ingest(s, frame(null), 0); S.ingest(s, frame(null), 100); S.advance(s, none, 100);
    expect(s.timing).toBe(false); S.ingest(s, frame(2), 200); expect(s.timing).toBe(false);
    S.ingest(s, frame(2), 300); expect(s.timing).toBe(false); S.ingest(s, frame(2.1), 400); expect(s.timing).toBe(true);
  });
  it('alternates ordinary base and timing pages; stopped or missing timing expires after bounded grace', () => {
    const s = racing(); S.advance(s, none, 100); expect(s.info).toBe('base');
    keep(s, 2600); expect(s.info).toBe('timing'); keep(s, 5100); expect(s.info).toBe('base');
    keep(s, 7600); expect(s.info).toBe('timing'); S.ingest(s, frame(null), 7700); S.advance(s, none, 10600);
    expect(s.timing).toBe(false); expect(s.info).toBe('base');
  });
  it('inserts alarms between information pages and rotates slots only when a message starts', () => {
    const s = racing(); S.advance(s, none, 100); keep(s, 500, all); expect(s.phase).toBe('alarm'); expect(s.alarmIndex).toBe(0);
    keep(s, 3000, all); expect(s.phase).toBe('info'); expect(s.info).toBe('timing');
    keep(s, 5500, all); expect(s.alarmIndex).toBe(1);
    keep(s, 8000, all); expect(s.info).toBe('base');
    keep(s, 10500, all); expect(s.alarmIndex).toBe(2);
  });
  it('uses a new lap for the NEXT alarm cycle, retaining information and alarm rotation', () => {
    const s = racing(); S.advance(s, all, 100); expect(s.alarmIndex).toBe(0);
    S.ingest(s, frame(.2, 59.5, 2), 200); S.advance(s, all, 200);
    expect(s.phase).toBe('alarm'); expect(s.pendingLap).toBe(59.5); expect(s.timing).toBe(true);
    S.ingest(s, frame(2.6, 59.5, 2), 2600); S.advance(s, all, 2600); expect(s.phase).toBe('info');
    S.ingest(s, frame(5.1, 59.5, 2), 5100); S.advance(s, all, 5100); expect(s.phase).toBe('lap'); expect(s.popupLap).toBe(59.5); expect(s.lastAlarm).toBe(0);
    S.ingest(s, frame(7.6, 59.5, 2), 7600); S.advance(s, all, 7600); expect(s.phase).toBe('info');
    S.ingest(s, frame(10.1, 59.5, 2), 10100); S.advance(s, all, 10100); expect(s.alarmIndex).toBe(1);
  });
  it('coalesces latest lap events and restores the interrupted information phase without starvation', () => {
    const s = racing(); S.advance(s, none, 100);
    S.ingest(s, frame(.2, 59, 2), 1000); S.advance(s, none, 1000); expect(s.phase).toBe('lap');
    S.ingest(s, frame(.3, 58, 3), 1100); S.advance(s, none, 1100); expect(s.popupLap).toBe(58); expect(s.until).toBe(3500);
    S.ingest(s, frame(2.7, 58, 3), 3500); S.advance(s, none, 3500); expect(s.phase).toBe('info'); expect(s.info).toBe('base'); expect(s.until).toBe(5100);
    S.ingest(s, frame(.2, 57, 4), 3600); S.advance(s, none, 3600); expect(s.phase).toBe('info'); expect(s.pendingLap).toBe(57);
    S.advance(s, none, 5100); expect(s.phase).toBe('lap'); expect(s.popupLap).toBe(57);
  });
  it('suppresses initial, duplicate and reconnect lap popups; accepts a first completed lap once', () => {
    const s = S.create(); S.ingest(s, frame(1, null, 0), 0); S.ingest(s, frame(2, null, 0), 100); S.advance(s, none, 100);
    S.ingest(s, frame(.1, 61, 1), 200); S.advance(s, none, 200); expect(s.popupLap).toBe(61);
    S.ingest(s, frame(.2, 61, 1), 300); expect(s.pendingLap).toBe(null);
    S.reset(s); S.ingest(s, frame(8, 59, 2), 400); S.advance(s, none, 400);
    expect(s.phase).toBe('info'); expect(s.pendingLap).toBe(null); expect(s.timing).toBe(false);
  });
  it('announces equal-duration completed laps once by identity and corrects delayed times in place', () => {
    const s = racing(); S.advance(s, all, 100);
    S.ingest(s, frame(.1, 60, 2), 200); expect(s.pendingLap).toBe(60);
    S.ingest(s, frame(.2, 59.9, 2), 300); expect(s.pendingLap).toBe(59.9); expect(s.noticeLap).toBe(2);
    S.ingest(s, frame(2.5, 59.9, 2), 2600); S.advance(s, all, 2600);
    S.ingest(s, frame(5, 59.9, 2), 5100); S.advance(s, all, 5100); expect(s.popupLap).toBe(59.9);
    const until = s.until; S.ingest(s, frame(5.1, 59.8, 2), 5200);
    expect(s.popupLap).toBe(59.8); expect(s.until).toBe(until); expect(s.pendingLap).toBe(null);
    S.ingest(s, frame(.1, 59.8, 3), 5300); expect(s.pendingLap).toBe(59.8); expect(s.pendingIdentity).toBe(3);
  });
  it('corrects a visible no-alarm popup without extending it or replaying after information resumes', () => {
    const s = racing(); S.advance(s, none, 100); S.ingest(s, frame(.1, 59, 2), 200); S.advance(s, none, 200);
    expect(s.popupIdentity).toBe(2); expect(s.pendingIdentity).toBe(null); const deadline = s.until;
    S.ingest(s, frame(.2, 58.9, 2), 300); S.advance(s, none, 300);
    expect(s.popupLap).toBe(58.9); expect(s.pendingLap).toBe(null); expect(s.until).toBe(deadline);
    S.ingest(s, frame(2.6, 58.9, 2), deadline); S.advance(s, none, deadline); expect(s.phase).toBe('info'); expect(s.popupIdentity).toBe(null);
    S.ingest(s, frame(6, 58.9, 2), 6000); S.advance(s, none, 6000); expect(s.phase).toBe('info'); expect(s.pendingLap).toBe(null);
  });
  it('initial alarm interrupts an existing popup and does not replay the already shown event', () => {
    const s = racing(); S.advance(s, none, 100); S.ingest(s, frame(.1, 59, 2), 200); S.advance(s, none, 200); expect(s.phase).toBe('lap');
    S.advance(s, all, 300); expect(s.phase).toBe('alarm'); expect(s.pendingLap).toBe(null);
    S.advance(s, all, 2800); expect(s.phase).toBe('info');
  });
  it('alarm churn cannot extend a warning deadline or repeatedly interrupt protected information', () => {
    const s = racing(); S.advance(s, all, 100); const deadline = s.until;
    S.advance(s, [{active:false},{active:true},{active:true}], 500); expect(s.until).toBe(deadline);
    S.advance(s, [{active:false},{active:false},{active:true}], 900); expect(s.until).toBe(deadline);
    S.advance(s, none, 1000); expect(s.phase).toBe('info'); const infoDeadline = s.until;
    S.advance(s, all, 1100); expect(s.phase).toBe('info'); expect(s.until).toBe(infoDeadline);
    S.advance(s, none, 1200); S.advance(s, all, 1300); expect(s.phase).toBe('info'); expect(s.until).toBe(infoDeadline);
    S.advance(s, all, infoDeadline); expect(s.phase).toBe('alarm');
  });
  it('handles recovered alarms and missing selected alarm without blank or stuck cycles', () => {
    const s = racing(); S.advance(s, all, 100); S.advance(s, [{ active: false }, ...all.slice(1)], 500);
    expect(s.phase).toBe('alarm'); expect(s.alarmIndex).toBe(1);
    S.advance(s, none, 600); expect(s.phase).toBe('info'); expect(s.alarmIndex).toBe(null);
  });
});
