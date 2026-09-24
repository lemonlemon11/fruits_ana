/* 卖得怎么样：筛选 + KPI + 趋势 + 等级结构 + 异常提醒 + 结算单销售情况（全部真实接口数据） */
(function () {
  var page = document.getElementById('page');
  var state = { start: '', end: '', merchant: '', metric: 'sales_amount', data: null, settlements: [] };

  function query() {
    var p = new URLSearchParams();
    if (state.start) p.set('start_date', state.start);
    if (state.end) p.set('end_date', state.end);
    if (state.merchant) p.set('merchant_no', state.merchant);
    var s = p.toString();
    return s ? '?' + s : '';
  }

  function renderShell() {
    page.innerHTML =
      '<form class="filter-bar" id="flt" style="display:grid;grid-template-columns:repeat(2,minmax(150px,1fr)) minmax(150px,1fr) auto;gap:10px;margin-bottom:14px">' +
        '<div class="field"><label>销售日期起</label><input type="date" id="f-start" value="' + V2.esc(state.start) + '" /></div>' +
        '<div class="field"><label>销售日期止</label><input type="date" id="f-end" value="' + V2.esc(state.end) + '" /></div>' +
        '<div class="field"><label>商号</label><select id="f-merchant"><option value="">全部结算单</option></select></div>' +
        '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" type="submit" style="min-height:50px">查看结果</button></div>' +
      '</form>' +
      '<div id="ov-body">' + V2.skeletonCards(4) + '</div>';
    document.getElementById('flt').addEventListener('submit', function (ev) {
      ev.preventDefault();
      state.start = document.getElementById('f-start').value;
      state.end = document.getElementById('f-end').value;
      state.merchant = document.getElementById('f-merchant').value;
      if (state.start && state.end && state.start > state.end) {
        V2.toast('销售日期起不能晚于销售日期止', 'err');
        return;
      }
      V2.setQuery({ start: state.start, end: state.end, merchant: state.merchant });
      load();
    });
  }

  function load() {
    var body = document.getElementById('ov-body');
    body.innerHTML = V2.skeletonCards(4);
    Promise.all([
      V2.api('/api/analytics/overview' + query()),
      V2.api('/api/settlements' + query())
    ]).then(function (rs) {
      state.data = rs[0];
      state.settlements = (rs[1] && rs[1].settlements) || [];
      fillMerchantOptions();
      render();
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(V2.errorBanner(e.message, load));
    });
  }

  function fillMerchantOptions() {
    var sel = document.getElementById('f-merchant');
    var cur = state.merchant;
    var html = '<option value="">全部结算单</option>';
    state.settlements.forEach(function (s) {
      html += '<option value="' + V2.esc(s.merchant_no) + '"' + (s.merchant_no === cur ? ' selected' : '') + '>' +
        V2.esc(s.merchant_no_normalized || s.merchant_no) + ' · ' + V2.esc(s.order_no_normalized || s.order_no || '') + '</option>';
    });
    sel.innerHTML = html;
  }

  function kpiHtml(d) {
    var t = d.total || {};
    var n = state.settlements.length;
    var range = rangeText();
    return '<div class="kpi-grid">' +
      '<div class="kpi kpi-hero"><div class="kpi-label">销售金额</div>' +
        '<div class="kpi-value">' + wan(t.sales_amount) + '<small> 万元</small></div>' +
        '<div class="kpi-sub">共 ' + V2.fmt.money(t.sales_amount) + (range ? ' · ' + V2.esc(range) : '') + '</div></div>' +
      '<div class="kpi"><div class="kpi-label">销量</div>' +
        '<div class="kpi-value">' + V2.fmt.num(t.sales_quantity) + '<small> 件</small></div>' +
        '<div class="kpi-sub">' + n + ' 张结算单</div></div>' +
      '<div class="kpi" style="--kpi-color:#d9812a"><div class="kpi-label">每件均价</div>' +
        '<div class="kpi-value">' + V2.fmt.price(t.weighted_avg_price) + '<small> 元/件</small></div>' +
        '<div class="kpi-sub">按件数加权</div></div>' +
      '<div class="kpi" style="--kpi-color:#2c5f9e"><div class="kpi-label">结算单</div>' +
        '<div class="kpi-value">' + n + '<small> 张</small></div>' +
        '<div class="kpi-sub">' + (state.merchant ? '当前商号筛选中' : '全部商号') + '</div></div>' +
      '</div>';
  }

  function wan(v) {
    if (v == null) return '—';
    return (Number(v) / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  function rangeText() {
    var tr = (state.data && state.data.trend) || [];
    if (tr.length) return V2.fmt.date(tr[0].sale_date) + ' ~ ' + V2.fmt.date(tr[tr.length - 1].sale_date);
    return '';
  }

  function trendHtml(d) {
    var tr = d.trend || [];
    var points = tr.map(function (p) { return { label: p.sale_date, value: p[state.metric] }; });
    var best = null;
    tr.forEach(function (p) { if (!best || Number(p[state.metric]) > Number(best[state.metric])) best = p; });
    return '<div class="card card-pad trend-card">' +
      '<div class="section-title" style="margin-top:0"><h2>' + (state.metric === 'sales_amount' ? '每天卖了多少钱' : '每天卖了多少件') + '</h2>' +
      '<div class="chip-row"><button class="chip' + (state.metric === 'sales_amount' ? ' is-on' : '') + '" data-m="sales_amount" type="button" style="min-height:32px;font-size:.8rem">金额</button>' +
      '<button class="chip' + (state.metric === 'sales_quantity' ? ' is-on' : '') + '" data-m="sales_quantity" type="button" style="min-height:32px;font-size:.8rem">件数</button></div></div>' +
      V2.lineChart(points, { axis: state.metric === 'sales_amount' ? function (v) { return wan(v) + '万'; } : null }) +
      (best ? '<p class="note" style="margin-top:8px">' + V2.fmt.date(best.sale_date) + ' 最高：' +
        (state.metric === 'sales_amount' ? V2.fmt.money(best.sales_amount) : V2.fmt.num(best.sales_quantity) + ' 件') + '。</p>' : '') +
      '</div>';
  }

  function gradesHtml(d) {
    return '<div class="card card-pad"><div class="section-title" style="margin-top:0"><h2>等级结构</h2><span class="more">按件数占比</span></div>' +
      V2.donut(d.grades) + '</div>';
  }

  function anomaliesHtml(d) {
    var list = d.operating_anomalies || [];
    if (!list.length) return '';
    var rows = list.slice(0, 5).map(function (a) {
      return '<div class="alert-row">' + V2.icon('warn') + '<span>' + V2.esc(V2.fmt.date(a.sale_date)) + '：' + V2.esc(a.reason) +
        '（当日 <b>' + V2.fmt.num(a.metric) + '</b> 件，中位 <b>' + V2.fmt.num(a.baseline) + '</b> 件）</span></div>';
    }).join('');
    return '<div class="card card-pad alert-card" style="margin-top:14px"><b>经营提醒</b>' + rows + '</div>';
  }

  function settlementsHtml() {
    var rows = state.settlements;
    if (!rows.length) return '<div class="empty-box">当前范围没有结算单</div>';
    var table = '<div class="card table-card desktop-only"><table class="data-table"><thead><tr>' +
      '<th>单号</th><th>商号</th><th>品牌</th><th>销售日期</th><th class="num">销售金额</th><th class="num">销量(件)</th><th class="num">每件均价</th><th style="width:170px">等级结构</th><th></th>' +
      '</tr></thead><tbody>' + rows.map(function (s) {
        return '<tr><td><b>' + V2.esc(s.order_no_normalized || s.order_no || '—') + '</b></td>' +
          '<td>' + V2.esc(s.merchant_no_normalized || s.merchant_no) + '</td>' +
          '<td>' + V2.esc(s.series || '—') + '</td>' +
          '<td>' + V2.esc(V2.fmt.date(s.sale_date_start)) + (s.sale_date_end && s.sale_date_end !== s.sale_date_start ? ' ~ ' + V2.esc(V2.fmt.dateShort(s.sale_date_end)) : '') + '</td>' +
          '<td class="num"><b>' + V2.fmt.money(s.sales_amount) + '</b></td>' +
          '<td class="num">' + V2.fmt.num(s.total_quantity) + '</td>' +
          '<td class="num">' + V2.fmt.price(s.average_price) + '</td>' +
          '<td>' + gradeQtyBar(s) + '</td>' +
          '<td><a class="link" href="' + V2.detailUrl(s.merchant_no) + '">详情 ›</a></td></tr>';
      }).join('') + '</tbody></table></div>';
    var cards = '<div class="mobile-only">' + rows.map(function (s) {
      return '<a class="bill-card" href="' + V2.detailUrl(s.merchant_no) + '">' +
        '<div class="bill-head"><span class="bill-no">' + V2.esc(s.order_no_normalized || s.order_no || '—') + '<small>商号 ' + V2.esc(s.merchant_no_normalized || s.merchant_no) + '</small></span>' +
        '<span class="bill-date">' + V2.esc(V2.fmt.dateShort(s.sale_date_start)) + ' 销售</span></div>' +
        '<div class="bill-money"><small>¥</small>' + V2.fmt.num(s.sales_amount) + '</div>' +
        '<div class="bill-meta"><span><b>' + V2.fmt.num(s.total_quantity) + '</b> 件</span><span>均价 <b>' + V2.fmt.price(s.average_price) + '</b></span></div>' +
        gradeQtyBar(s) + gradeQtyText(s) + '</a>';
    }).join('') + '</div>';
    return '<div class="section-title"><h2>结算单销售情况</h2><a class="more" href="settlements.html">查看全部 ›</a></div>' + table + cards;
  }

  function gradeQtyBar(s) {
    var gq = s.grade_quantities || {};
    var grades = Object.keys(gq).filter(function (g) { return Number(gq[g]) > 0; })
      .map(function (g) { return { grade: g, sales_quantity: gq[g] }; });
    return '<div style="margin-top:0">' + V2.gradeBar(grades, s.total_quantity) + '</div>';
  }
  function gradeQtyText(s) {
    var gq = s.grade_quantities || {};
    var parts = Object.keys(gq).filter(function (g) { return Number(gq[g]) > 0; })
      .map(function (g) { return V2.gradeMeta(g).label.replace(' 果', '') + ' ' + V2.fmt.num(gq[g]) + ' 件'; });
    return '<div class="bill-grades">' + parts.map(function (p) { return '<span>' + V2.esc(p) + '</span>'; }).join('') + '</div>';
  }

  function render() {
    var body = document.getElementById('ov-body');
    var d = state.data;
    body.innerHTML = kpiHtml(d) +
      '<div class="grid-2" style="margin-top:16px">' + trendHtml(d) + gradesHtml(d) + '</div>' +
      anomaliesHtml(d) + settlementsHtml();
    body.querySelectorAll('[data-m]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.metric = btn.dataset.m;
        render();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    V2.bootShell('overview').then(function () {
      var q = V2.qs();
      state.start = q.get('start') || '';
      state.end = q.get('end') || '';
      state.merchant = q.get('merchant') || '';
      renderShell();
      load();
    });
  });
})();
