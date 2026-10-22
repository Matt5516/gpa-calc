/* TermMath UI: one script for all tools (form[data-tool]). Math lives in calc.js. State goes in the URL. */
addEventListener('DOMContentLoaded', function () { 'use strict';
  var C = window.TMCalc, form = document.getElementById('tmForm'); if (!form) return;
  var $ = function (i) { return document.getElementById(i); }, n = UI.num, tool = form.dataset.tool, out = $('tmOut'), last = '';
  var esc = UI.esc, fix = C.fix, disp = C.disp;
  function raw(id) { var el = $(id); return el ? String(el.value).trim() : ''; }
  function f(x, dp) { return (+x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function enc(s) { return encodeURIComponent(s); }
  function root() { return UI.root(); }
  function stat(k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  function num(x) { return '<span class="tm-num">' + x + '</span>'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function pc(x) { return C.fmtPct(x, true); }                 // a score you must reach: rounded up to 0.1
  function letterPhrase(g) { var b = C.gpaToBand(g, scale).nearest.letter; return C.articleLetter(b) + ' ' + disp(b); }
  function empty(msg) { return '<div class="empty">' + UI.icon('chart') + '<p><strong>' + msg + '</strong><br>Your answer shows up here as you type.</p></div>'; }
  function answer(cls, big, sub, extra) {
    return '<div class="tm-answer ' + (cls || '') + '"><strong class="tm-big">' + big + '</strong>' + (sub ? '<span class="tm-sub">' + sub + '</span>' : '') + (extra || '') + '</div>';
  }
  function tbl(cap_, head, rows, foot) {
    return '<div class="table-scroll"><table class="cm-tbl"><caption class="sr-only">' + esc(cap_) + '</caption><thead><tr>' + head.map(function (h, i) { return '<th scope="col"' + (i ? ' class="r"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.hl ? ' class="hl"' : '') + (r.dim ? ' class="tm-dim"' : '') + '>' + r.c.map(function (c, i) { return (i ? '<td class="r">' : '<th scope="row">') + c + (i ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') + '</tbody>' + (foot || '') + '</table></div>';
  }
  var CAVEAT = '<p class="hint">Estimates on the scale shown. Schools set their own scales. Check yours and edit the scale if it’s different. Your registrar’s number is the official one.</p>';
  function actions(text) {
    last = text;
    return '<div class="actions no-print"><button type="button" class="btn ghost sm" data-print>' + UI.icon('copy') + 'Print it</button><button type="button" class="btn ghost sm" id="copySum">' + UI.icon('copy') + 'Copy the result</button></div>';
  }
  document.addEventListener('click', function (e) { if (e.target.closest('#copySum')) UI.copy(last, 'Result copied'); });
  var PRINTHEAD = '<p class="tm-printonly"><strong>TermMath</strong> · ' + esc((document.querySelector('h1') || {}).textContent || '') + '</p>';

  // ---------- scale (shared) ----------
  var scale = C.scaleFrom('std');
  function scaleQS() { var sp = $('sp'), sc = $('sc'); return (sc && sc.value ? '&sc=' + enc(sc.value) : '') + (sp && sp.value !== 'std' && !(sc && sc.value) ? '&sp=' + sp.value : ''); }
  function loadScale() {
    var sp = $('sp'), sc = $('sc'); if (!sp) return;
    if (sc && sc.value) { var p = C.parseScaleSpec(sc.value); if (p) { scale = p; sp.value = 'custom'; return; } sc.value = ''; }
    scale = C.scaleFrom(sp.value === 'custom' ? 'std' : sp.value); if (sp.value === 'custom') sp.value = 'std';
  }
  function scaleLabel() { return scale.id === 'custom' ? 'edited scale' : scale.name; }
  function renderScaleUI() {
    var box = $('tmScale'); if (!box) return;
    box.innerHTML = '<table class="cm-tbl tm-sctbl"><caption class="sr-only">Grading scale: points and lowest percent for each letter</caption><thead><tr><th scope="col">Letter</th><th scope="col" class="r">Points</th><th scope="col" class="r">Lowest percent</th></tr></thead><tbody>' +
      scale.order.map(function (l, i) {
        return '<tr><th scope="row">' + disp(l) + '</th><td class="r"><input type="number" step="0.1" min="0" data-sc="pts" data-l="' + l + '" aria-label="' + disp(l) + ' grade points" value="' + scale.pts[l] + '"></td><td class="r"><input type="number" step="1" min="0" max="110" data-sc="min" data-l="' + l + '" aria-label="' + disp(l) + ' lowest percent" value="' + scale.min[l] + '"></td></tr>';
      }).join('') + '</tbody></table><p class="hint">A grade counts as a letter once it reaches the lowest percent. F starts at 0.</p>';
    var nm = $('tmScaleName'); if (nm) nm.textContent = '· ' + scaleLabel();
  }
  function scaleFromInputs() {
    var s = C.scaleFrom(scale.id === 'custom' ? 'std' : scale.id); s = JSON.parse(JSON.stringify(scale)); s.id = 'custom'; s.name = 'Your scale';
    $('tmScale').querySelectorAll('input[data-sc]').forEach(function (el) { var v = parseFloat(el.value); if (isFinite(v)) s[el.dataset.sc === 'pts' ? 'pts' : 'min'][el.dataset.l] = v; });
    return s;
  }
  if ($('tmScale')) {
    $('tmScale').addEventListener('input', function (e) {
      if (!e.target.dataset.sc) return; e.stopPropagation();
      scale = scaleFromInputs(); $('sc').value = C.serializeScale(scale); $('sp').value = 'custom'; var nm = $('tmScaleName'); if (nm) nm.textContent = '· edited scale'; schedule();
    });
    $('sp').addEventListener('change', function () {
      if ($('sp').value === 'custom') { if (!$('sc').value) $('sp').value = 'std'; else return; }
      $('sc').value = ''; scale = C.scaleFrom($('sp').value); renderScaleUI(); schedule();
    });
  }

  // ---------- editable lists (courses, classes, terms, categories) ----------
  var CONF = {
    course: { noun: 'course', skip: true, cols: [{ k: 'name', l: 'Course (optional)', t: 'text', ph: 'Course' }, { k: 'grade', l: 'Grade', t: 'text', ph: 'B+, 88 or 3.3', c: 'g' }, { k: 'credits', l: 'Credits', t: 'number', ph: '3', c: 'c' }] },
    weighted: { noun: 'class', skip: true, cols: [{ k: 'name', l: 'Class (optional)', t: 'text', ph: 'Class' }, { k: 'grade', l: 'Grade', t: 'text', ph: 'B+, 88 or 3.3', c: 'g' }, { k: 'level', l: 'Level', t: 'level', c: 'lv' }, { k: 'credits', l: 'Credits', t: 'number', ph: '1', c: 'c' }] },
    terms: { noun: 'term', cols: [{ k: 'name', l: 'Term (optional)', t: 'text', ph: 'Term' }, { k: 'gpa', l: 'GPA', t: 'number', ph: '3.50', c: 'g' }, { k: 'credits', l: 'Credits', t: 'number', ph: '15', c: 'c' }] },
    cats: { noun: 'category', cols: [{ k: 'name', l: 'Category', t: 'text', ph: 'Homework' }, { k: 'weight', l: 'Weight (%)', t: 'number', ph: '20', c: 'g' }, { k: 'score', l: 'Your score (%)', t: 'number', ph: 'to come', c: 'c' }] }
  };
  var LEVELS = [['regular', 'Regular'], ['honors', 'Honors'], ['ap', 'AP'], ['ib', 'IB'], ['dual', 'Dual enrollment']];
  var lists = {};
  function clean(s) { return String(s == null ? '' : s).replace(/[~;]/g, ' ').trim(); }
  function parseList(kind, str) {
    var cols = CONF[kind].cols;
    return String(str || '').split(';').filter(function (x, i, a) { return x !== '' || a.length > 1 && false; }).map(function (r) {
      var p = r.split('~'), o = {}; cols.forEach(function (c, i) { o[c.k] = p[i] == null ? '' : p[i]; });
      if (kind === 'weighted' && !o.level) o.level = 'regular'; o.skip = CONF[kind].skip && p[cols.length] === '1'; return o;
    });
  }
  function serialize(L) {
    var cols = CONF[L.kind].cols;
    return L.rows.map(function (r) { return cols.map(function (c) { return clean(r[c.k]); }).concat(CONF[L.kind].skip ? [r.skip ? '1' : ''] : []).join('~'); }).join(';');
  }
  function renderList(L, focusIdx) {
    var cf = CONF[L.kind], id = L.hid;
    L.el.innerHTML = L.rows.map(function (r, i) {
      var cells = cf.cols.map(function (c) {
        var iid = id + '-' + i + '-' + c.k, v = esc(r[c.k] == null ? '' : r[c.k]), inner;
        if (c.t === 'level') inner = '<select id="' + iid + '" data-k="' + c.k + '">' + LEVELS.map(function (o) { return '<option value="' + o[0] + '"' + (r[c.k] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
        else if (c.t === 'number') inner = '<input id="' + iid + '" data-k="' + c.k + '" type="number" inputmode="decimal" min="0" step="any" value="' + v + '" placeholder="' + c.ph + '">';
        else inner = '<input id="' + iid + '" data-k="' + c.k + '" type="text" inputmode="text" autocomplete="off" spellcheck="false" value="' + v + '" placeholder="' + (c.k === 'name' ? c.ph + ' ' + (i + 1) : c.ph) + '"' + (c.k === 'grade' ? ' aria-describedby="' + id + '-' + i + '-err"' : '') + '>';
        return '<div class="tm-f ' + (c.c || 'nm') + '"><label for="' + iid + '">' + c.l + '</label>' + inner + '</div>';
      }).join('');
      var skip = cf.skip ? '<label class="tm-skip"><input type="checkbox" data-k="skip"' + (r.skip ? ' checked' : '') + '> Doesn’t count <span class="hint-inline">(pass/fail, withdrawn, audit)</span></label>' : '';
      return '<div class="tm-row" data-i="' + i + '" role="group" aria-label="' + cap(cf.noun) + ' ' + (i + 1) + '">' + cells + '<button type="button" class="icon-btn rm" data-rm="' + i + '" aria-label="Remove ' + cf.noun + ' ' + (i + 1) + '">' + UI.icon('x') + '</button>' + skip + '<span class="tm-err" id="' + id + '-' + i + '-err" role="alert"></span></div>';
    }).join('');
    if (focusIdx != null) { var el = L.el.querySelector('.tm-row[data-i="' + focusIdx + '"] input'); if (el) el.focus(); }
  }
  function syncList(L) {
    L.el.querySelectorAll('.tm-row').forEach(function (row) {
      var r = L.rows[+row.dataset.i]; if (!r) return;
      row.querySelectorAll('[data-k]').forEach(function (el) { r[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
    });
    $(L.hid).value = serialize(L);
  }
  function markErrors(hid, res) {
    var L = lists[hid]; if (!L) return;
    L.el.querySelectorAll('.tm-row').forEach(function (row) {
      var o = res[+row.dataset.i] || {}, msg = o.status === 'error' ? o.error : (o.status === 'excluded' && o.reason ? '' : ''), g = row.querySelector('[data-k="grade"],[data-k="credits"]');
      var e = row.querySelector('.tm-err'); if (e) e.textContent = msg || '';
      row.querySelectorAll('[data-k]').forEach(function (el) { el.setAttribute('aria-invalid', 'false'); });
      if (msg) { var tgt = /credit/i.test(msg) ? row.querySelector('[data-k="credits"]') : row.querySelector('[data-k="grade"]'); if (tgt) tgt.setAttribute('aria-invalid', 'true'); }
    });
  }
  function initLists() {
    form.querySelectorAll('.tm-rows').forEach(function (el) {
      var L = { el: el, kind: el.dataset.kind, hid: el.dataset.input }; L.rows = parseList(L.kind, $(L.hid).value); lists[L.hid] = L; renderList(L);
    });
    form.addEventListener('click', function (e) {
      var a = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]');
      if (a) { var L = Object.keys(lists).map(function (k) { return lists[k]; }).filter(function (x) { return x.kind === a.dataset.add; })[0]; if (!L) return;
        var o = {}; CONF[L.kind].cols.forEach(function (c) { o[c.k] = c.t === 'level' ? 'regular' : ''; }); o.skip = false; L.rows.push(o); $(L.hid).value = serialize(L); renderList(L, L.rows.length - 1); schedule(); }
      if (rm) { var row = rm.closest('.tm-row'), LL = lists[row.parentNode.dataset.input]; syncList(LL); LL.rows.splice(+rm.dataset.rm, 1); $(LL.hid).value = serialize(LL); renderList(LL);
        var nxt = LL.el.querySelector('.tm-row[data-i="' + Math.min(+rm.dataset.rm, LL.rows.length - 1) + '"] input'); if (nxt) nxt.focus(); else { var ab = form.querySelector('[data-add="' + LL.kind + '"]'); if (ab) ab.focus(); } schedule(); }
    });
    form.addEventListener('input', function (e) { var row = e.target.closest && e.target.closest('.tm-row'); if (row) syncList(lists[row.parentNode.dataset.input]); }, true);
    form.addEventListener('change', function (e) { var row = e.target.closest && e.target.closest('.tm-row'); if (row) syncList(lists[row.parentNode.dataset.input]); }, true);
  }
  function rowName(o, i, noun) { return o.name && String(o.name).trim() ? esc(String(o.name).trim()) : cap(noun) + ' ' + (i + 1); }

  var tmpl = {};
  function planHref(gpa, credits) {
    var top = C.maxPts(scale), tg = Math.min(top, Math.ceil(gpa * 10 + 1e-6) / 10);
    return root() + 'raise-gpa-calculator/?cur=' + fix(gpa, 2) + '&cr=' + (+credits.toFixed(2)) + (tg > gpa + 1e-9 ? '&tg=' + fix(tg, 2) : '') + scaleQS();
  }
  function gradeCell(o) {
    var p = o.parsed;
    if (!p || !p.ok || p.blank) return esc(o.grade || '—');
    if (p.kind === 'percent') return esc(o.grade.trim().replace(/%$/, '')) + '% (' + disp(p.letter) + ')';
    if (p.kind === 'points') return f(p.pts, 2) + ' pts (' + disp(p.letter) + ')';
    return disp(p.letter) + (p.approx ? ' <small>(as ' + disp(p.letter) + ')</small>' : '');
  }

  // ---------- tools ----------
  var T = {};

  T.gpa = { run: function () {
    var L = lists.r, G = C.gpa(L.rows, scale); markErrors('r', G.rows);
    var errs = G.rows.filter(function (x) { return x.status === 'error'; });
    if (G.gpa == null) return (errs.length ? '<div class="alert err">' + UI.icon('alert') + '<div>' + esc(errs[0].error) + '</div></div>' : '') + empty('Add a grade and credits to see your GPA');
    var gpa = G.gpa, hasPrior = raw('p') !== '' && n('pc') > 0, P = hasPrior ? C.cumulative(n('p'), n('pc'), G.qp, G.credits) : null;
    var excl = G.rows.filter(function (x) { return x.status === 'excluded'; }).length;
    var extra = '';
    if (P) { var dlt = P.gpa - n('p'); extra = '<p class="tm-line">Cumulative GPA: ' + num(fix(P.gpa, 2)) + ' over ' + f(P.credits, 2).replace(/\.00$/, '') + ' credits' + (Math.abs(dlt) < 0.005 ? ', about the same as before.' : ', ' + (dlt > 0 ? 'up ' : 'down ') + fix(Math.abs(dlt), 2) + ' from ' + fix(n('p'), 2) + '.') + '</p>'; }
    var h = PRINTHEAD + answer('', 'Your semester GPA is ' + num(fix(gpa, 2)) + '.', 'That’s about ' + letterPhrase(gpa) + ' average.' + (excl ? ' ' + excl + ' class' + (excl === 1 ? '' : 'es') + ' not counted.' : ''), extra);
    if (errs.length) h += '<div class="alert">' + UI.icon('alert') + '<div>' + errs.map(function (x) { return rowName(L.rows[x.index], x.index, 'course') + ': ' + esc(x.error); }).join('<br>') + '</div></div>';
    h += '<div class="stats s3">' + stat('Quality points', f(G.qp, 2).replace(/0$/, '').replace(/\.$/, '')) + stat('GPA credits', f(G.credits, 2).replace(/\.?0+$/, '')) + stat('Classes counted', G.counted) + '</div>';
    var rows = G.rows.filter(function (x) { return x.status !== 'empty'; }).map(function (x) {
      var nm = rowName(L.rows[x.index], x.index, 'course');
      if (x.status === 'counted') return { c: [nm, gradeCell(x), f(x.pts, 2), f(x.credits, 2).replace(/\.00$/, ''), f(x.qp, 2)] };
      return { dim: true, c: [nm, gradeCell(x), '—', x.credits == null ? '—' : f(x.credits, 2).replace(/\.00$/, ''), x.status === 'excluded' ? 'Not counted' : 'Fix this row'] };
    });
    h += tbl('Quality points by course', ['Course', 'Grade', 'Points', 'Credits', 'Quality points'], rows, '<tfoot><tr><th scope="row">Total</th><td></td><td></td><td class="r">' + f(G.credits, 2).replace(/\.00$/, '') + '</td><td class="r">' + f(G.qp, 2) + '</td></tr></tfoot>');
    h += '<p class="hint">GPA = ' + f(G.qp, 2) + ' ÷ ' + f(G.credits, 2).replace(/\.00$/, '') + ' = ' + f(gpa, 3) + ', shown to two decimals.</p>';
    var lv = C.biggestLever(L.rows, scale);
    if (lv) h += '<div class="tm-lever"><b>Biggest lever</b><p>Your ' + disp(lv.from) + ' in <em>' + rowName(L.rows[lv.index], lv.index, 'course') + '</em> (' + f(lv.credits, 2).replace(/\.00$/, '') + ' credits) moves your GPA most. One step up, to ' + C.articleLetter(lv.to) + ' ' + disp(lv.to) + ', takes it from ' + num(fix(lv.oldGpa, 2)) + ' to ' + num(fix(lv.newGpa, 2)) + '.</p></div>';
    else if (G.counted) h += '<p class="tm-lever"><b>Top of the scale.</b> Every counted class is already at the highest grade on your scale.</p>';
    var base = P ? P.gpa : gpa, cr = P ? P.credits : G.credits;
    h += '<p class="tm-cta"><a class="btn sm" href="' + planHref(base, cr) + '">Plan your target GPA</a> <a class="btn ghost sm" href="' + root() + 'final-grade-calculator/">Check your final</a></p>' + CAVEAT;
    return h + actions('TermMath: semester GPA ' + fix(gpa, 2) + ' over ' + f(G.credits, 2).replace(/\.00$/, '') + ' credits (' + f(G.qp, 2) + ' quality points)' + (P ? '; cumulative ' + fix(P.gpa, 2) + ' over ' + f(P.credits, 2).replace(/\.00$/, '') + ' credits' : '') + '. ' + location.href);
  } };

  T.cumulative = { run: function () {
    var md = $('md').value, p = n('p'), pcr = n('pc'), termQp = 0, termCr = 0, label = '', G = null;
    if (md === 'rows') { G = C.gpa(lists.r.rows, scale); markErrors('r', G.rows); termQp = G.qp; termCr = G.credits; label = G.counted + ' class' + (G.counted === 1 ? '' : 'es'); }
    else if (md === 'term') { var tg = n('tg'), tc = n('tc'); termQp = tg * tc; termCr = tc; label = 'a ' + fix(tg, 2) + ' term'; }
    else { var TT = C.cumulativeTerms(lists.t.rows); termQp = TT.qp; termCr = TT.credits; label = lists.t.rows.filter(function (r) { return r.gpa !== '' && r.credits !== ''; }).length + ' term(s)'; }
    var h = PRINTHEAD, hasPrior = raw('p') !== '' && pcr >= 0;
    if (!hasPrior && md !== 'multi') return empty('Type your GPA so far and its credits');
    var R = hasPrior ? C.cumulative(p, pcr, termQp, termCr) : C.cumulative(0, 0, termQp, termCr);
    if (R.gpa == null) return empty('Add this term’s courses or GPA to see the new total');
    var termG = termCr > 0 ? termQp / termCr : null, dlt = hasPrior ? R.gpa - p : 0;
    h += answer('', 'Your cumulative GPA is ' + num(fix(R.gpa, 2)) + '.', (hasPrior && pcr > 0 ? (Math.abs(dlt) < 0.005 ? 'About the same as before' : (dlt > 0 ? 'Up ' : 'Down ') + fix(Math.abs(dlt), 2) + ' from ' + fix(p, 2)) + ', over ' : 'Over ') + f(R.credits, 2).replace(/\.00$/, '') + ' credits. That’s about ' + letterPhrase(R.gpa) + ' average.');
    h += '<div class="stats s3">' + stat('Quality points', f(R.qp, 2)) + stat('GPA credits', f(R.credits, 2).replace(/\.00$/, '')) + stat('This term', termG == null ? '—' : fix(termG, 2)) + '</div>';
    h += tbl('How the cumulative GPA adds up', ['Step', 'Math', 'Result'], [
      { c: ['Quality points so far', fix(p, 2) + ' × ' + f(pcr, 2).replace(/\.00$/, '') + ' credits', f(p * pcr, 2)] },
      { c: ['This term (' + esc(label) + ')', f(termQp, 2) + ' quality points', f(termCr, 2).replace(/\.00$/, '') + ' credits'] },
      { hl: true, c: ['Cumulative GPA', f(R.qp, 2) + ' ÷ ' + f(R.credits, 2).replace(/\.00$/, ''), fix(R.gpa, 2)] }]);
    var og = raw('og'), ng = raw('ng'), rc = n('rc');
    if (og && ng && rc > 0 && hasPrior) {
      var RP = C.replaceGrade(p, pcr, og, ng, rc, scale);
      h += RP ? '<div class="tm-lever"><b>Retaking a class</b><p>If the new grade replaces the old one, your GPA goes from ' + num(fix(p, 2)) + ' to ' + num(fix(RP.replace, 2)) + '. If both attempts stay in the average, it goes to ' + num(fix(RP.average, 2)) + '. Schools differ, so check your policy.</p></div>'
        : '<div class="alert">' + UI.icon('alert') + '<div>Type the old grade, the new grade and the credits for the retake (letters, percents or points).</div></div>';
    }
    h += '<p class="tm-cta"><a class="btn sm" href="' + planHref(R.gpa, R.credits) + '">Plan your target GPA</a> <a class="btn ghost sm" href="' + root() + 'gpa-calculator/">Back to the GPA calculator</a></p>' + CAVEAT;
    return h + actions('TermMath: cumulative GPA ' + fix(R.gpa, 2) + ' over ' + f(R.credits, 2).replace(/\.00$/, '') + ' credits. ' + location.href);
  } };

  T.weighted = { run: function () {
    var wts = { regular: 0, honors: n('wh'), ap: n('wa'), ib: n('wi'), dual: n('wd') }, W = C.weighted(lists.r.rows, wts, scale), L = lists.r;
    markErrors('r', W.rows);
    if (W.weighted == null) return empty('Add a grade and credits to see your GPA');
    var gap = W.weighted - W.unweighted, lvName = { regular: 'Regular', honors: 'Honors', ap: 'AP', ib: 'IB', dual: 'Dual enrollment' };
    var h = PRINTHEAD + answer('', 'Your weighted GPA is ' + num(fix(W.weighted, 2)) + '. Unweighted, it’s ' + num(fix(W.unweighted, 2)) + '.', gap > 0.004 ? 'The weighting adds ' + fix(gap, 2) + '.' : 'No weighted classes, so both GPAs match.');
    h += '<div class="stats s3">' + stat('Weighted', fix(W.weighted, 2)) + stat('Unweighted', fix(W.unweighted, 2)) + stat('Credits', f(W.credits, 2).replace(/\.00$/, '')) + '</div>';
    var rows = W.rows.filter(function (x) { return x.status !== 'empty'; }).map(function (x) {
      var nm = rowName(L.rows[x.index], x.index, 'class');
      if (x.status === 'counted') return { c: [nm, disp(x.letter), lvName[x.level], f(x.credits, 2).replace(/\.00$/, ''), f(x.pts, 2), f(x.wpts, 2)] };
      return { dim: true, c: [nm, '—', lvName[x.level] || '', '—', '—', x.status === 'excluded' ? 'Not counted' : 'Fix this row'] };
    });
    h += tbl('Weighted and unweighted points by class', ['Class', 'Grade', 'Level', 'Credits', 'Unweighted', 'Weighted'], rows, '<tfoot><tr><th scope="row">Average</th><td></td><td></td><td class="r">' + f(W.credits, 2).replace(/\.00$/, '') + '</td><td class="r">' + fix(W.unweighted, 2) + '</td><td class="r">' + fix(W.weighted, 2) + '</td></tr></tfoot>');
    h += '<p class="hint">Weighted GPA = ' + f(W.qpW, 2) + ' ÷ ' + f(W.credits, 2).replace(/\.00$/, '') + '; unweighted = ' + f(W.qpU, 2) + ' ÷ ' + f(W.credits, 2).replace(/\.00$/, '') + '. Bumps: honors +' + wts.honors + ', AP +' + wts.ap + ', IB +' + wts.ib + ', dual +' + wts.dual + '. Common bumps; schools differ, some cap or don’t weight, and an F earns no bump.</p>';
    h += '<p class="tm-cta"><a class="btn sm" href="' + root() + 'weighted-vs-unweighted-gpa/">Weighted vs unweighted GPA</a> <a class="btn ghost sm" href="' + root() + 'gpa-scale-converter/?v=' + fix(W.unweighted, 2) + '">Convert to another scale</a></p>' + CAVEAT;
    return h + actions('TermMath: weighted GPA ' + fix(W.weighted, 2) + ', unweighted ' + fix(W.unweighted, 2) + ' over ' + f(W.credits, 2).replace(/\.00$/, '') + ' credits. ' + location.href);
  } };

  T.raise = { run: function () {
    var cur = n('cur'), cr = n('cr'), tg = n('tg'), nx = n('nx'), top = C.maxPts(scale), curS = fix(cur, 2), tgS = fix(tg, 2);
    if (raw('cur') === '' || !(tg > 0)) return empty('Type your GPA and the GPA you want');
    if (cur > top + 1e-9) return '<div class="alert err">' + UI.icon('alert') + '<div>Your GPA is above the top of the scale (' + fix(top, 1) + '). Check the number, or edit the scale.</div></div>';
    if (!(nx > 0)) return empty('Type the credits you have left');
    if (tg > top + 1e-9) return answer('bad', 'A ' + tgS + ' is above the top of your scale (' + fix(top, 1) + ').', 'Pick a target at or below ' + fix(top, 1) + ', or edit the scale.');
    var R = C.targetNeeded(cur, cr, tg, nx, top), nxs = f(nx, 2).replace(/\.00$/, ''), topLetter = C.uniquePoints(scale).slice(-1)[0].letter, h = PRINTHEAD, big, sub, cls = '';
    if (R.already) {
      big = 'You’re already at ' + num(curS) + '.';
      sub = R.alwaysAbove ? 'Even straight F’s over your next ' + nxs + ' credits would keep you at ' + tgS + ' or higher.' : 'Keep a ' + num(fix(R.needed, 2)) + ' or better over your next ' + nxs + ' credits to stay at ' + tgS + ' or higher.';
    } else if (R.reachable) {
      big = 'You need a ' + num(fix(R.needed, 2)) + ' average over your next ' + nxs + ' credits.'; sub = 'That’s about ' + letterPhrase(R.needed) + ' average. ' + (R.needed >= top - 0.15 ? 'It takes nearly straight ' + disp(topLetter) + '’s.' : 'Doable.');
    } else {
      cls = 'warn'; var cm = Math.ceil(R.creditsAtMax - 1e-9);
      big = 'A ' + num(tgS) + ' isn’t reachable in ' + nxs + ' credits.'; sub = 'The highest you can reach is ' + num(fix(R.maxReach, 2)) + '. You’d need ' + cm + ' credits of straight ' + disp(topLetter) + '’s to get there.';
    }
    h += answer(cls, big, sub);
    h += '<div class="stats s3">' + stat('Quality points you have', f(cur * cr, 2)) + stat('You need in total', f(tg * (cr + nx), 2)) + stat('Highest you can reach', fix(R.maxReach, 2)) + '</div>';
    if (!R.already) {
      var avgs = [top, 3.7, 3.5, 3.3, 3.0].filter(function (a, i, arr) { return a <= top + 1e-9 && a > tg + 1e-9 && arr.indexOf(a) === i; });
      if (avgs.length) h += '<h3>How many credits it takes</h3>' + tbl('Credits needed to reach ' + tgS, ['If you average', 'Credits to reach ' + tgS], avgs.map(function (a) {
        var c = C.creditsToReach(cur, cr, tg, a); return { c: [fix(a, 1) + ' (about ' + letterPhrase(a).replace(/^an? /, '') + ')', Math.ceil(c - 1e-9) + ' credits <small>(' + f(c, 1) + ')</small>'] }; }));
      else h += '<p class="hint">No average on your scale gets you above ' + tgS + ' except the top one. Try a nearer target.</p>';
    }
    var steps = [top, 3.7, 3.3, 3.0, 2.0, 0].filter(function (a, i, arr) { return a <= top + 1e-9 && arr.indexOf(a) === i; });
    h += '<h3>What your next ' + nxs + ' credits would do</h3>' + tbl('GPA after the next credits', ['If you average', 'Your GPA becomes'], steps.map(function (a) { var g = C.newGpaAt(cur, cr, a, nx); return { hl: !R.already && R.reachable && Math.abs(a - R.needed) < 0.05, c: [fix(a, 1), fix(g, 2) + (g >= tg - 1e-9 ? ' <small>(' + (g - tg < 1e-9 ? 'reaches' : 'above') + ' ' + tgS + ')</small>' : '')] }; }));
    h += '<p class="hint">The more credits you have, the slower your GPA moves, because each new credit is a smaller share of the total.</p>';
    h += '<p class="tm-cta"><a class="btn sm" href="' + root() + 'gpa-calculator/?p=' + curS + '&pc=' + (+cr.toFixed(2)) + scaleQS() + '">Find this term’s GPA</a> <a class="btn ghost sm" href="' + root() + 'how-to-raise-your-gpa/">How to raise your GPA</a></p>' + CAVEAT;
    return h + actions('TermMath: to go from ' + curS + ' (' + cr + ' credits) to ' + tgS + ' in ' + nxs + ' credits: ' + (R.already ? 'already there' : R.reachable ? 'average ' + fix(R.needed, 2) : 'not reachable, max ' + fix(R.maxReach, 2)) + '. ' + location.href);
  } };

  function targetInfo(str) {
    var t = C.targetToPct(str, scale), s = String(str).trim().replace(/[−–—]/g, '-'), m = /^([A-Fa-f])\s*([+-]?)$/.exec(s);
    return { pct: t, letter: m ? m[1].toUpperCase() + m[2] : null };
  }
  function lockedPhrase(ti) { return ti.letter ? C.articleLetter(ti.letter) + ' ' + disp(ti.letter) : 'at least a ' + pc(ti.pct) + '%'; }
  T.final = { run: function () {
    var md = $('md').value, h = PRINTHEAD;
    if (md === 'points') {
      var ti0 = targetInfo($('tg').value), pe = n('pe'), pp = n('pp'), pf = n('pf');
      if (ti0.pct == null) return empty('Type the grade you want, like B+ or 87');
      if (!(pp > 0) || !(pf > 0)) return empty('Type the points possible so far and the final’s points');
      var P = C.finalNeededPoints(pe, pp, pf, ti0.pct), tgl = ti0.letter ? disp(ti0.letter) : pc(ti0.pct) + '%', best = C.fmtPct(P.best, false);
      if (P.locked) h += answer('good', 'You’ve already locked in ' + lockedPhrase(ti0) + '.', 'Even a zero on the final leaves you at ' + C.fmtPct(P.worst, false) + '%.');
      else if (!P.possible) h += answer('warn', 'A ' + tgl + ' isn’t possible with this final.', 'It would take ' + f(Math.ceil(P.needed * 10 - 1e-9) / 10, 1) + ' of the final’s ' + f(pf, 0) + ' points. The best you can finish with is ' + best + '%, ' + letterPhraseP(P.best) + '.');
      else h += answer('', 'You need ' + num(f(Math.ceil(P.needed * 10 - 1e-9) / 10, 1).replace(/\.0$/, '')) + ' of ' + f(pf, 0) + ' points on the final.', 'That’s ' + C.article(P.pct) + ' ' + pc(P.pct) + '% on the final, to finish with ' + tgl + ' (' + pc(ti0.pct) + '%) over ' + f(P.total, 0) + ' points.');
      h += '<div class="stats s3">' + stat('Ace it', best + '%') + stat('Skip it', C.fmtPct(P.worst, false) + '%') + stat('Total points', f(P.total, 0)) + '</div>' + CAVEAT;
      return h + actions('TermMath: ' + (P.locked ? 'target already locked in' : P.possible ? 'need ' + f(Math.ceil(P.needed * 10 - 1e-9) / 10, 1) + ' of ' + pf + ' final points' : 'target not possible') + '. ' + location.href);
    }
    var now = n('now'), wt = n('wt');
    if (raw('now') === '') return empty('Type your grade now');
    if (!(wt > 0) || wt > 100) return empty('Type what the final is worth, from 1 to 100');
    if (md === 'after') {
      var fs = n('fs'), res = C.finalResult(now, wt, fs), L = C.pctToLetter(res, scale), delta = res - now;
      h += answer('', 'Your course grade is ' + num(C.fmtPct(res, false) + '%') + ', ' + C.articleLetter(L) + ' ' + disp(L) + '.', 'You had ' + C.fmtPct(now, false) + '% before the final. A ' + C.fmtPct(fs, false) + '% on a final worth ' + C.fmtPct(wt, false) + '% ' + (Math.abs(delta) < 0.05 ? 'leaves it where it was.' : (delta > 0 ? 'lifts it ' : 'drops it ') + C.fmtPct(Math.abs(delta), false) + ' points.'));
      h += tbl('Course grade after the final', ['Step', 'Math', 'Result'], [{ c: ['Rest of the course', C.fmtPct(now, false) + ' × ' + C.fmtPct(100 - wt, false) + '%', f(now * (1 - wt / 100), 2)] }, { c: ['The final', C.fmtPct(fs, false) + ' × ' + C.fmtPct(wt, false) + '%', f(fs * wt / 100, 2)] }, { hl: true, c: ['Course grade', 'add them', C.fmtPct(res, false) + '%'] }]) + CAVEAT;
      return h + actions('TermMath: course grade after the final ' + C.fmtPct(res, false) + '% (' + disp(L) + '). ' + location.href);
    }
    var ti = targetInfo($('tg').value);
    if (ti.pct == null) return empty('Type the grade you want, like B+ or 87');
    var N = C.finalNeeded(now, wt, ti.pct), label = ti.letter ? disp(ti.letter) : pc(ti.pct) + '%', nd = pc(N.needed);
    if (N.locked) h += answer('good', 'You’ve already locked in ' + lockedPhrase(ti) + '.', 'Even a 0% on the final leaves you at ' + C.fmtPct(N.worst, false) + '%.');
    else if (!N.possible) h += answer('warn', cap(C.article(N.needed)) + ' ' + num(nd + '%') + ' isn’t possible on this final.', 'The best you can finish with is ' + num(C.fmtPct(N.best, false) + '%') + ', ' + letterPhraseP(N.best) + '. That’s a perfect score, with no extra credit.');
    else h += answer('', 'You need ' + C.article(N.needed) + ' ' + num(nd + '%') + ' on the final.', 'To finish with ' + (ti.letter ? C.articleLetter(ti.letter) + ' ' : '') + label + (ti.letter ? ' (' + pc(ti.pct) + '%)' : '') + '. ' + (N.needed <= 85 ? 'Doable.' : N.needed <= 95 ? 'Within reach.' : 'It takes a near-perfect final.'));
    h += '<div class="stats">' + stat('Ace it (100%)', C.fmtPct(N.best, false) + '% <small>' + disp(C.pctToLetter(N.best, scale)) + '</small>') + stat('Skip it (0%)', C.fmtPct(N.worst, false) + '% <small>' + disp(C.pctToLetter(N.worst, scale)) + '</small>') + '</div>';
    h += '<p class="tm-line">Ace it (100%): you finish with ' + C.fmtPct(N.best, false) + '%. Skip it (0%): you finish with ' + C.fmtPct(N.worst, false) + '%.</p>';
    var lines = C.FINAL_TARGETS.map(function (t) {
      var cut = C.baseLetterCutoff(t[0], scale); if (cut == null) cut = t[1];
      var q = C.finalNeeded(now, wt, cut), st = q.locked ? 'Locked in' : !q.possible ? 'Not possible (best ' + C.fmtPct(q.best, false) + '%)' : pc(q.needed) + '%';
      return { hl: ti.letter && ti.letter === t[0] || Math.abs(cut - ti.pct) < 1e-9, c: [t[0] + ' (' + C.fmtPct(cut, false) + '%+)', st] };
    });
    h += '<h3>Every letter</h3>' + tbl('Score needed on the final for each letter', ['To finish with', 'You need on the final'], lines);
    h += '<p class="hint">Needed score = (' + C.fmtPct(ti.pct, false) + ' − ' + C.fmtPct(now, false) + ' × ' + C.fmtPct(100 - wt, false) + '%) ÷ ' + C.fmtPct(wt, false) + '%. A plain A, B, C or D means any grade of that letter. Your syllabus may use different cutoffs or round up.</p>';
    h += '<p class="tm-cta"><a class="btn sm" href="' + root() + 'how-final-exams-affect-your-grade/">How finals affect your grade</a> <a class="btn ghost sm" href="' + root() + 'gpa-calculator/">Find your GPA</a></p>' + CAVEAT;
    return h + actions('TermMath: with ' + C.fmtPct(now, false) + '% now and a final worth ' + C.fmtPct(wt, false) + '%, to finish with ' + label + ' you ' + (N.locked ? 'have already locked it in' : !N.possible ? 'cannot get there (best ' + C.fmtPct(N.best, false) + '%)' : 'need ' + nd + '% on the final') + '. ' + location.href);
  } };
  function letterPhraseP(pct) { var l = C.pctToLetter(pct, scale); return C.articleLetter(l) + ' ' + disp(l); }

  var MAXL = function () { var t = C.maxPts(scale); return fix(t, 1); };
  T.convert = { run: function () {
    var s = raw('gr'); if (!s) return empty('Type a percent, a letter or GPA points');
    var p = C.parseGrade(s, scale), bd = C.bands(scale), top = MAXL(), hl = {}, h = PRINTHEAD, big, sub = '', copy;
    if (!p.ok) return '<div class="alert err">' + UI.icon('alert') + '<div>' + esc(p.error) + '</div></div>';
    if (p.excluded) return answer('', esc(p.label) + ' doesn’t count toward GPA.', 'Pass/fail, withdrawn, incomplete and audit grades usually stay out of the average. Schools differ, so check your policy.');
    var pctText = function (x) { return x.lo === 0 ? 'below ' + (x.hi + 1) + '%' : x.lo === x.hi ? x.lo + '%' : x.lo + '–' + x.hi + '%'; };
    var rng = function (l) { var b = bd.filter(function (x) { return x.letter === l; })[0]; return b ? pctText(b) : ''; };
    if (p.kind === 'percent') {
      hl[p.letter] = 1; big = num(C.fmtPct(p.pct, false) + '%') + ' is ' + C.articleLetter(p.letter) + ' ' + num(disp(p.letter)) + ', ' + num(f(p.pts, 1)) + ' on a ' + top + ' scale.';
      sub = disp(p.letter) + ' covers ' + rng(p.letter) + ' on this scale.'; copy = C.fmtPct(p.pct, false) + '% = ' + disp(p.letter) + ', ' + f(p.pts, 1) + ' points';
    } else if (p.kind === 'letter') {
      hl[p.letter] = 1; big = C.articleLetter(p.letter).replace(/^a/, 'A') + ' ' + num(disp(p.letter)) + ' is worth ' + num(f(p.pts, 1)) + ' on a ' + top + ' scale.';
      sub = 'That’s ' + rng(p.letter) + (p.approx ? ' (' + disp(p.letter) + ' is the closest letter on your scale)' : '') + '.'; copy = disp(p.letter) + ' = ' + f(p.pts, 1) + ' points, ' + rng(p.letter);
    } else {
      var b = C.gpaToBand(p.pts, scale), a = C.pctApprox(p.pts, scale);
      if (b.exact) { hl[b.nearest.letter] = 1; big = num(f(p.pts, 1)) + ' is ' + C.articleLetter(b.nearest.letter) + ' ' + num(disp(b.nearest.letter)) + ' on a ' + top + ' scale.'; sub = 'That’s ' + (a ? a.lo + '–' + a.hi + '%' : '') + ' on this scale.'; copy = f(p.pts, 1) + ' = ' + disp(b.nearest.letter); }
      else { hl[b.lower.letter] = 1; hl[b.upper.letter] = 1; big = num(f(p.pts, 2).replace(/0$/, '')) + ' is between ' + C.articleLetter(b.lower.letter) + ' ' + disp(b.lower.letter) + ' (' + f(b.lower.pts, 1) + ') and ' + C.articleLetter(b.upper.letter) + ' ' + disp(b.upper.letter) + ' (' + f(b.upper.pts, 1) + ').'; sub = 'That’s about ' + (a.lo === a.hi ? a.lo : a.lo + '–' + a.hi) + '% on this scale. It’s approximate: a GPA averages many grades.'; copy = f(p.pts, 2) + ' is between ' + disp(b.lower.letter) + ' and ' + disp(b.upper.letter); }
    }
    h += answer('', big, sub);
    h += '<h3>The scale</h3>' + tbl('Grading scale: letter, points and percent', ['Letter', 'Points', 'Percent'], bd.map(function (x) { return { hl: hl[x.letter], c: [disp(x.letter), f(x.pts, 1), pctText(x)] }; }));
    h += '<p class="hint">Percent bands are a common 10-point scale; yours may differ. Open Scale to edit them.</p>' + CAVEAT;
    return h + actions('TermMath: ' + copy + '. ' + location.href);
  } };

  var FROM_LABEL = { '4.0': '4.0', '4.3': '4.3', '5.0': '5.0', '100': '100-point' };
  function reading(v, from, to) {
    var std = C.SCALES.std, p43 = C.SCALES.p43;
    if (from === '100') {
      if (to === '5.0') return 'A 5.0 scale is usually weighted, so it depends on which classes you took. Try the weighted GPA calculator.';
      var L = C.pctToLetter(v, std), pts = (to === '4.3' ? p43 : std).pts[L]; return 'Via letters: ' + v + ' is ' + C.articleLetter(L) + ' ' + disp(L) + ', which is ' + f(pts, 1) + '.';
    }
    if (to === '100') {
      if (from === '5.0') return 'Unknown from the number alone: a weighted 5.0 mixes in class levels.';
      var a = C.pctApprox(Math.min(v, 4.0), from === '4.3' ? p43 : std); if (!a) return 'Outside the scale.'; return 'Via letters: about ' + (a.lo === a.hi ? a.lo : a.lo + '–' + a.hi) + '% on a 10-point scale (approximate).';
    }
    if (from === '4.0' && to === '4.3') return 'Stays ' + f(v, 2).replace(/0$/, '') + ' unless you earned A+’s, which are worth 4.3 there.';
    if (from === '4.3' && to === '4.0') return v > 4 ? 'At most 4.0: an A+ counts as 4.0 on the standard scale.' : 'About the same, a little lower if you earned A+’s.';
    if (to === '5.0') return 'Same as your unweighted GPA. A 5.0 scale adds points only for weighted classes (AP, IB, honors).';
    return 'A weighted GPA can’t be turned back into an unweighted one from the number alone. Use your real classes in the weighted GPA calculator.';
  }
  T.scale = { run: function () {
    var v = n('v'), from = $('fr').value, h = PRINTHEAD;
    if (raw('v') === '' || !(v > 0)) return empty('Type your GPA or score');
    var fm = { '4.0': 4, '4.3': 4.3, '5.0': 5, '100': 100 }[from];
    if (v > fm + 1e-9) return '<div class="alert err">' + UI.icon('alert') + '<div>' + fix(v, 2) + ' is above the top of a ' + FROM_LABEL[from] + ' scale (' + fm + ').</div></div>';
    var tos = ['4.0', '4.3', '5.0', '100'].filter(function (t) { return t !== from; }), main = from === '4.0' ? '5.0' : '4.0';
    var m = C.convertScale(v, from, main), vs = from === '100' ? f(v, 0) : f(v, 2).replace(/0$/, '');
    h += answer('', num(vs) + ' on a ' + FROM_LABEL[from] + ' scale is ' + num(main === '100' ? f(m, 1) : fix(m, 2)) + ' on a ' + FROM_LABEL[main] + ' scale by straight proportion.', 'Straight proportion: ' + vs + ' ÷ ' + fm + ' × ' + { '4.0': 4, '4.3': 4.3, '5.0': 5, '100': 100 }[main] + ' = ' + (main === '100' ? f(m, 1) : f(m, 3).replace(/0$/, '')) + '. Admissions offices recalculate with their own rules.');
    h += tbl('Your GPA on other scales', ['Scale', 'Straight proportion', 'Letter-based reading'], tos.map(function (t) {
      var x = C.convertScale(v, from, t), tm = { '4.0': 4, '4.3': 4.3, '5.0': 5, '100': 100 }[t];
      return { c: [FROM_LABEL[t] + ' scale', '<strong>' + (t === '100' ? f(x, 1) : fix(x, 2)) + '</strong><br><small>' + vs + ' ÷ ' + fm + ' × ' + tm + '</small>', '<span class="tm-read">' + esc(reading(v, from, t)) + '</span>'] };
    }));
    h += '<p class="hint">Straight proportion rescales the number. The letter-based reading asks which grades would produce it. A 5.0 scale is normally weighted: AP and honors classes earn extra points, so only your real classes can tell you the weighted number.</p>';
    h += '<p class="tm-cta"><a class="btn sm" href="' + root() + 'weighted-gpa-calculator/">Weighted GPA calculator</a> <a class="btn ghost sm" href="' + root() + 'gpa-scale/">See the GPA scale chart</a></p>';
    return h + actions('TermMath: ' + vs + ' on a ' + FROM_LABEL[from] + ' scale is ' + (main === '100' ? f(m, 1) : fix(m, 2)) + ' on a ' + FROM_LABEL[main] + ' scale by straight proportion. ' + location.href);
  } };

  T.class = { run: function () {
    var L = lists.r, G = C.classGrade(L.rows), h = PRINTHEAD, ti = targetInfo($('tg').value);
    markClassErrors(L);
    if (G.current == null) return empty('Add a category with a weight and a score');
    var cur = G.current, Lt = C.pctToLetter(cur, scale), big = 'Your grade so far is ' + num(C.fmtPct(cur, false) + '%') + ', ' + C.articleLetter(Lt) + ' ' + disp(Lt) + '.', sub, cls = '';
    if (G.remainingWeight <= 1e-9) sub = 'Every category has a score, so this is your grade.';
    else if (ti.pct == null) sub = 'Type the grade you want to see what you need on the remaining ' + C.fmtPct(G.remainingWeight, false) + '%.';
    else {
      var N = C.classNeeded(L.rows, ti.pct), lbl = ti.letter ? disp(ti.letter) : C.fmtPct(ti.pct, false) + '%', rem = C.fmtPct(G.remainingWeight, false) + '%';
      if (N.locked) { sub = 'You’ve already locked in ' + lockedPhrase(ti) + '. Even a 0% on the remaining ' + rem + ' leaves you at ' + C.fmtPct(N.worst, false) + '%.'; cls = 'good'; }
      else if (!N.possible) { sub = 'A ' + lbl + ' isn’t possible: it would take ' + pc(N.needed) + '% on the remaining ' + rem + '. The best you can finish with is ' + C.fmtPct(N.best, false) + '%, ' + letterPhraseP(N.best) + '.'; cls = 'warn'; }
      else sub = 'To finish with ' + (ti.letter ? C.articleLetter(ti.letter) + ' ' : '') + lbl + ' you need ' + num(pc(N.needed) + '%') + ' on the remaining ' + rem + '.';
    }
    h += answer(cls, big, sub);
    var tw = G.totalWeight, rows = L.rows.filter(function (r) { return C.num(r.weight) > 0; }).map(function (r, i) {
      var w = C.num(r.weight), s = C.num(r.score), has = isFinite(s);
      return has ? { c: [rowName(r, i, 'category'), C.fmtPct(w, false) + '%', C.fmtPct(s, false) + '%', f(w * s / tw, 2)] } : { dim: true, c: [rowName(r, i, 'category'), C.fmtPct(w, false) + '%', 'to come', '—'] };
    });
    h += tbl('Categories and what each adds to your grade', ['Category', 'Weight', 'Score', 'Points toward final grade'], rows);
    h += '<p class="hint">Grade so far = Σ(weight × score) ÷ weights entered = ' + C.fmtPct(cur, false) + '%. Weights add up to ' + C.fmtPct(tw, false) + '. Your syllabus may drop the lowest score or round up.</p>' + CAVEAT;
    return h + actions('TermMath: class grade so far ' + C.fmtPct(cur, false) + '%. ' + location.href);
  } };
  function markClassErrors(L) {
    L.el.querySelectorAll('.tm-row').forEach(function (row) {
      var r = L.rows[+row.dataset.i], e = row.querySelector('.tm-err'), w = C.num(r.weight), s = C.num(r.score), msg = '';
      if (r.weight !== '' && !(w > 0)) msg = 'Weight should be more than 0.'; else if (r.score !== '' && !(s >= 0)) msg = 'Score should be 0 or more.'; else if (r.weight === '' && r.score !== '') msg = 'Add this category’s weight.';
      if (e) e.textContent = msg;
    });
  }

  // ---------- wire up ----------
  var tl = T[tool]; if (!tl) return;
  UI.readState();
  loadScale(); renderScaleUI();
  initLists();
  function show() { form.querySelectorAll('[data-show]').forEach(function (el) { var p = el.dataset.show.split('='), v = $(p[0]) ? $(p[0]).value : ''; el.hidden = p[1].split('|').indexOf(v) < 0; }); }
  function openIf(boxId, ids) { var b = $(boxId); if (b && ids.some(function (i) { var el = $(i); return el && el.value !== (el.dataset.def || ''); })) b.open = true; }
  openIf('tmPriorBox', ['p', 'pc']); openIf('tmScaleBox', ['sc', 'sp']); openIf('tmRetake', ['og', 'ng', 'rc']); openIf('tmBumps', ['wh', 'wa', 'wi', 'wd']);
  function render() {
    show();
    var bad = 0; form.querySelectorAll('input[type=number]:not([data-sc])').forEach(function (el) { var b = el.value !== '' && !isFinite(+el.value); el.setAttribute('aria-invalid', b ? 'true' : 'false'); if (b) bad++; });
    history.replaceState(null, '', UI.stateURL());
    var nm = $('tmScaleName'); if (nm) nm.textContent = '· ' + scaleLabel();
    out.innerHTML = bad ? '<div class="alert err">' + UI.icon('alert') + '<div>Some numbers don’t work. Fix the highlighted fields.</div></div>' : tl.run();
    UI.syncPresets && UI.syncPresets();
  }
  var deb = UI.debounce(render, 40);
  function schedule() { deb(); }
  form.addEventListener('input', deb); form.addEventListener('change', deb);
  render();
});
