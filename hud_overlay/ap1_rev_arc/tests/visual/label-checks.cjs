const assert = require('node:assert/strict');

// Runs inside the real page/frame. Geometry is relative, never a pixel snapshot.
function inspectLabels() {
  const ids = ['speedUnitMph', 'speedUnit', 'boostModeLabel', 'vacModeLabel'];
  const rect = node => {
    const b = node.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
  window.ap1FixedLabelReferences ||= Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const labels = Object.fromEntries(ids.map(id => {
    const node = document.getElementById(id), css = getComputedStyle(node);
    return [id, {
      text: node.textContent, selected: node.dataset.active === 'true', opacity: Number(css.opacity),
      sameNode: node === window.ap1FixedLabelReferences[id], rect: rect(node),
      anchor: { x: node.getAttribute('x'), y: node.getAttribute('y'), transform: node.getAttribute('transform') },
      paint: { fill: css.fill, stroke: css.stroke, color: css.color, fillOpacity: css.fillOpacity, filter: css.filter, textShadow: css.textShadow },
    }];
  }));
  const container = document.getElementById('ap1Cluster');
  return { labels, cluster: rect(container), visible: getComputedStyle(container).display !== 'none',
    rail: rect(document.getElementById('boostSegments')), digits: rect(document.getElementById('speedDigits')),
    rpmSegments: [...document.querySelectorAll('#rpmSegments polygon')].map(rect),
    speed: container.dataset.speed, speedUnit: container.dataset.speedUnit, boostMode: container.dataset.boostMode,
    boostValue: document.getElementById('boostValue').textContent, activeBars: document.querySelectorAll('#boostSegments .is-lit').length,
    dpr: devicePixelRatio };
}

function assertLabels(snapshot, { unit, boostMode }) {
  const labels = snapshot.labels;
  const expected = { speedUnitMph: ['mph', unit === 'mph'], speedUnit: ['km/h', unit === 'kmh'],
    boostModeLabel: ['BOOST', boostMode === 'boost' || boostMode === 'neutral'], vacModeLabel: ['VAC', boostMode === 'vacuum'] };
  for (const [id, [text, selected]] of Object.entries(expected)) {
    const label = labels[id];
    assert.equal(label.text, text, 'Legend text must stay fixed: ' + id);
    assert(label.sameNode, 'Legend must retain its DOM identity: ' + id);
    assert.equal(label.selected, selected, 'Legend selection: ' + id);
    assert(label.opacity > 0 && label.opacity <= 1, 'Both legends must remain visible: ' + id);
    assert.equal(label.opacity === 1, selected, 'Only selected legends use full opacity: ' + id);
  }
  for (const [upper, lower] of [['speedUnitMph', 'speedUnit'], ['boostModeLabel', 'vacModeLabel']]) {
    assert.deepEqual(labels[upper].paint, labels[lower].paint, 'Paired legends differ only in opacity');
    assert.equal(labels[upper].anchor.x, labels[lower].anchor.x, 'Paired legends share horizontal anchor');
    assert(Number(labels[upper].anchor.y) < Number(labels[lower].anchor.y), 'Upper legend must remain above lower legend');
    if (snapshot.visible) assert(labels[upper].rect.y + labels[upper].rect.height <= labels[lower].rect.y, 'Stacked legend ink must not overlap');
  }
  if (boostMode === 'unavailable') {
    assert.equal(labels.boostModeLabel.opacity, labels.vacModeLabel.opacity);
    assert(snapshot.boostValue.startsWith('--'), 'Unavailable boost must not retain numeric telemetry');
    assert.equal(snapshot.activeBars, 0);
  }
  if (!snapshot.visible) return;
  const budget = 1 / snapshot.dpr, c = snapshot.cluster;
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const [id, label] of Object.entries(labels)) {
    const b = label.rect;
    assert(b.width > 0 && b.height > 0, 'Both fixed legends must have visible layout: ' + id);
    assert(b.x >= c.x - budget && b.y >= c.y - budget && b.x + b.width <= c.x + c.width + budget && b.y + b.height <= c.y + c.height + budget, 'Legend must remain contained: ' + id);
    assert(!overlaps(b, snapshot.digits), 'Legend must not overlap speed digits: ' + id);
    assert(!snapshot.rpmSegments.some(segment => overlaps(b, segment)), 'Legend must not overlap RPM band: ' + id);
  }
  assert(labels.vacModeLabel.rect.y + labels.vacModeLabel.rect.height <= snapshot.rail.y, 'Both boost legends must fit above the unchanged rail');
}

module.exports = { inspectLabels, assertLabels };
