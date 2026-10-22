/* TermMath math: pure functions, no DOM. Works in the browser (window.TMCalc) and in Node (require).
   GPA = total quality points / GPA credits, where quality points = grade points x credits.
   Final grade needed = (target - grade now x (1 - weight)) / weight. Schools set their own scales and rules. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var EPS = 1e-9;
  var ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
  var PTS_STD = [4.0, 4.0, 3.7, 3.3, 3.0, 2.7, 2.3, 2.0, 1.7, 1.3, 1.0, 0.7, 0];
  var PTS_43 = [4.3, 4.0, 3.7, 3.3, 3.0, 2.7, 2.3, 2.0, 1.7, 1.3, 1.0, 0.7, 0];
  var MIN_STD = [97, 93, 90, 87, 83, 80, 77, 73, 70, 67, 63, 60, 0];
  function build(id, name, order, pts, min) {
    var s = { id: id, name: name, order: order.slice(), pts: {}, min: {} };
    order.forEach(function (l, i) { s.pts[l] = pts[i]; s.min[l] = min[i]; });
    return s;
  }
  var SCALES = {
    std: build('std', 'Standard 4.0 with +/−', ORDER, PTS_STD, MIN_STD),
    plain: build('plain', '4.0, no +/−', ['A', 'B', 'C', 'D', 'F'], [4, 3, 2, 1, 0], [90, 80, 70, 60, 0]),
    p43: build('p43', '4.3 (A+ = 4.3)', ORDER, PTS_43, MIN_STD)
  };
  function scaleFrom(id) { return clone(SCALES[id] || SCALES.std); }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function disp(l) { return String(l).replace('-', '−'); }
  function r(x, dp) { var k = Math.pow(10, dp == null ? 2 : dp); return Math.round((x + (x >= 0 ? EPS : -EPS)) * k) / k; }
  function fix(x, dp) { return r(x, dp).toFixed(dp); }
  function maxPts(scale) { return Math.max.apply(null, scale.order.map(function (l) { return scale.pts[l]; })); }

  // ---- scale serialization (for share links) ----
  function serializeScale(scale) { return scale.order.map(function (l) { return l + ':' + scale.pts[l] + ':' + scale.min[l]; }).join(','); }
  function parseScaleSpec(str) {
    var order = [], pts = [], min = [];
    String(str || '').split(',').forEach(function (p) {
      var a = p.split(':'); if (a.length !== 3) return;
      var l = a[0].trim().toUpperCase().replace(/[−–]/g, '-'); if (!/^[A-F][+-]?$/.test(l) || order.indexOf(l) > -1) return;
      var pt = parseFloat(a[1]), mn = parseFloat(a[2]); if (!isFinite(pt) || !isFinite(mn)) return;
      order.push(l); pts.push(pt); min.push(mn);
    });
    return order.length >= 2 ? build('custom', 'Your scale', order, pts, min) : null;
  }
  function sameScale(a, b) { return serializeScale(a) === serializeScale(b); }

  // ---- bands ----
  function byMinDesc(scale) { scale = scale || SCALES.std; return scale.order.slice().sort(function (a, b) { return scale.min[b] - scale.min[a] || scale.pts[b] - scale.pts[a]; }); }
  function pctToLetter(pct, scale) { scale = scale || SCALES.std;
    var l = byMinDesc(scale), i;
    for (i = 0; i < l.length; i++) if (pct + EPS >= scale.min[l[i]]) return l[i];
    return l[l.length - 1];
  }
  function letterToPoints(letter, scale) { scale = scale || SCALES.std; var l = String(letter).toUpperCase().replace(/[−–]/g, '-'); return scale.pts[l] == null ? null : scale.pts[l]; }
  function bands(scale) { scale = scale || SCALES.std;  // [{letter, pts, lo, hi}] highest first. hi = next higher cutoff - 1 (top band = 100)
    var l = byMinDesc(scale);
    return l.map(function (x, i) { return { letter: x, pts: scale.pts[x], lo: scale.min[x], hi: i === 0 ? 100 : scale.min[l[i - 1]] - 1 }; });
  }
  function uniquePoints(scale) { scale = scale || SCALES.std;  // ascending by points; at equal points prefer the letter without a "+" (A over A+)
    var map = {};
    scale.order.forEach(function (l) { var p = scale.pts[l]; if (!map[p] || (/\+/.test(map[p]) && !/\+/.test(l))) map[p] = l; });
    return Object.keys(map).map(function (k) { return { letter: map[k], pts: +k }; }).sort(function (a, b) { return a.pts - b.pts; });
  }
  function gpaToBand(g, scale) { scale = scale || SCALES.std;
    var u = uniquePoints(scale), lower = null, upper = null, nearest = u[0], i;
    for (i = 0; i < u.length; i++) {
      if (u[i].pts <= g + EPS) lower = u[i];
      if (u[i].pts >= g - EPS && !upper) upper = u[i];
      if (Math.abs(u[i].pts - g) <= Math.abs(nearest.pts - g) + EPS) nearest = u[i];  // ties go up
    }
    return { nearest: nearest, lower: lower, upper: upper, exact: !!(lower && upper && Math.abs(lower.pts - upper.pts) < EPS) };
  }
  function nextStepUp(pts, scale) { scale = scale || SCALES.std;
    var u = uniquePoints(scale);
    for (var i = 0; i < u.length; i++) if (u[i].pts > pts + EPS) return u[i];
    return null;
  }
  function pctApprox(g, scale) { scale = scale || SCALES.std;  // rough percent for a GPA between letters: straight line between the two cutoffs
    var b = gpaToBand(g, scale), lo = b.lower, hi = b.upper;
    if (!lo || !hi) return null;
    if (b.exact) {
      var bd = bands(scale).filter(function (x) { return Math.abs(x.pts - lo.pts) < EPS; });
      return { lo: Math.min.apply(null, bd.map(function (x) { return x.lo; })), hi: Math.max.apply(null, bd.map(function (x) { return x.hi; })), exact: true, letter: lo.letter };
    }
    var a = scale.min[lo.letter], z = scale.min[hi.letter], t = (g - lo.pts) / (hi.pts - lo.pts), v = a + t * (z - a);
    return { lo: Math.floor(v + EPS), hi: Math.ceil(v - EPS), mid: v, exact: false, lower: lo, upper: hi };
  }

  // ---- parsing a grade box ----
  var EXCLUDED = { P: 1, PASS: 1, NP: 1, S: 1, U: 1, CR: 1, NC: 1, W: 1, WD: 1, I: 1, INC: 1, IP: 1, AU: 1, AUD: 1, AUDIT: 1, NR: 1, 'P/F': 1, PF: 1 };
  function parseGrade(str, scale) {
    scale = scale || SCALES.std;
    var raw = String(str == null ? '' : str).trim();
    if (!raw) return { ok: true, blank: true };
    var s = raw.replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim(), up = s.toUpperCase();
    if (EXCLUDED[up]) return { ok: true, excluded: true, label: up, kind: 'excluded' };
    var m = /^([A-Fa-f])\s*([+-]?)$/.exec(s);
    if (m) {
      var base = m[1].toUpperCase(), mod = m[2], letter = base + mod, approx = false;
      if (base === 'E') return { ok: false, error: 'Try a letter like B+, a percent like 88, or points like 3.3.' };
      if (base === 'F' && mod) return { ok: false, error: 'F has no plus or minus.' };
      if (scale.pts[letter] == null) { if (scale.pts[base] != null) { letter = base; approx = true; } else return { ok: false, error: letter + ' is not on your scale.' }; }
      return { ok: true, kind: 'letter', letter: letter, pts: scale.pts[letter], approx: approx };
    }
    var n = /^(\d+(?:\.\d+)?|\.\d+)\s*(%?)$/.exec(s);
    if (n) {
      var v = parseFloat(n[1]), top = maxPts(scale);
      if (!n[2] && v <= 5) {
        if (v > top + EPS) return { ok: false, error: 'That is above the top of your scale (' + top + ').' };
        return { ok: true, kind: 'points', pts: v, letter: gpaToBand(v, scale).nearest.letter };
      }
      if (v > 110) return { ok: false, error: 'A percent over 110 looks like a typo.' };
      var l = pctToLetter(v, scale);
      return { ok: true, kind: 'percent', pct: v, letter: l, pts: scale.pts[l] };
    }
    return { ok: false, error: 'Try a letter like B+, a percent like 88, or points like 3.3.' };
  }

  // ---- GPA ----
  function num(x) { var v = parseFloat(String(x == null ? '' : x).replace(/,/g, '')); return isFinite(v) ? v : NaN; }
  function gpa(rows, scale) {
    scale = scale || SCALES.std;
    var qp = 0, cr = 0, out = [], errors = 0;
    (rows || []).forEach(function (row, i) {
      var p = parseGrade(row.grade, scale), c = num(row.credits), o = { index: i, name: row.name || '', grade: row.grade || '', credits: isFinite(c) ? c : null, parsed: p, status: 'empty', qp: null };
      var blankCr = row.credits == null || String(row.credits).trim() === '';
      if (p.blank && blankCr) { o.status = 'empty'; }
      else if (row.skip) { o.status = 'excluded'; o.reason = 'You marked it as not counting.'; }
      else if (!p.ok) { o.status = 'error'; o.error = p.error; errors++; }
      else if (p.excluded) { o.status = 'excluded'; o.reason = p.label + ' does not count toward GPA.'; }
      else if (p.blank) { o.status = 'error'; o.error = 'Add a grade.'; errors++; }
      else if (!isFinite(c) || c < 0) { o.status = 'error'; o.error = 'Add the credits.'; errors++; }
      else if (c === 0) { o.status = 'excluded'; o.reason = '0 credits.'; }
      else { o.status = 'counted'; o.pts = p.pts; o.letter = p.letter; o.qp = p.pts * c; qp += o.qp; cr += c; }
      out.push(o);
    });
    return { gpa: cr > 0 ? qp / cr : null, qp: qp, credits: cr, counted: out.filter(function (x) { return x.status === 'counted'; }).length, rows: out, errors: errors };
  }
  function simpleAverage(rows, scale) {  // the wrong way: average of grade points ignoring credits
    var g = gpa(rows, scale).rows.filter(function (x) { return x.status === 'counted'; });
    return g.length ? g.reduce(function (a, x) { return a + x.pts; }, 0) / g.length : null;
  }
  function cumulative(priorGpa, priorCr, termQp, termCr) {
    var qp = priorGpa * priorCr + termQp, cr = priorCr + termCr;
    return { gpa: cr > 0 ? qp / cr : null, qp: qp, credits: cr };
  }
  function cumulativeFromGpa(priorGpa, priorCr, termGpa, termCr) { return cumulative(priorGpa, priorCr, termGpa * termCr, termCr); }
  function cumulativeTerms(terms) {
    var qp = 0, cr = 0; (terms || []).forEach(function (t) { var g = num(t.gpa), c = num(t.credits); if (isFinite(g) && isFinite(c) && c > 0) { qp += g * c; cr += c; } });
    return { gpa: cr > 0 ? qp / cr : null, qp: qp, credits: cr };
  }
  function replaceGrade(priorGpa, priorCr, oldGrade, newGrade, credits, scale) {  // retake: one class's old grade is in priorGpa/priorCr
    scale = scale || SCALES.std;
    var o = parseGrade(oldGrade, scale), n = parseGrade(newGrade, scale);
    if (!o.ok || o.blank || o.excluded || !n.ok || n.blank || n.excluded || !(priorCr > 0) || !(credits > 0)) return null;
    var priorQp = priorGpa * priorCr;
    return { replace: (priorQp - o.pts * credits + n.pts * credits) / priorCr,                      // new grade replaces the old one
             average: (priorQp + n.pts * credits) / (priorCr + credits),                             // both attempts stay in the GPA
             oldPts: o.pts, newPts: n.pts, before: priorGpa };
  }

  // ---- weighted (high school) ----
  var WEIGHTS = { regular: 0, honors: 0.5, ap: 1, ib: 1, dual: 1 };
  function weighted(rows, weights, scale) {
    scale = scale || SCALES.std; weights = weights || WEIGHTS;
    var qpW = 0, qpU = 0, cr = 0, out = [];
    (rows || []).forEach(function (row, i) {
      var p = parseGrade(row.grade, scale), c = num(row.credits), lv = row.level || 'regular';
      var o = { index: i, name: row.name || '', level: lv, status: 'empty' };
      var blankCr = row.credits == null || String(row.credits).trim() === '';
      if (p.blank && blankCr) { out.push(o); return; }
      if (row.skip) { o.status = 'excluded'; out.push(o); return; }
      if (!p.ok) { o.status = 'error'; o.error = p.error; out.push(o); return; }
      if (p.excluded) { o.status = 'excluded'; o.reason = p.label + ' does not count toward GPA.'; out.push(o); return; }
      if (p.blank) { o.status = 'error'; o.error = 'Add a grade.'; out.push(o); return; }
      if (!isFinite(c) || c <= 0) { o.status = 'error'; o.error = 'Add the credits.'; out.push(o); return; }
      var bump = p.pts > 0 ? (+weights[lv] || 0) : 0;  // an F earns no bump
      o.status = 'counted'; o.credits = c; o.letter = p.letter; o.pts = p.pts; o.bump = bump; o.wpts = p.pts + bump;
      qpU += p.pts * c; qpW += (p.pts + bump) * c; cr += c; out.push(o);
    });
    return { weighted: cr > 0 ? qpW / cr : null, unweighted: cr > 0 ? qpU / cr : null, qpW: qpW, qpU: qpU, credits: cr, rows: out };
  }

  // ---- target GPA planner ----
  function creditsToReach(cur, curCr, target, avg) {
    if (cur >= target - EPS) return 0;
    if (avg <= target + EPS) return Infinity;
    return curCr * (target - cur) / (avg - target);
  }
  function targetNeeded(cur, curCr, target, nextCr, max) {
    var total = curCr + nextCr, needed = (target * total - cur * curCr) / nextCr;
    return { needed: needed, reachable: needed <= max + EPS, already: cur >= target - EPS, alwaysAbove: needed <= EPS,
             maxReach: (cur * curCr + max * nextCr) / total, minReach: (cur * curCr) / total,
             creditsAtMax: creditsToReach(cur, curCr, target, max), total: total };
  }
  function newGpaAt(cur, curCr, avg, nextCr) { return (cur * curCr + avg * nextCr) / (curCr + nextCr); }

  // ---- finals ----
  function finalNeeded(now, weightPct, target) {
    var w = weightPct / 100, base = now * (1 - w), needed = (target - base) / w;
    return { needed: needed, possible: needed <= 100 + EPS, locked: needed <= EPS, best: base + 100 * w, worst: base, weight: w };
  }
  function finalResult(now, weightPct, score) { var w = weightPct / 100; return now * (1 - w) + score * w; }
  function finalNeededPoints(earned, possible, finalPts, targetPct) {  // points mode
    var total = possible + finalPts, need = targetPct / 100 * total - earned;
    return { needed: need, pct: need / finalPts * 100, total: total, best: (earned + finalPts) / total * 100, worst: earned / total * 100, possible: need <= finalPts + EPS, locked: need <= EPS };
  }
  var FINAL_TARGETS = [['A', 90], ['B', 80], ['C', 70], ['D', 60]];
  function baseLetterCutoff(letter, scale) {  // "B" means any B: the lowest cutoff among B+, B, B-
    var L = String(letter).toUpperCase(), m = scale.order.filter(function (x) { return x.charAt(0) === L; });
    return m.length ? Math.min.apply(null, m.map(function (x) { return scale.min[x]; })) : null;
  }
  function targetToPct(str, scale) {  // "B" -> any-B cutoff; "B+" -> its cutoff; "85" or "85%" -> 85
    scale = scale || SCALES.std; var s = String(str == null ? '' : str).trim().replace(/[−–—]/g, '-');
    if (!s) return null;
    var m = /^([A-Fa-f])\s*([+-]?)$/.exec(s);
    if (m) { var L = m[1].toUpperCase(), mod = m[2]; if (!mod) return baseLetterCutoff(L, scale); return scale.min[L + mod] != null ? scale.min[L + mod] : baseLetterCutoff(L, scale); }
    var n = /^(\d+(?:\.\d+)?)\s*%?$/.exec(s); return n ? parseFloat(n[1]) : null;
  }

  // ---- class grade (weighted categories) ----
  function classGrade(cats) {
    var sw = 0, ew = 0, sum = 0;
    (cats || []).forEach(function (c) {
      var w = num(c.weight); if (!isFinite(w) || w <= 0) return; sw += w;
      var s = num(c.score); if (isFinite(s)) { ew += w; sum += w * s; }
    });
    return { current: ew > 0 ? sum / ew : null, enteredWeight: ew, remainingWeight: sw - ew, totalWeight: sw, points: sum / (sw || 1) };
  }
  function classNeeded(cats, target) {
    var g = classGrade(cats); if (g.current == null || g.remainingWeight <= EPS) return null;
    var f = finalNeeded(g.current, g.remainingWeight / g.totalWeight * 100, target);
    f.current = g.current; f.remainingWeight = g.remainingWeight; f.totalWeight = g.totalWeight; return f;
  }

  // ---- GPA scale converter ----
  var SCALE_MAX = { '4.0': 4, '4.3': 4.3, '5.0': 5, '100': 100 };
  function convertScale(g, from, to) {
    var a = SCALE_MAX[String(from)] || +from, b = SCALE_MAX[String(to)] || +to;
    return g / a * b;
  }
  function biggestLever(rows, scale) {
    scale = scale || SCALES.std;
    var base = gpa(rows, scale), best = null;
    if (base.gpa == null) return null;
    base.rows.forEach(function (x) {
      if (x.status !== 'counted') return;
      var nx = nextStepUp(x.pts, scale); if (!nx) return;
      var gain = (nx.pts - x.pts) * x.credits / base.credits;
      if (!best || gain > best.gain + EPS) best = { index: x.index, name: x.name, credits: x.credits, from: x.letter, fromPts: x.pts, to: nx.letter, toPts: nx.pts, gain: gain, newGpa: base.gpa + gain, oldGpa: base.gpa };
    });
    return best;
  }

  // ---- display helpers ----
  function article(n) {  // "an 80", "an 87", "a 90", "a 71", "an 11"
    var s = String(Math.round(+n * 10) / 10);
    return (/^8/.test(s) || s === '11' || s === '18' || /^(11|18)(\.|$)/.test(s)) ? 'an' : 'a';
  }
  function articleLetter(l) { return /^[AF]/i.test(l) ? 'an' : 'a'; }
  function ceil1(x) { var v = Math.ceil(x * 10 - EPS) / 10; return v; }
  function fmtPct(x, up) { var v = up ? ceil1(x) : r(x, 1); return (Math.round(v) === v ? String(v) : v.toFixed(1)); }

  return { SCALES: SCALES, ORDER: ORDER, WEIGHTS: WEIGHTS, FINAL_TARGETS: FINAL_TARGETS, EPS: EPS,
    scaleFrom: scaleFrom, serializeScale: serializeScale, parseScaleSpec: parseScaleSpec, sameScale: sameScale, maxPts: maxPts, disp: disp, r: r, fix: fix,
    pctToLetter: pctToLetter, letterToPoints: letterToPoints, bands: bands, uniquePoints: uniquePoints, gpaToBand: gpaToBand, nextStepUp: nextStepUp, pctApprox: pctApprox,
    parseGrade: parseGrade, gpa: gpa, simpleAverage: simpleAverage, cumulative: cumulative, cumulativeFromGpa: cumulativeFromGpa, cumulativeTerms: cumulativeTerms, replaceGrade: replaceGrade,
    weighted: weighted, creditsToReach: creditsToReach, targetNeeded: targetNeeded, newGpaAt: newGpaAt,
    finalNeeded: finalNeeded, finalResult: finalResult, finalNeededPoints: finalNeededPoints, targetToPct: targetToPct, baseLetterCutoff: baseLetterCutoff,
    classGrade: classGrade, classNeeded: classNeeded, convertScale: convertScale, biggestLever: biggestLever,
    article: article, articleLetter: articleLetter, ceil1: ceil1, fmtPct: fmtPct, num: num };
});
