/* 结算单详情 demo：16 张真实详情快照可切换，图表与规格表由明细行前端聚合（与真实页同规则）。 */
(function () {
  'use strict';
  var C = window.CORE;
  var D = null;
  var current = null;
  var chart = null;

  function merchantNos() {
    return Object.keys(D.details);
  }

  function labelOf(mno) {
    var it = findListItem(mno);
    var d = D.details[mno] || {};
    var order = d.order_no_normalized || d.order_no || (it && it.order_no_normalized) || mno;
    return order + '（商号 ' + (d.merchant_no_normalized || mno) + '）';
  }

  function findListItem(mno) {
    var hit = null;
    D.settlementsList.settlements.some(function (it) {
      if (it.merchant_no === mno) { hit = it; return true; }
      return false;
    });
    return hit;
  }

  function renderFacts(d) {
    var cells = [
      ['商号', d.merchant_no_normalized || d.merchant_no],
      ['市场', d.market || '–'],
      ['单号', d.order_no_normalized || d.order_no || '–'],
      ['国家', d.country || '–'],
      ['到达市场日期', d.arrival_date || '–'],
      ['销售日期', d.sales_period ? d.sales_period.start_date + ' 至 ' + d.sales_period.end_date : '–'],
      ['柜号', d.container_no || '–'],
      ['转运车号', d.vehicle_no || '–'],
    ];
    document.getElementById('fact-grid').innerHTML = cells.map(function (c) {
      return '<div class="fact-cell"><div class="fact-label">' + C.esc(c[0]) + '</div><div class="fact-value">' + C.esc(c[1]) + '</div></div>';
    }).join('');
  }

  function renderMetrics(d) {
    var t = d.total || {};
    var s = d.settlement || {};
    var after = s.after_sales_amount;
    var goods = s.goods_amount;
    var ratio = after != null && goods ? after / goods : null;
    var fee = (s.fee_amount || 0) + (s.customs_tax || 0);
    var items = [
      ['来货数量（件）', d.arrival_quantity == null ? '–' : C.fmtInt(d.arrival_quantity), ''],
      ['销量', C.fmtInt(t.sales_quantity), '件'],
      ['销售金额', C.fmtMoney(t.sales_amount), ''],
      ['售后金额 / 售后比', (after == null ? '–' : C.fmtMoney(Math.abs(after))) + (ratio == null ? '' : ' / ' + (ratio * 100).toFixed(1) + '%'), ''],
      ['市场费用', fee ? C.fmtMoney(fee) : '–', s.customs_tax ? '（含清关 ' + C.fmtMoney(s.customs_tax) + '）' : ''],
      ['应付贵方金额', s.payable_amount == null ? '–' : C.fmtMoney(s.payable_amount), ''],
    ];
    document.getElementById('metric-strip').innerHTML = items.map(function (m) {
      return '<div class="metric-item"><div class="metric-label">' + m[0] + '</div>' +
        '<div class="metric-value">' + m[1] + (m[2] ? ' <small>' + m[2] + '</small>' : '') + '</div></div>';
    }).join('');
    var order = d.order_no_normalized || d.order_no || '';
    document.getElementById('perf-title').textContent = (order ? order.slice(0, 2) + ' ' : '') + '销售表现';
  }

  function byDay(records) {
    var map = {};
    records.forEach(function (r) {
      var k = r.sale_date;
      if (!map[k]) map[k] = { date: k, qty: 0, amount: 0 };
      map[k].qty += r.quantity;
      map[k].amount += r.amount;
    });
    return Object.values(map).sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .map(function (r) { return { date: r.date, qty: r.qty, avg: r.qty ? r.amount / r.qty : 0 }; });
  }

  function renderChart(d) {
    var days = byDay(d.records || []);
    document.getElementById('price-chart-title').textContent =
      (d.order_no_normalized || d.order_no || d.merchant_no) + ' 按日均价走势' + (days.length === 1 ? '（本单集中在 1 天）' : '');
    chart.setOption({
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      tooltip: Object.assign(C.tooltipBase(), {
        formatter: function (params) {
          var row = days[params[0].dataIndex];
          return '<strong>2026-' + C.md(row.date) + '</strong><br/>' +
            '<span style="color:#2F8F6B">●</span> 件数 ' + C.fmtInt(row.qty) + ' 件<br/>' +
            '<span style="color:#14532D">●</span> 每件均价 ¥' + row.avg.toFixed(2);
        },
      }),
      xAxis: {
        type: 'category', data: days.map(function (r) { return r.date; }),
        axisLine: { lineStyle: { color: '#D8E2DC' } }, axisTick: { show: false },
        axisLabel: { color: '#9CA3AF', fontSize: 11, hideOverlap: true, formatter: function (v) { return C.md(v); } },
      },
      yAxis: [
        { type: 'value', name: '件数', splitLine: { lineStyle: { color: '#EDF2EE' } }, axisLabel: { color: '#9CA3AF', fontSize: 11 }, nameTextStyle: { color: '#9CA3AF', fontSize: 11 } },
        { type: 'value', name: '元/件', splitLine: { show: false }, axisLabel: { color: '#9CA3AF', fontSize: 11 }, nameTextStyle: { color: '#9CA3AF', fontSize: 11 }, scale: true },
      ],
      series: [
        {
          type: 'bar', name: '件数', barWidth: '38%',
          data: days.map(function (r) { return r.qty; }),
          itemStyle: { color: 'rgba(47,143,107,.55)', borderRadius: [5, 5, 0, 0] },
        },
        {
          type: 'line', name: '每件均价', yAxisIndex: 1,
          data: days.map(function (r) { return Number(r.avg.toFixed(2)); }),
          lineStyle: { color: '#14532D', width: 2 },
          itemStyle: { color: '#14532D', borderColor: '#fff', borderWidth: 1.5 },
          symbol: 'circle', symbolSize: 6,
          label: days.length <= 8 ? { show: true, position: 'top', distance: 8, color: '#14532D', fontSize: 10.5, fontWeight: 600, formatter: function (p) { return '¥' + p.value; } } : { show: false },
        },
      ],
    }, { notMerge: true });
  }

  function renderSpecTable(d) {
    var groups = {};
    (d.records || []).forEach(function (r) {
      var brand = r.brand || '未识别品牌';
      var grade = r.grade || 'OTHER';
      var key = [brand, grade, r.piece_count || '?', r.spec_kg || '?', r.remark || ''].join('|');
      if (!groups[key]) groups[key] = { brand: brand, grade: grade, head: r.piece_count || '?', kg: r.spec_kg || '?', remark: r.remark || '', qty: 0, amount: 0 };
      groups[key].qty += r.quantity;
      groups[key].amount += r.amount;
    });
    var rows = Object.values(groups).sort(function (a, b) { return b.qty - a.qty; });
    var totalQty = rows.reduce(function (a, r) { return a + r.qty; }, 0) || 1;
    document.getElementById('spec-title').textContent =
      (d.order_no_normalized || d.order_no || d.merchant_no) + ' 规格件数与均价';
    var brandOrder = [];
    rows.forEach(function (r) { if (brandOrder.indexOf(r.brand) < 0) brandOrder.push(r.brand); });
    var gradeOrder = [];
    rows.forEach(function (r) { if (gradeOrder.indexOf(r.grade) < 0) gradeOrder.push(r.grade); });

    var html = '';
    brandOrder.forEach(function (b) {
      var brandRows = rows.filter(function (r) { return r.brand === b; });
      gradeOrder.forEach(function (g) {
        var sub = brandRows.filter(function (r) { return r.grade === g; });
        if (!sub.length) return;
        var meta = C.gradeMeta(g);
        var subQty = sub.reduce(function (a, r) { return a + r.qty; }, 0);
        var subAmount = sub.reduce(function (a, r) { return a + r.amount; }, 0);
        sub.forEach(function (r) {
          html += '<tr>' +
            '<td>' + C.esc(r.brand) + '</td>' +
            '<td><span class="gdot" style="background:' + meta.color + '"></span>' + C.esc(meta.name) + '</td>' +
            '<td>' + C.esc(r.head) + '</td>' +
            '<td>' + C.esc(r.kg) + '</td>' +
            '<td>' + (r.remark ? C.esc(r.remark) : '<span class="muted">–</span>') + '</td>' +
            '<td><div class="share"><div class="share-bar"><i style="width:' + (r.qty / totalQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></div>' +
            '<span class="share-num">' + C.fmtInt(r.qty) + ' · ' + C.fmtPct(r.qty / totalQty) + '</span></div></td>' +
            '<td class="num">¥' + (r.qty ? (r.amount / r.qty).toFixed(2) : '0.00') + '</td></tr>';
        });
        html += '<tr class="spec-extra-summary">' +
          '<td colspan="5">小计 · ' + C.esc(b) + ' ' + meta.name + '</td>' +
          '<td><div class="share"><span class="share-num" style="text-align:left;">' + C.fmtInt(subQty) + ' · ' + C.fmtPct(subQty / totalQty) + '</span></div></td>' +
          '<td class="num">¥' + (subQty ? (subAmount / subQty).toFixed(2) : '0.00') + '</td></tr>';
      });
    });
    document.getElementById('spec-body').innerHTML = html;
    var t = d.total || {};
    document.getElementById('spec-foot').innerHTML =
      '<tr class="mb-foot"><td colspan="5">合计 · 全部品牌等级（加权均价）</td>' +
      '<td><div class="share"><span class="share-num" style="text-align:left;">' + C.fmtInt(t.sales_quantity) + '</span></div></td>' +
      '<td class="num">' + (t.weighted_avg_price == null ? '–' : '¥' + t.weighted_avg_price.toFixed(2)) + '</td></tr>';
  }

  function render(mno) {
    var d = D.details[mno];
    if (!d) return;
    current = mno;
    renderFacts(d);
    renderMetrics(d);
    renderChart(d);
    renderSpecTable(d);
    history.replaceState(null, '', '?m=' + encodeURIComponent(mno));
  }

  function init() {
    C.renderShell('detail', '结算单详情', '单张结算单的经营明细（真实接口数据，可切换全部结算单）',
      '<label class="chip select-chip"><span class="chip-label">结算单</span>' +
      '<select id="f-detail" class="detail-select" aria-label="选择结算单"></select></label>' +
      '<button type="button" class="btn-ghost" id="f-back-list">← 返回列表</button>');

    if (!C.data()) { C.showMissingData(); return; }
    D = C.data();

    chart = C.makeChart('price-chart');
    var sel = document.getElementById('f-detail');
    var q = new URLSearchParams(location.search);
    var pre = q.get('m');
    merchantNos().forEach(function (mno) {
      var opt = document.createElement('option');
      opt.value = mno;
      opt.textContent = labelOf(mno);
      sel.appendChild(opt);
    });
    if (!pre || !D.details[pre]) pre = merchantNos()[0];
    sel.value = pre;
    sel.addEventListener('change', function () { render(sel.value); });
    document.getElementById('f-back-list').addEventListener('click', function () {
      location.href = 'list.html';
    });
    render(pre);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
