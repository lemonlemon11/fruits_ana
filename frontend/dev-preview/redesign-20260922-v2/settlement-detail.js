/* 结算单详情：金额 hero + 基础信息 + 等级结构/均价 + 规格聚合 + 趋势 + 销售明细 + 结算信息 + AI 分析 + 导出/删除/复核。 */
(function () {
  var page = document.getElementById('page');
  var merchant = '';
  var state = { detail: null, ai: null, aiLoading: false };

  function heroHtml(d) {
    var t = d.total || {};
    var st = d.settlement || {};
    var afterShare = st.after_sales_amount != null && t.sales_amount ? Number(st.after_sales_amount) / Number(t.sales_amount) : null;
    return '<div class="hero-money">' +
      '<div class="k">销售金额（' + V2.esc(periodText(d)) + '）</div>' +
      '<div class="v"><small>¥</small>' + V2.fmt.num(t.sales_amount) + '</div>' +
      '<div class="subs">' +
        '<div class="s"><div class="k">总件数</div><div class="n">' + V2.fmt.num(t.sales_quantity) + ' 件</div></div>' +
        '<div class="s"><div class="k">每件均价</div><div class="n">' + V2.fmt.price(t.weighted_avg_price) + ' 元/件</div></div>' +
        '<div class="s"><div class="k">售后 / 占比</div><div class="n">' + (st.after_sales_amount != null ? V2.fmt.num(st.after_sales_amount) + ' · ' + V2.fmt.pct(afterShare, 2) : '暂无') + '</div></div>' +
      '</div></div>';
  }

  function periodText(d) {
    var p = d.sales_period || {};
    if (p.start_date && p.end_date && p.start_date !== p.end_date) return V2.fmt.date(p.start_date) + ' ~ ' + V2.fmt.date(p.end_date) + ' 销售';
    if (p.start_date) return V2.fmt.date(p.start_date) + ' 销售';
    return '全部销售';
  }

  function infoHtml(d) {
    var badge = d.source_type === 'manual'
      ? '<span class="status status-ok">手工录单</span>'
      : '<span class="status status-info">文件导入</span>';
    function cell(k, v, num) { return '<div class="cell"><div class="k">' + k + '</div><div class="v' + (num ? ' num' : '') + '">' + v + '</div></div>'; }
    return '<div class="card card-pad" style="margin-top:14px">' +
      '<div class="section-title" style="margin-top:0"><h2>基础信息</h2>' + badge + '</div>' +
      '<div class="info-grid">' +
        cell('市场', V2.esc(d.market || '—')) +
        cell('单号', V2.esc(d.order_no_normalized || d.order_no || '—')) +
        cell('商号', V2.esc(d.merchant_no_normalized || d.merchant_no)) +
        cell('到达市场日期', V2.esc(V2.fmt.date(d.arrival_date))) +
        cell('到货件数', d.arrival_quantity != null ? V2.fmt.num(d.arrival_quantity) + ' 件' : '—', true) +
        cell('销售日期', V2.esc(periodText(d))) +
        cell('柜号', V2.esc(d.container_no || '—')) +
        cell('转运车号', V2.esc(d.vehicle_no || '—')) +
      '</div></div>';
  }

  function gradePanelsHtml(d) {
    var grades = d.grades || [];
    var maxPrice = Math.max.apply(null, grades.map(function (g) { return Number(g.weighted_avg_price) || 0; }).concat([1]));
    var hbars = grades.map(function (g) {
      var pct = (Number(g.weighted_avg_price) || 0) / maxPrice * 100;
      return '<div class="hbar-row hbar-4"><span class="gdot" style="background:' + V2.gradeMeta(g.grade).color + '"></span>' +
        '<span style="min-width:34px">' + V2.esc(V2.gradeMeta(g.grade).label.replace(' 果', '').replace('（含 BC）', '')) + '</span>' +
        '<div class="hbar"><i style="width:' + pct.toFixed(1) + '%;background:' + V2.gradeMeta(g.grade).color + '"></i></div>' +
        '<b class="num">' + V2.fmt.price(g.weighted_avg_price) + '</b></div>';
    }).join('');
    var a = grades.find(function (g) { return V2.normalizeGrade(g.grade) === 'A'; });
    var note = '';
    if (grades.length >= 2 && a) {
      var others = grades.filter(function (g) { return V2.normalizeGrade(g.grade) !== 'A' && Number(g.weighted_avg_price) > 0; });
      if (others.length) {
        var lowest = others.reduce(function (m, g) { return Number(g.weighted_avg_price) < Number(m.weighted_avg_price) ? g : m; });
        var diff = Number(a.weighted_avg_price) - Number(lowest.weighted_avg_price);
        if (diff > 0) note = '<p class="note" style="margin-top:12px">A 果与' + V2.esc(V2.gradeMeta(lowest.grade).label) + '价差 ' + V2.fmt.price(diff) + ' 元/件。</p>';
      }
    }
    return '<div class="grid-2-even" style="margin-top:14px">' +
      '<div class="card card-pad"><div class="section-title" style="margin-top:0"><h2>等级件数结构</h2></div>' + V2.donut(grades) + '</div>' +
      '<div class="card card-pad"><div class="section-title" style="margin-top:0"><h2>各等级平均每件售价</h2></div>' + hbars + note + '</div>' +
      '</div>';
  }

  /* 规格聚合：按等级 + 规格文本汇总销售明细行 */
  function specTableHtml(d) {
    var records = d.records || [];
    if (!records.length) return '';
    var map = {};
    records.forEach(function (r) {
      var g = V2.normalizeGrade(r.grade);
      var spec = (r.spec_raw || '未标注').trim() || '未标注';
      var key = g + '|' + spec;
      if (!map[key]) map[key] = { grade: g, spec: spec, qty: 0, amt: 0 };
      map[key].qty += Number(r.quantity) || 0;
      map[key].amt += Number(r.amount) || 0;
    });
    var totalQty = records.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0) || 1;
    var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      var order = ['A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER'];
      var d1 = order.indexOf(a.grade) - order.indexOf(b.grade);
      return d1 !== 0 ? d1 : b.qty - a.qty;
    });
    var body = rows.map(function (r) {
      return '<tr><td><span class="gdot" style="background:' + V2.gradeMeta(r.grade).color + '"></span>' + V2.esc(V2.gradeMeta(r.grade).label) + '</td>' +
        '<td>' + V2.esc(r.spec) + '</td>' +
        '<td class="num">' + V2.fmt.num(r.qty) + '</td>' +
        '<td class="num">' + V2.fmt.pct(r.qty / totalQty) + '</td>' +
        '<td class="num">' + (r.qty ? V2.fmt.price(r.amt / r.qty) : '—') + '</td>' +
        '<td class="num">' + V2.fmt.money(r.amt) + '</td></tr>';
    }).join('');
    return '<div class="section-title"><h2>各等级各规格件数 / 均价</h2><span class="more">共 ' + rows.length + ' 个规格</span></div>' +
      '<div class="card table-card"><div style="overflow-x:auto"><table class="data-table spec-table" style="min-width:560px">' +
      '<thead><tr><th>等级</th><th>规格</th><th class="num">件数</th><th class="num">占比</th><th class="num">每件均价</th><th class="num">销售金额</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div>';
  }

  function trendHtml(d) {
    var tr = d.trend || [];
    if (!tr.length) return '';
    var points = tr.map(function (p) { return { label: p.sale_date, value: p.sales_amount }; });
    return '<div class="card card-pad" style="margin-top:14px"><div class="section-title" style="margin-top:0"><h2>每天销售金额</h2></div>' +
      V2.lineChart(points, { axis: function (v) { return (v / 10000).toFixed(1) + '万'; } }) + '</div>';
  }

  function recordsHtml(d) {
    var records = d.records || [];
    if (!records.length) return '<div class="empty-box">当前范围没有销售明细</div>';
    var rows = records.map(function (r) {
      return '<tr><td>' + V2.esc(V2.fmt.date(r.sale_date)) + '</td>' +
        '<td>' + V2.esc(r.fruit_type || '—') + '</td>' +
        '<td><span class="gdot" style="background:' + V2.gradeMeta(r.grade).color + '"></span>' + V2.esc(V2.gradeMeta(r.grade).label) +
          (r.grade_raw && V2.normalizeGrade(r.grade_raw) !== V2.normalizeGrade(r.grade) ? ' <small class="faint">(原:' + V2.esc(r.grade_raw) + ')</small>' : '') + '</td>' +
        '<td>' + V2.esc(r.spec_raw || '—') + '</td>' +
        '<td class="num">' + V2.fmt.num(r.quantity) + '</td>' +
        '<td class="num">' + V2.fmt.price(r.unit_price) + '</td>' +
        '<td class="num">' + V2.fmt.money(r.amount) + '</td>' +
        '<td>' + V2.esc(r.remark || '') + '</td>' +
        '<td><a class="link" href="/api/exports/records/' + r.id + '/source" title="查看原始文件行">#' + V2.esc(r.source_file_id || '—') + '</a></td></tr>';
    }).join('');
    var cards = records.map(function (r) {
      return '<div class="card card-pad" style="padding:14px"><div class="flex-between"><b>' + V2.esc(V2.fmt.date(r.sale_date)) + '</b>' +
        '<span class="gdot" style="background:' + V2.gradeMeta(r.grade).color + '"></span><span>' + V2.esc(V2.gradeMeta(r.grade).label) + '</span></div>' +
        '<div class="bill-meta" style="margin-top:8px"><span>数量 <b>' + V2.fmt.num(r.quantity) + '</b></span><span>单价 <b>' + V2.fmt.price(r.unit_price) + '</b></span><span>金额 <b>' + V2.fmt.money(r.amount) + '</b></span></div>' +
        (r.remark ? '<p class="note" style="margin-top:6px">' + V2.esc(r.remark) + '</p>' : '') + '</div>';
    }).join('');
    return '<div class="section-title"><h2>销售明细</h2><span class="more">共 ' + records.length + ' 行</span></div>' +
      '<div class="card table-card desktop-only"><div style="overflow-x:auto"><table class="data-table" style="min-width:760px">' +
      '<thead><tr><th>销售日期</th><th>果品</th><th>等级</th><th>规格</th><th class="num">数量(件)</th><th class="num">单价</th><th class="num">金额</th><th>备注</th><th>来源</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="mobile-only" style="display:grid;gap:10px">' + cards + '</div>';
  }

  function settlementHtml(d) {
    var st = d.settlement || {};
    function cell(k, v) { return '<div class="cell"><div class="k">' + k + '</div><div class="v num">' + (v != null ? V2.fmt.money(v) : '暂无数据') + '</div></div>'; }
    return '<div class="section-title"><h2>结算信息</h2></div>' +
      '<div class="card card-pad"><div class="info-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
        cell('货款金额', st.goods_amount) + cell('售后金额', st.after_sales_amount) +
        cell('费用合计', st.fee_amount) + cell('清关税费', st.customs_tax) +
        cell('应付结算', st.payable_amount) +
      '</div></div>';
  }

  function anomaliesHtml(d) {
    var list = d.operating_anomalies || [];
    if (!list.length) return '';
    var rows = list.slice(0, 4).map(function (a) {
      return '<div class="alert-row">' + V2.icon('warn') + '<span>' + V2.esc(V2.fmt.date(a.sale_date)) + '：' + V2.esc(a.reason) +
        '（当日 <b>' + V2.fmt.num(a.metric) + '</b> 件，中位 <b>' + V2.fmt.num(a.baseline) + '</b> 件）</span></div>';
    }).join('');
    return '<div class="card card-pad alert-card" style="margin-top:14px"><b>经营提醒</b>' + rows + '</div>';
  }

  function aiHtml() {
    var body;
    if (state.aiLoading) body = '<p class="note">AI 正在分析这张结算单与同品牌其他单…</p>';
    else if (state.ai) body = '<div class="ai-body">' + V2.esc(state.ai.content) + '</div>' +
      '<div class="ai-meta">' + V2.esc(state.ai.model || '') + ' · ' + V2.esc(V2.fmt.dt(state.ai.generated_at)) + (state.ai.cached ? ' · 缓存结果' : '') + '</div>';
    else body = '<p class="note" style="margin-top:6px">让 AI 对比这张单与同品牌其他结算单，生成一段大白话分析。</p>';
    return '<div class="card card-pad ai-card" style="margin-top:14px">' +
      '<div class="flex-between"><b>' + V2.icon('spark') + ' AI 同品牌分析</b>' +
      '<button class="btn btn-ghost" type="button" id="ai-btn" style="min-height:38px;font-size:.84rem"' + (state.aiLoading ? ' disabled' : '') + '>' +
        (state.ai ? '重新生成' : '生成分析') + '</button></div>' + body + '</div>';
  }

  function actionsHtml(d) {
    return '<div class="filter-scroll" style="margin-top:14px;gap:10px">' +
      '<a class="btn btn-ghost" style="min-height:40px;font-size:.84rem" href="/api/exports/settlements/' + encodeURIComponent(merchant) + '/template.xlsx">' + V2.icon('download') + ' 导出 xlsx</a>' +
      '<a class="btn btn-ghost" style="min-height:40px;font-size:.84rem" href="/api/exports/settlements/' + encodeURIComponent(merchant) + '/template.pdf">' + V2.icon('download') + ' 导出 PDF</a>' +
      '<button class="btn btn-ghost" type="button" id="review-btn" style="min-height:40px;font-size:.84rem">' + V2.icon('doc') + ' 查看复核</button>' +
      (d.source_type === 'manual' ? '<a class="btn btn-ghost" style="min-height:40px;font-size:.84rem" href="entry.html?edit=' + encodeURIComponent(merchant) + '">' + V2.icon('pen') + ' 修改手工单</a>' : '') +
      '<button class="btn btn-accent" type="button" id="del-btn" style="min-height:40px;font-size:.84rem">' + V2.icon('trash') + ' 删除这张单</button>' +
      '</div>';
  }

  function reviewModal() {
    V2.api('/api/settlements/' + encodeURIComponent(merchant) + '/review').then(function (draft) {
      var p = (draft && draft.payload) || {};
      var fs = p.file_summary || {};
      var cs = p.computed_summary || {};
      var issues = p.issues || [];
      function row(k, v) { return '<div class="cell"><div class="k">' + V2.esc(k) + '</div><div class="v">' + V2.esc(v == null || v === '' ? '—' : v) + '</div></div>'; }
      var mask = V2.el('div', 'modal-mask');
      var modal = V2.el('div', 'modal modal-lg');
      modal.innerHTML = '<h3>导入复核 · ' + V2.esc(draft.file_name || '') + '</h3>' +
        '<div class="modal-body">' +
          '<div class="info-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
            row('商号', p.merchant_no) + row('单号', p.order_no) + row('市场', p.market) +
            row('到达日期', p.arrival_date) + row('销售行数', (p.sales || []).length + ' 行') +
          '</div>' +
          (Object.keys(fs).length || Object.keys(cs).length ?
            '<div class="divider"></div><b>文件合计 / 系统计算</b><div class="info-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-top:8px">' +
            Object.keys(Object.assign({}, fs, cs)).map(function (k) { return row(k, (cs[k] != null ? cs[k] : '') + (fs[k] != null && fs[k] !== cs[k] ? '（文件 ' + fs[k] + '）' : '')); }).join('') + '</div>' : '') +
          (issues.length ? '<div class="divider"></div><b>问题（' + issues.length + '）</b>' + issues.map(function (i) {
            return '<div class="issue-row">' + V2.icon('warn') + '<span>' + (i.severity === 'error' ? '<b style="color:var(--danger)">错误</b> ' : '<b style="color:var(--accent-strong)">提醒</b> ') + V2.esc(i.message || '') + '</span></div>';
          }).join('') : '<p class="note" style="margin-top:10px">这份文件没有记录问题。</p>') +
        '</div>' +
        '<div class="modal-foot"><button class="btn btn-primary" type="button" data-close>关 闭</button></div>';
      mask.appendChild(modal);
      document.body.appendChild(mask);
      modal.querySelector('[data-close]').addEventListener('click', function () { mask.remove(); });
      mask.addEventListener('click', function (ev) { if (ev.target === mask) mask.remove(); });
    }).catch(function (e) { V2.toast('复核信息加载失败：' + e.message, 'err'); });
  }

  function render() {
    var d = state.detail;
    page.innerHTML =
      '<div class="backbar mobile-only"><a class="back" href="settlements.html" aria-label="返回每一单">' + V2.icon('back') + '</a>' +
      '<h1>' + V2.esc(d.order_no_normalized || d.order_no || '') + ' · 商号 ' + V2.esc(d.merchant_no_normalized || d.merchant_no) + '</h1></div>' +
      heroHtml(d) + actionsHtml(d) + infoHtml(d) + gradePanelsHtml(d) + anomaliesHtml(d) +
      specTableHtml(d) + trendHtml(d) + settlementHtml(d) + aiHtml() + recordsHtml(d);

    document.getElementById('ai-btn').addEventListener('click', function () { generateAi(state.ai != null); });
    document.getElementById('review-btn').addEventListener('click', reviewModal);
    document.getElementById('del-btn').addEventListener('click', function () {
      V2.confirmModal({
        title: '删除结算单',
        danger: true,
        okText: '确认删除',
        body: '商号 <b>' + V2.esc(d.merchant_no_normalized || d.merchant_no) + '</b>（' + V2.esc(d.order_no_normalized || d.order_no || '') + '）的整张结算单将被删除，销售明细一并移除，<b>不可恢复</b>。确定继续吗？'
      }).then(function (ok) {
        if (!ok) return;
        V2.api('/api/settlements/' + encodeURIComponent(merchant), { method: 'DELETE' }).then(function () {
          V2.toast('已删除', 'ok');
          location.href = 'settlements.html';
        }).catch(function (e) { V2.toast('删除失败：' + e.message, 'err'); });
      });
    });
  }

  function generateAi(refresh) {
    state.aiLoading = true;
    render();
    V2.api('/api/analytics/settlements/' + encodeURIComponent(merchant) + '/analysis', {
      method: 'POST',
      body: { start_date: null, end_date: null, refresh: refresh === true }
    }).then(function (res) {
      state.ai = res;
    }).catch(function (e) {
      V2.toast('AI 分析失败：' + e.message, 'err');
    }).finally(function () {
      state.aiLoading = false;
      render();
    });
  }

  function load() {
    page.innerHTML = V2.skeletonCards(4);
    V2.api('/api/analytics/settlements/' + encodeURIComponent(merchant)).then(function (d) {
      state.detail = d;
      render();
    }).catch(function (e) {
      page.innerHTML = '';
      page.appendChild(V2.errorBanner(e.message, load));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    merchant = V2.qs().get('merchant') || '';
    if (!merchant) {
      page.innerHTML = '<div class="empty-box">缺少 merchant 参数，请从 <a class="link" href="settlements.html">每一单</a> 进入。</div>';
      return;
    }
    V2.bootShell('settlement-detail').then(load);
  });
})();
