/* 每一单：筛选（日期 / 商号 / 关键词）+ 汇总 + 分页表格与卡片 + xlsx 导出。 */
(function () {
  var page = document.getElementById('page');
  var PAGE_SIZE = 10;
  var state = { start: '', end: '', merchant: '', keyword: '', page: 1, data: null, summary: null, merchants: [] };

  function query(extra) {
    var p = new URLSearchParams();
    if (state.start) p.set('start_date', state.start);
    if (state.end) p.set('end_date', state.end);
    if (state.merchant) p.set('merchant_no', state.merchant);
    if (state.keyword) p.set('keyword', state.keyword);
    if (extra) Object.keys(extra).forEach(function (k) { p.set(k, extra[k]); });
    var s = p.toString();
    return s ? '?' + s : '';
  }

  function renderShell() {
    page.innerHTML =
      '<form class="filter-bar" id="flt" style="display:grid;grid-template-columns:repeat(2,minmax(140px,1fr)) minmax(140px,1fr) minmax(150px,1.4fr) auto;gap:10px;margin-bottom:14px">' +
        '<div class="field"><label>销售日期起</label><input type="date" id="f-start" value="' + V2.esc(state.start) + '" /></div>' +
        '<div class="field"><label>销售日期止</label><input type="date" id="f-end" value="' + V2.esc(state.end) + '" /></div>' +
        '<div class="field"><label>商号</label><select id="f-merchant"><option value="">全部商号</option></select></div>' +
        '<div class="field"><label>搜索</label><input type="search" id="f-keyword" placeholder="商号 / 单号 / 柜号 / 车牌" value="' + V2.esc(state.keyword) + '" /></div>' +
        '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" type="submit" style="min-height:50px">查看结果</button></div>' +
      '</form>' +
      '<div id="list-body">' + V2.skeletonCards(3) + '</div>';
    document.getElementById('flt').addEventListener('submit', function (ev) {
      ev.preventDefault();
      state.start = document.getElementById('f-start').value;
      state.end = document.getElementById('f-end').value;
      state.merchant = document.getElementById('f-merchant').value;
      state.keyword = document.getElementById('f-keyword').value.trim();
      state.page = 1;
      if (state.start && state.end && state.start > state.end) { V2.toast('销售日期起不能晚于销售日期止', 'err'); return; }
      V2.setQuery({ start: state.start, end: state.end, merchant: state.merchant, keyword: state.keyword });
      load();
    });
  }

  function loadMerchants() {
    return V2.api('/api/settlements?page=1&page_size=100').then(function (d) {
      state.merchants = (d && d.settlements) || [];
      var sel = document.getElementById('f-merchant');
      var html = '<option value="">全部商号</option>';
      state.merchants.forEach(function (s) {
        html += '<option value="' + V2.esc(s.merchant_no) + '"' + (s.merchant_no === state.merchant ? ' selected' : '') + '>' +
          V2.esc(s.merchant_no_normalized || s.merchant_no) + ' · ' + V2.esc(s.order_no_normalized || s.order_no || '') + '</option>';
      });
      sel.innerHTML = html;
    });
  }

  function load() {
    var body = document.getElementById('list-body');
    body.innerHTML = V2.skeletonCards(3);
    Promise.all([
      V2.api('/api/settlements' + query({ page: state.page, page_size: PAGE_SIZE })),
      V2.api('/api/analytics/overview' + query())
    ]).then(function (rs) {
      state.data = rs[0];
      state.summary = rs[1];
      render();
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(V2.errorBanner(e.message, load));
    });
  }

  function summaryHtml() {
    var t = (state.summary && state.summary.total) || {};
    var pg = state.data.pagination || { total: state.data.settlements.length };
    return '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-top:6px">' +
      '<div class="kpi" style="padding:12px 14px"><div class="kpi-label">' + pg.total + ' 张单 · 销售额</div>' +
        '<div class="kpi-value" style="font-size:1.2rem;margin-top:5px">' + V2.fmt.money(t.sales_amount) + '</div></div>' +
      '<div class="kpi" style="padding:12px 14px;--kpi-color:#d9812a"><div class="kpi-label">总销量</div>' +
        '<div class="kpi-value" style="font-size:1.2rem;margin-top:5px">' + V2.fmt.num(t.sales_quantity) + ' 件</div></div>' +
      '<div class="kpi" style="padding:12px 14px;--kpi-color:#2c5f9e"><div class="kpi-label">平均每件</div>' +
        '<div class="kpi-value" style="font-size:1.2rem;margin-top:5px">' + V2.fmt.price(t.weighted_avg_price) + ' 元</div></div>' +
      '</div>';
  }

  function gradeQtyBar(s) {
    var gq = s.grade_quantities || {};
    var grades = Object.keys(gq).filter(function (g) { return Number(gq[g]) > 0; })
      .map(function (g) { return { grade: g, sales_quantity: gq[g] }; });
    return V2.gradeBar(grades, s.total_quantity);
  }
  function gradeQtyText(s) {
    var gq = s.grade_quantities || {};
    return Object.keys(gq).filter(function (g) { return Number(gq[g]) > 0; })
      .map(function (g) { return '<span>' + V2.esc(V2.gradeMeta(g).label.replace(' 果', '')) + ' ' + V2.fmt.num(gq[g]) + ' 件</span>'; }).join('');
  }

  function listHtml() {
    var rows = state.data.settlements || [];
    if (!rows.length) return '<div class="empty-box">没有符合条件的结算单，换个筛选试试</div>';
    var table = '<div class="card table-card desktop-only" style="margin-top:14px"><table class="data-table"><thead><tr>' +
      '<th>单号</th><th>商号</th><th>品牌</th><th>果品</th><th>到达日期</th><th>销售日期</th>' +
      '<th class="num">销售金额</th><th class="num">销量(件)</th><th class="num">每件均价</th><th style="width:160px">等级结构</th><th class="num">明细</th><th></th>' +
      '</tr></thead><tbody>' + rows.map(function (s) {
        return '<tr><td><b>' + V2.esc(s.order_no_normalized || s.order_no || '—') + '</b></td>' +
          '<td>' + V2.esc(s.merchant_no_normalized || s.merchant_no) + '</td>' +
          '<td>' + V2.esc(s.series || '—') + '</td>' +
          '<td>' + V2.esc(s.fruit_type || '—') + '</td>' +
          '<td>' + V2.esc(V2.fmt.date(s.arrival_date)) + '</td>' +
          '<td>' + V2.esc(V2.fmt.date(s.sale_date_start)) + (s.sale_date_end && s.sale_date_end !== s.sale_date_start ? ' ~ ' + V2.esc(V2.fmt.dateShort(s.sale_date_end)) : '') + '</td>' +
          '<td class="num"><b>' + V2.fmt.money(s.sales_amount) + '</b></td>' +
          '<td class="num">' + V2.fmt.num(s.total_quantity) + '</td>' +
          '<td class="num">' + V2.fmt.price(s.average_price) + '</td>' +
          '<td>' + gradeQtyBar(s) + '</td>' +
          '<td class="num">' + V2.fmt.num(s.record_count) + ' 行</td>' +
          '<td><a class="link" href="' + V2.detailUrl(s.merchant_no) + '">详情 ›</a></td></tr>';
      }).join('') + '</tbody></table></div>';
    var cards = '<div class="mobile-only" style="margin-top:12px">' + rows.map(function (s) {
      return '<a class="bill-card" href="' + V2.detailUrl(s.merchant_no) + '">' +
        '<div class="bill-head"><span class="bill-no">' + V2.esc(s.order_no_normalized || s.order_no || '—') + '<small>商号 ' + V2.esc(s.merchant_no_normalized || s.merchant_no) + '</small></span>' +
        '<span class="bill-date">' + V2.esc(V2.fmt.dateShort(s.sale_date_start)) + ' 销售</span></div>' +
        '<div class="bill-money"><small>¥</small>' + V2.fmt.num(s.sales_amount) + '</div>' +
        '<div class="bill-meta"><span><b>' + V2.fmt.num(s.total_quantity) + '</b> 件</span><span>均价 <b>' + V2.fmt.price(s.average_price) + '</b></span><span>' + V2.esc(s.series || '') + '</span></div>' +
        gradeQtyBar(s) + '<div class="bill-grades">' + gradeQtyText(s) + '</div></a>';
    }).join('') + '</div>';
    return table + cards;
  }

  function pagerHtml() {
    var pg = state.data.pagination;
    if (!pg || pg.pages <= 1) return '';
    var html = '<div class="pager"><span>共 ' + pg.total + ' 张 · 第 ' + pg.page + ' / ' + pg.pages + ' 页</span>';
    html += '<button type="button" data-pg="' + (pg.page - 1) + '"' + (pg.page <= 1 ? ' disabled' : '') + '>上一页</button>';
    var from = Math.max(1, Math.min(pg.page - 2, pg.pages - 4));
    var to = Math.min(pg.pages, from + 4);
    for (var i = from; i <= to; i++) {
      html += '<button type="button" data-pg="' + i + '" class="' + (i === pg.page ? 'on' : '') + '">' + i + '</button>';
    }
    html += '<button type="button" data-pg="' + (pg.page + 1) + '"' + (pg.page >= pg.pages ? ' disabled' : '') + '>下一页</button></div>';
    return html;
  }

  function render() {
    var body = document.getElementById('list-body');
    var dr = state.data.date_range;
    var exportUrl = '/api/exports/settlements.xlsx' + query();
    body.innerHTML =
      '<div class="flex-between">' +
        '<p class="note" style="margin:0">' + (dr ? '统计区间 ' + V2.esc(dr.start_date) + ' ~ ' + V2.esc(dr.end_date) + (dr.is_default ? '（默认近 30 天）' : '') : '') + '</p>' +
        '<a class="btn btn-ghost" href="' + exportUrl + '" style="min-height:38px;font-size:.84rem">' + V2.icon('download') + ' 导出 xlsx</a>' +
      '</div>' +
      summaryHtml() + listHtml() + pagerHtml();
    body.querySelectorAll('[data-pg]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        state.page = Number(btn.dataset.pg);
        load();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    V2.bootShell('settlements').then(function () {
      var q = V2.qs();
      state.start = q.get('start') || '';
      state.end = q.get('end') || '';
      state.merchant = q.get('merchant') || '';
      state.keyword = q.get('keyword') || '';
      renderShell();
      loadMerchants().finally(load);
    });
  });
})();
