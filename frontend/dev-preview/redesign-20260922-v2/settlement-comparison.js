/* 结算单对比：双柜选择 + 关键指标 + 等级成对横条 + 大白话结论 + 全量排名表。 */
(function () {
  var page = document.getElementById('page');
  var state = { start: '', end: '', items: [], left: '', right: '', sortBy: 'sales_amount' };

  function query() {
    var p = new URLSearchParams();
    if (state.start) p.set('start_date', state.start);
    if (state.end) p.set('end_date', state.end);
    p.set('include_all_settlements', 'true');
    return '?' + p.toString();
  }

  function renderShell() {
    page.innerHTML =
      '<form class="filter-bar" id="flt" style="display:grid;grid-template-columns:repeat(2,minmax(150px,1fr)) auto;gap:10px;margin-bottom:14px">' +
        '<div class="field"><label>销售日期起</label><input type="date" id="f-start" value="' + V2.esc(state.start) + '" /></div>' +
        '<div class="field"><label>销售日期止</label><input type="date" id="f-end" value="' + V2.esc(state.end) + '" /></div>' +
        '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" type="submit" style="min-height:50px">查看结果</button></div>' +
      '</form><div id="cmp-body">' + V2.skeletonCards(3) + '</div>';
    document.getElementById('flt').addEventListener('submit', function (ev) {
      ev.preventDefault();
      state.start = document.getElementById('f-start').value;
      state.end = document.getElementById('f-end').value;
      if (state.start && state.end && state.start > state.end) { V2.toast('销售日期起不能晚于销售日期止', 'err'); return; }
      V2.setQuery({ start: state.start, end: state.end });
      load();
    });
  }

  function load() {
    var body = document.getElementById('cmp-body');
    body.innerHTML = V2.skeletonCards(3);
    V2.api('/api/analytics/settlement-comparison' + query()).then(function (d) {
      state.items = (d && d.settlements) || [];
      if (!state.left || !find(state.left)) state.left = state.items[0] && state.items[0].merchant_no;
      if (!state.right || !find(state.right) || state.right === state.left) {
        var second = state.items.find(function (i) { return i.merchant_no !== state.left; });
        state.right = second && second.merchant_no;
      }
      render();
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(V2.errorBanner(e.message, load));
    });
  }

  function find(m) { return state.items.find(function (i) { return i.merchant_no === m; }); }

  function pickerHtml() {
    function opts(cur) {
      return state.items.map(function (i) {
        return '<option value="' + V2.esc(i.merchant_no) + '"' + (i.merchant_no === cur ? ' selected' : '') + '>' +
          V2.esc(i.merchant_no_normalized || i.merchant_no) + ' · ' + V2.esc(i.order_no_normalized || i.order_no || '') + '</option>';
      }).join('');
    }
    return '<div class="filter-scroll" style="margin-top:12px;gap:10px">' +
      '<select id="pick-left" class="field" style="min-height:42px;border:1px solid var(--line-strong);border-radius:10px;padding:0 10px;font:inherit">' + opts(state.left) + '</select>' +
      '<select id="pick-right" class="field" style="min-height:42px;border:1px solid var(--line-strong);border-radius:10px;padding:0 10px;font:inherit">' + opts(state.right) + '</select>' +
      '</div>';
  }

  function vsHtml(l, r) {
    function card(item, color, tag, tagCls) {
      var t = item.total || {};
      return '<div class="vs-card" style="border-top:4px solid ' + color + '">' +
        '<div class="vs-head"><span class="bill-no">' + V2.esc(item.order_no_normalized || item.order_no || '—') +
        '<small>商号 ' + V2.esc(item.merchant_no_normalized || item.merchant_no) + '</small></span>' +
        '<span class="status ' + tagCls + '">' + tag + '</span></div>' +
        '<div class="bill-money"><small>¥</small>' + V2.fmt.num(t.sales_amount) + '</div>' +
        '<div class="bill-meta"><span><b>' + V2.fmt.num(t.sales_quantity) + '</b> 件</span>' +
        '<span>均价 <b>' + V2.fmt.price(t.weighted_avg_price) + '</b></span>' +
        '<span>' + V2.esc(V2.fmt.dateShort(item.start_date)) + ' 销售</span></div>' +
        V2.gradeBar(item.grades, t.sales_quantity) + '</div>';
    }
    return '<div class="vs-cards">' + card(l, 'var(--brand-600)', '本柜', 'status-ok') + card(r, 'var(--accent)', '对比柜', 'status-warn') + '</div>';
  }

  function gradeShare(item, g) {
    var row = (item.grades || []).find(function (x) { return V2.normalizeGrade(x.grade) === g; });
    return row ? Number(row.quantity_share) || 0 : 0;
  }
  function gradeQty(item, g) {
    var row = (item.grades || []).find(function (x) { return V2.normalizeGrade(x.grade) === g; });
    return row ? Number(row.sales_quantity) || 0 : 0;
  }

  function cmpRowsHtml(l, r) {
    function row(lv, rv, label, betterHigh) {
      var lw = betterHigh == null ? false : (betterHigh ? lv > rv : lv < rv);
      var rw = betterHigh == null ? false : (betterHigh ? rv > lv : rv < lv);
      return '<div class="cmp-row"><span class="v num' + (lw ? ' win' : '') + '">' + lv + '</span>' +
        '<span class="lab">' + label + '</span><span class="v right num' + (rw ? ' win' : '') + '">' + rv + '</span></div>';
    }
    var lt = l.total || {}, rt = r.total || {};
    return '<div class="section-title"><h2>关键指标对比</h2><span class="more">绿字为更优</span></div>' +
      '<div class="card card-pad">' +
      row(V2.fmt.num(lt.sales_amount), V2.fmt.num(rt.sales_amount), '销售金额（元）', true) +
      row(V2.fmt.num(lt.sales_quantity), V2.fmt.num(rt.sales_quantity), '销量（件）', true) +
      row(V2.fmt.price(lt.weighted_avg_price), V2.fmt.price(rt.weighted_avg_price), '每件均价（元/件）', true) +
      row(V2.fmt.pct(gradeShare(l, 'A')), V2.fmt.pct(gradeShare(r, 'A')), 'A 果占比', true) +
      row(V2.fmt.pct(gradeShare(l, 'OTHER')), V2.fmt.pct(gradeShare(r, 'OTHER')), '其他占比', false) +
      row((l.rank && l.rank.sales_amount) || '—', (r.rank && r.rank.sales_amount) || '—', '金额排名（全部 ' + state.items.length + ' 张）', false) +
      '</div>';
  }

  function pairBarsHtml(l, r) {
    var grades = V2.activeGrades((l.grades || []).concat(r.grades || []));
    if (!grades.length) return '';
    var html = '<div class="section-title"><h2>各等级件数对比</h2></div><div class="card card-pad pair-bars">';
    grades.forEach(function (g) {
      var lq = gradeQty(l, g), rq = gradeQty(r, g);
      var max = Math.max(lq, rq, 1);
      html += '<div class="pair-bar"><div class="lab"><span class="gdot" style="background:' + V2.gradeMeta(g).color + '"></span><span>' + V2.esc(V2.gradeMeta(g).label) + '</span></div>' +
        '<div class="track">' +
        '<div class="bar"><i style="width:' + (lq / max * 100).toFixed(1) + '%;background:var(--brand-600)"></i><span>' + V2.esc(l.merchant_no_normalized || '') + ' · ' + V2.fmt.num(lq) + '</span></div>' +
        '<div class="bar"><i style="width:' + (rq / max * 100).toFixed(1) + '%;background:var(--accent)"></i><span>' + V2.esc(r.merchant_no_normalized || '') + ' · ' + V2.fmt.num(rq) + '</span></div>' +
        '</div></div>';
    });
    return html + '</div>';
  }

  function conclusionHtml(l, r) {
    var lt = l.total || {}, rt = r.total || {};
    var diff = Number(rt.sales_amount) - Number(lt.sales_amount);
    var better = diff >= 0 ? r : l;
    var worse = diff >= 0 ? l : r;
    var pdiff = Math.abs(Number(rt.weighted_avg_price) - Number(lt.weighted_avg_price));
    var aDiff = (gradeShare(better, 'A') - gradeShare(worse, 'A')) * 100;
    var text = V2.esc(better.order_no_normalized || better.merchant_no) + ' 金额更高（+' + V2.fmt.num(Math.abs(diff)) + ' 元），' +
      '每件均价高 ' + V2.fmt.price(pdiff) + ' 元。' +
      (aDiff > 0.05 ? '它的 A 果占比高 ' + aDiff.toFixed(1) + ' 个百分点，分级更好。' : '两柜分级接近，差距主要在件数。') +
      ' 可对照 ' + V2.esc(better.merchant_no_normalized || '') + ' 的分级标准优化下一柜。';
    return '<div class="card card-pad" style="margin-top:14px;border-left:4px solid var(--brand-600)"><b>怎么看这两柜？</b>' +
      '<p style="margin-top:8px;color:var(--muted);font-size:.92rem;line-height:1.8">' + text + '</p></div>';
  }

  function rankingHtml() {
    var items = state.items.slice().sort(function (a, b) {
      if (state.sortBy === 'start_date') return String(b.start_date).localeCompare(String(a.start_date));
      if (state.sortBy === 'series') return String(a.series).localeCompare(String(b.series), 'zh');
      return (Number((b.total || {})[state.sortBy]) || 0) - (Number((a.total || {})[state.sortBy]) || 0);
    });
    var rows = items.map(function (i, idx) {
      var t = i.total || {};
      return '<tr><td class="num">' + (idx + 1) + '</td>' +
        '<td><b>' + V2.esc(i.order_no_normalized || i.order_no || '—') + '</b><br><small class="faint">' + V2.esc(i.merchant_no_normalized || i.merchant_no) + ' · ' + V2.esc(i.series || '') + '</small></td>' +
        '<td>' + V2.esc(V2.fmt.date(i.start_date)) + '</td>' +
        '<td class="num"><b>' + V2.fmt.money(t.sales_amount) + '</b></td>' +
        '<td class="num">' + V2.fmt.num(t.sales_quantity) + '</td>' +
        '<td class="num">' + V2.fmt.price(t.weighted_avg_price) + '</td>' +
        '<td class="num">' + V2.fmt.pct(i.sales_amount_share) + '</td>' +
        '<td>' + V2.gradeBar(i.grades, t.sales_quantity) + '</td></tr>';
    }).join('');
    return '<div class="section-title"><h2>全部结算单排名</h2>' +
      '<select id="sort-by" style="min-height:34px;border:1px solid var(--line-strong);border-radius:8px;padding:0 8px;font:inherit;font-size:.84rem">' +
        '<option value="sales_amount"' + (state.sortBy === 'sales_amount' ? ' selected' : '') + '>按金额</option>' +
        '<option value="sales_quantity"' + (state.sortBy === 'sales_quantity' ? ' selected' : '') + '>按件数</option>' +
        '<option value="weighted_avg_price"' + (state.sortBy === 'weighted_avg_price' ? ' selected' : '') + '>按均价</option>' +
        '<option value="start_date"' + (state.sortBy === 'start_date' ? ' selected' : '') + '>按日期</option>' +
        '<option value="series"' + (state.sortBy === 'series' ? ' selected' : '') + '>按品牌</option>' +
      '</select></div>' +
      '<div class="card table-card"><div style="overflow-x:auto"><table class="data-table" style="min-width:680px">' +
      '<thead><tr><th class="num">#</th><th>结算单</th><th>销售日期</th><th class="num">销售金额</th><th class="num">件数</th><th class="num">每件均价</th><th class="num">金额占比</th><th>等级结构</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function render() {
    var body = document.getElementById('cmp-body');
    if (state.items.length < 2) {
      body.innerHTML = '<div class="empty-box">当前范围不足两张结算单，无法对比。请放宽日期范围。</div>';
      return;
    }
    var l = find(state.left), r = find(state.right);
    body.innerHTML = '<div class="page-head desktop-only" style="padding-bottom:6px"><p>选两张结算单，看看哪一柜卖得更划算。</p></div>' +
      vsHtml(l, r) + pickerHtml() + cmpRowsHtml(l, r) + pairBarsHtml(l, r) + conclusionHtml(l, r) + rankingHtml();
    document.getElementById('pick-left').addEventListener('change', function (ev) {
      state.left = ev.target.value;
      if (state.right === state.left) { var alt = state.items.find(function (i) { return i.merchant_no !== state.left; }); state.right = alt && alt.merchant_no; }
      render();
    });
    document.getElementById('pick-right').addEventListener('change', function (ev) {
      state.right = ev.target.value;
      if (state.left === state.right) { var alt = state.items.find(function (i) { return i.merchant_no !== state.right; }); state.left = alt && alt.merchant_no; }
      render();
    });
    document.getElementById('sort-by').addEventListener('change', function (ev) { state.sortBy = ev.target.value; render(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    V2.bootShell('settlement-comparison').then(function () {
      var q = V2.qs();
      state.start = q.get('start') || '';
      state.end = q.get('end') || '';
      renderShell();
      load();
    });
  });
})();
