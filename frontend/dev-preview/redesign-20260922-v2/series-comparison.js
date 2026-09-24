/* 品牌对比：勾选同品牌结算单（≤6）→ 品牌 KPI + 等级堆叠条 + 各等级均价表 + 等级细分 + AI 小结。 */
(function () {
  var page = document.getElementById('page');
  var MAX_PICK = 6;
  var state = { start: '', end: '', options: [], picked: [], data: null, ai: null, aiLoading: false };

  function listQuery() {
    var p = new URLSearchParams();
    if (state.start) p.set('start_date', state.start);
    if (state.end) p.set('end_date', state.end);
    p.set('page', '1'); p.set('page_size', '100');
    return '?' + p.toString();
  }
  function seriesQuery() {
    var p = new URLSearchParams();
    state.picked.forEach(function (m) { p.append('merchant_no', m); });
    if (state.start) p.set('start_date', state.start);
    if (state.end) p.set('end_date', state.end);
    return '?' + p.toString();
  }

  function renderShell() {
    page.innerHTML =
      '<form class="filter-bar" id="flt" style="display:grid;grid-template-columns:repeat(2,minmax(150px,1fr)) auto;gap:10px;margin-bottom:14px">' +
        '<div class="field"><label>销售日期起</label><input type="date" id="f-start" value="' + V2.esc(state.start) + '" /></div>' +
        '<div class="field"><label>销售日期止</label><input type="date" id="f-end" value="' + V2.esc(state.end) + '" /></div>' +
        '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" type="submit" style="min-height:50px">查看结果</button></div>' +
      '</form><div id="sc-body">' + V2.skeletonCards(3) + '</div>';
    document.getElementById('flt').addEventListener('submit', function (ev) {
      ev.preventDefault();
      state.start = document.getElementById('f-start').value;
      state.end = document.getElementById('f-end').value;
      if (state.start && state.end && state.start > state.end) { V2.toast('销售日期起不能晚于销售日期止', 'err'); return; }
      state.picked = [];
      state.data = null;
      state.ai = null;
      V2.setQuery({ start: state.start, end: state.end });
      loadOptions();
    });
  }

  function loadOptions() {
    var body = document.getElementById('sc-body');
    body.innerHTML = V2.skeletonCards(3);
    V2.api('/api/settlements' + listQuery()).then(function (d) {
      state.options = (d && d.settlements) || [];
      if (!state.picked.length) {
        state.picked = state.options.slice(0, Math.min(3, state.options.length)).map(function (s) { return s.merchant_no; });
      }
      loadData();
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(V2.errorBanner(e.message, loadOptions));
    });
  }

  function loadData() {
    var body = document.getElementById('sc-body');
    if (state.picked.length < 1) { render(); return; }
    body.innerHTML = V2.skeletonCards(3);
    V2.api('/api/analytics/series-comparison' + seriesQuery()).then(function (d) {
      state.data = d;
      render();
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(V2.errorBanner(e.message, loadData));
    });
  }

  function pickerHtml() {
    var html = '<div class="section-title"><h2>选择结算单</h2><span class="more">同品牌可多选，最多 ' + MAX_PICK + ' 张</span></div>' +
      '<div class="pick-list">';
    html += state.options.map(function (s) {
      var on = state.picked.indexOf(s.merchant_no) >= 0;
      return '<label class="pick-item' + (on ? ' picked' : '') + '">' +
        '<input type="checkbox" data-pick="' + V2.esc(s.merchant_no) + '" data-series="' + V2.esc(s.series || '') + '"' + (on ? ' checked' : '') + ' />' +
        '<span><b>' + V2.esc(s.order_no_normalized || s.order_no || '—') + '</b> ' +
        '<small class="faint">' + V2.esc(s.merchant_no_normalized || s.merchant_no) + ' · ' + V2.esc(s.series || '未识别品牌') + ' · ' + V2.esc(V2.fmt.dateShort(s.sale_date_start)) + '</small></span>' +
        '<span class="amt">' + V2.fmt.money(s.sales_amount) + '</span></label>';
    }).join('');
    return html + '</div>';
  }

  function kpiHtml() {
    var groups = (state.data && state.data.series) || [];
    if (!groups.length) return '';
    var colors = ['var(--brand-600)', '#d9812a', '#2c5f9e', '#7a5aa6', '#b34f82', '#2f6f8f'];
    return '<div class="kpi-grid" style="grid-template-columns:repeat(' + Math.min(3, groups.length) + ',1fr)">' +
      groups.map(function (g, i) {
        var t = g.total || {};
        return '<div class="kpi" style="--kpi-color:' + colors[i % colors.length] + '">' +
          '<div class="kpi-label">' + V2.esc(g.name) + ' · 每件均价</div>' +
          '<div class="kpi-value" style="font-size:1.3rem">' + V2.fmt.price(t.weighted_avg_price) + '</div>' +
          '<div class="kpi-sub">' + V2.fmt.num(t.sales_quantity) + ' 件 · ' + V2.fmt.money(t.sales_amount) + ' · ' + g.settlement_count + ' 张单</div></div>';
      }).join('') + '</div>';
  }

  function stackBarsHtml() {
    var groups = (state.data && state.data.series) || [];
    if (!groups.length) return '';
    var html = '<div class="section-title"><h2>各品牌等级占比</h2><span class="more">件数占比</span></div><div class="card card-pad" style="display:grid;gap:16px">';
    groups.forEach(function (g) {
      var t = g.total || {};
      html += '<div><div style="display:flex;justify-content:space-between;font-size:.9rem;font-weight:800;margin-bottom:7px"><span>' + V2.esc(g.name) + '</span>' +
        '<span class="num" style="color:var(--muted);font-weight:600">' + V2.fmt.num(t.sales_quantity) + ' 件</span></div>' +
        '<div style="height:14px;border-radius:99px;overflow:hidden">' + V2.gradeBar(g.grades, t.sales_quantity) + '</div>' +
        '<div class="bill-grades">' + (g.grades || []).filter(function (x) { return Number(x.sales_quantity) > 0; }).map(function (x) {
          var share = x.quantity_share != null ? Number(x.quantity_share) : 0;
          return '<span>' + V2.esc(V2.gradeMeta(x.grade).label) + ' ' + V2.fmt.pct(share) + '</span>';
        }).join('') + '</div></div>';
    });
    var legend = V2.activeGrades(groups.reduce(function (acc, g) { return acc.concat(g.grades || []); }, [])).map(function (g) {
      return '<span><i style="background:' + V2.gradeMeta(g).color + '"></i>' + V2.esc(V2.gradeMeta(g).label) + '</span>';
    }).join('');
    return html + '<div class="chart-legend" style="border-top:1px solid var(--line);padding-top:12px">' + legend + '</div></div>';
  }

  function priceTableHtml() {
    var groups = (state.data && state.data.series) || [];
    if (!groups.length) return '';
    var grades = V2.activeGrades(groups.reduce(function (acc, g) { return acc.concat(g.grades || []); }, []));
    function price(g, grade) {
      var row = (g.grades || []).find(function (x) { return V2.normalizeGrade(x.grade) === grade; });
      return row && Number(row.sales_quantity) > 0 ? V2.fmt.price(row.weighted_avg_price) : '—';
    }
    var rows = groups.map(function (g) {
      var t = g.total || {};
      var prices = grades.map(function (gr) {
        var row = (g.grades || []).find(function (x) { return V2.normalizeGrade(x.grade) === gr && Number(x.sales_quantity) > 0; });
        return row ? Number(row.weighted_avg_price) : null;
      }).filter(function (v) { return v != null; });
      var spread = prices.length >= 2 ? V2.fmt.price(Math.max.apply(null, prices) - Math.min.apply(null, prices)) : '—';
      return '<tr><td><b>' + V2.esc(g.name) + '</b></td>' +
        grades.map(function (gr) { return '<td class="num">' + price(g, gr) + '</td>'; }).join('') +
        '<td class="num"><b>' + V2.fmt.price(t.weighted_avg_price) + '</b></td>' +
        '<td class="num">' + spread + '</td></tr>';
    }).join('');
    return '<div class="section-title"><h2>各品牌各等级每件均价</h2><span class="more">元/件</span></div>' +
      '<div class="card table-card"><div style="overflow-x:auto"><table class="data-table" style="min-width:' + (300 + grades.length * 90) + 'px">' +
      '<thead><tr><th>品牌</th>' + grades.map(function (g) { return '<th class="num">' + V2.esc(V2.gradeMeta(g).label) + '</th>'; }).join('') +
      '<th class="num">整牌均价</th><th class="num">最高-最低</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function gradeDetailHtml() {
    var gd = (state.data && state.data.grade_details) || {};
    var buckets = gd.buckets || [];
    if (!buckets.length) return '';
    var rows = buckets.map(function (b) {
      return '<tr><td>' + V2.esc(b.label) + '</td>' +
        '<td><span class="gdot" style="background:' + V2.gradeMeta(b.grade).color + '"></span>' + V2.esc(V2.gradeMeta(b.grade).label) + '</td>' +
        '<td class="num">' + V2.fmt.num(b.sales_quantity) + '</td>' +
        '<td class="num">' + V2.fmt.pct(b.quantity_share) + '</td>' +
        '<td class="num">' + V2.fmt.price(b.weighted_avg_price) + '</td>' +
        '<td class="num">' + V2.fmt.money(b.sales_amount) + '</td>' +
        '<td class="num">' + V2.fmt.num(b.record_count) + '</td></tr>';
    }).join('');
    var un = gd.unrecognized && Number(gd.unrecognized.record_count) > 0
      ? '<p class="note" style="margin-top:8px">另有 ' + V2.fmt.num(gd.unrecognized.record_count) + ' 行未能识别号别（' + V2.esc(gd.unrecognized.label || '') + '），共 ' + V2.fmt.num(gd.unrecognized.sales_quantity) + ' 件。</p>'
      : '';
    return '<div class="section-title"><h2>等级细分（号别）</h2><span class="more">按文件规格原文分组</span></div>' +
      '<div class="card table-card"><div style="overflow-x:auto"><table class="data-table" style="min-width:680px">' +
      '<thead><tr><th>号别</th><th>等级</th><th class="num">件数</th><th class="num">件数占比</th><th class="num">每件均价</th><th class="num">销售金额</th><th class="num">行数</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' + un + '</div>';
  }

  function aiHtml() {
    var canRun = state.picked.length >= 2;
    var body;
    if (state.aiLoading) body = '<p class="note">AI 正在分析勾选的 ' + state.picked.length + ' 张结算单…</p>';
    else if (state.ai) body = '<div class="ai-body">' + V2.esc(state.ai.content) + '</div>' +
      '<div class="ai-meta">' + V2.esc(state.ai.model || '') + ' · ' + V2.esc(V2.fmt.dt(state.ai.generated_at)) + (state.ai.cached ? ' · 缓存结果' : '') + '</div>';
    else body = '<p class="note" style="margin-top:6px">' + (canRun ? '勾选 ≥2 张同品牌结算单，可生成 AI 小结。' : '再勾选至少一张同品牌结算单，就能生成 AI 小结。') + '</p>';
    return '<div class="card card-pad ai-card" style="margin-top:14px">' +
      '<div class="flex-between"><b>' + V2.icon('spark') + ' AI 等级细分小结</b>' +
      '<button class="btn btn-ghost" type="button" id="ai-btn" style="min-height:38px;font-size:.84rem"' + (state.aiLoading || !canRun ? ' disabled' : '') + '>' +
        (state.ai ? '重新生成' : '生成小结') + '</button></div>' + body + '</div>';
  }

  function render() {
    var body = document.getElementById('sc-body');
    if (!state.options.length) {
      body.innerHTML = '<div class="empty-box">当前范围没有结算单，请放宽日期范围。</div>';
      return;
    }
    var html = '<div class="page-head" style="padding-bottom:8px"><h1 class="mobile-only" style="font-size:1.2rem">哪个品牌更能卖上价？</h1>' +
      '<p>按品牌汇总销量、金额与每件均价，并拆解各等级表现。数据来自真实结算单。</p></div>' + pickerHtml();
    if (state.data) html += kpiHtml() + stackBarsHtml() + priceTableHtml() + gradeDetailHtml() + aiHtml();
    else html += '<div class="empty-box">勾选结算单后展示品牌对比</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-pick]').forEach(function (box) {
      box.addEventListener('change', function () {
        var m = box.dataset.pick;
        var idx = state.picked.indexOf(m);
        if (idx >= 0) state.picked.splice(idx, 1);
        else {
          if (state.picked.length >= MAX_PICK) { box.checked = false; V2.toast('一次最多对比 ' + MAX_PICK + ' 张', 'err'); return; }
          state.picked.push(m);
        }
        state.ai = null;
        loadData();
      });
    });
    var aiBtn = document.getElementById('ai-btn');
    if (aiBtn) aiBtn.addEventListener('click', function () {
      state.aiLoading = true;
      render();
      V2.api('/api/analytics/grade-detail/analysis', {
        method: 'POST',
        body: { merchant_no: state.picked, start_date: state.start || null, end_date: state.end || null, refresh: state.ai != null }
      }).then(function (res) { state.ai = res; })
        .catch(function (e) { V2.toast('AI 小结失败：' + e.message, 'err'); })
        .finally(function () { state.aiLoading = false; render(); });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    V2.bootShell('series-comparison').then(function () {
      var q = V2.qs();
      state.start = q.get('start') || '';
      state.end = q.get('end') || '';
      renderShell();
      loadOptions();
    });
  });
})();
