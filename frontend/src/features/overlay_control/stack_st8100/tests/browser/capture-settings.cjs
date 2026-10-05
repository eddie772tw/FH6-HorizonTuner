/* Evidence-only helper: never changes product CSS or hides toolbars/scrollbars. */
const assert = require('node:assert/strict');
const path = require('node:path');

function inspectElement(element) {
  const rect = element.getBoundingClientRect();
  const bounds = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const scrollports = [];
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor), r = ancestor.getBoundingClientRect();
    const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX);
    const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY);
    if (clipsX) { clip.left = Math.max(clip.left, r.left + ancestor.clientLeft); clip.right = Math.min(clip.right, r.left + ancestor.clientLeft + ancestor.clientWidth); }
    if (clipsY) { clip.top = Math.max(clip.top, r.top + ancestor.clientTop); clip.bottom = Math.min(clip.bottom, r.top + ancestor.clientTop + ancestor.clientHeight); }
    if (clipsX || clipsY) scrollports.push({ tag: ancestor.tagName, className: ancestor.className, scrollTop: ancestor.scrollTop, scrollHeight: ancestor.scrollHeight, clientHeight: ancestor.clientHeight });
  }
  const center = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
  const visible = getComputedStyle(element).visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  return {
    id: element.id || null, tag: element.tagName, label: element.labels?.[0]?.textContent?.trim() || element.textContent?.trim().slice(0, 160) || null,
    bounds, clip, scrollports, visible,
    horizontallyVisible: rect.left >= clip.left - 1 && rect.right <= clip.right + 1,
    verticallyVisible: rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1,
    unobscured: Boolean(center && (element === center || element.contains(center))),
    occluder: center && !(element === center || element.contains(center)) ? { tag: center.tagName, className: center.className, id: center.id } : null,
    focused: document.activeElement === element,
  };
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function center(page, locator) {
  await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await settle(page);
}
function assertReachable(state, name) {
  assert(state.visible && state.horizontallyVisible && state.verticallyVisible && state.unobscured,
    name + ' is clipped or obscured: ' + JSON.stringify(state));
}

async function captureSettingsPage({ page, target, name, out }) {
  const sourceViewport = page.viewportSize();
  const reachability = [], sections = [];
  const controls = target.locator('input,select');
  const readingTargets = target.locator('legend,input,select,p');
  assert.equal(await target.locator('select[id$="-metric"]').count(), 3, 'Three alarm groups must be present');
  // Prove scroll reachability at the real requested viewport first. A tall
  // evidence viewport below must never stand in for this 390x844 interaction.
  for (let i = 0; i < await readingTargets.count(); i++) {
    const locator = readingTargets.nth(i);
    await center(page, locator);
    const isControl = await locator.evaluate(element => element.matches('input,select'));
    if (isControl && await locator.isEnabled()) await locator.focus();
    const state = await locator.evaluate(inspectElement);
    assertReachable(state, name + ' item ' + i);
    if (isControl) {
      assert(state.label, name + ' control needs an accessible visible label');
      assert(state.focused || !(await locator.isEnabled()), name + ' control cannot receive keyboard focus');
      const label = await locator.evaluate(element => {
        const label = element.labels?.[0]; if (!label) return null;
        const r = label.getBoundingClientRect(), control = element.getBoundingClientRect();
        return { text: label.textContent.trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right,
          controlTop: control.top, controlBottom: control.bottom };
      });
      assert(label && label.top >= state.clip.top - 1 && label.bottom <= state.clip.bottom + 1,
        name + ' scrolled control label is vertically clipped: ' + JSON.stringify(label));
      state.visibleLabel = label;
    }
    reachability.push(state);
  }
  if (sourceViewport.width === 390) {
    const groups = [target.locator(':scope > fieldset').first(),
      ...[1, 2, 3].map(number => target.locator(`select[id$="-alarm-${number}-metric"]`).locator('xpath=ancestor::fieldset[1]'))];
    for (let i = 0; i < groups.length; i++) {
      await center(page, groups[i]); const state = await groups[i].evaluate(inspectElement);
      assertReachable(state, name + ' viewport section ' + i);
      const file = `${name}-viewport-${i === 0 ? 'display' : 'alarm-' + i}.png`;
      await page.screenshot({ path: path.join(out, file), fullPage: false });
      sections.push({ file, viewport: sourceViewport, ...state });
    }
  }

  // The full-card image is truthfully a taller viewport at the SAME width.
  // Keep the nested scroller and sticky toolbar intact, and verify all content
  // is actually visible before asking Playwright for an element screenshot.
  const cardHeight = await target.evaluate(element => Math.ceil(element.getBoundingClientRect().height));
  const captureViewport = { width: sourceViewport.width, height: Math.max(sourceViewport.height, cardHeight + 160) };
  try {
    await page.setViewportSize(captureViewport); await center(page, target);
    const card = await target.evaluate(inspectElement);
    assertReachable(card, name + ' full-card evidence');
    assert(await target.evaluate(element => element.scrollWidth <= element.clientWidth + 1), name + ' card has horizontal overflow');
    const capturedControls = [];
    for (let i = 0; i < await controls.count(); i++) {
      const state = await controls.nth(i).evaluate(inspectElement); assertReachable(state, name + ' full-card control ' + i); capturedControls.push(state);
    }
    for (let i = 0; i < await target.locator('legend,p').count(); i++) assertReachable(await target.locator('legend,p').nth(i).evaluate(inspectElement), name + ' full-card text ' + i);
    await target.screenshot({ path: path.join(out, name + '.png') });
    return { name, width: card.bounds.width, height: card.bounds.height, viewportWidth: captureViewport.width,
      fits: true, verticalFits: true, sourceViewport, captureViewport, controls: capturedControls,
      reachability, sections, note: 'All items reached in the original viewport; full-card PNG uses the recorded taller viewport with the same width and unchanged product styling.' };
  } finally { await page.setViewportSize(sourceViewport); }
}
module.exports = { captureSettingsPage };
