/* 销售总览（档口数据）demo 逻辑：真实接口快照数据版。
 * 结构对应老板思维模型：年（总柜数·金额/数量）→ 月（月柜数）→ 日（日柜数）三级同屏瀑布；
 * 档口筛选通过切换 byMarket 数据集实现（脚本已按档口预取），页面不发请求。 */
(function () {
  'use strict';

  var C = window.CORE;
  var D = null;
  var state = {
    market: 'all',
    monthlyMode: 'containers',
    dailyMode: 'amount',
    mbMode: 'containers',
    specBrand: 'all',
    specGrade: 'all',
    specOpen: {},
  };
  var charts = {};

  var MONTHLY_MODES = [
    { key: 'containers', name: '按柜数', unit: '月柜数 · 当月到达结算单数', color: '#2F8F6B' },
    { key: 'amount', name: '按金额', unit: '销售金额 · 单位：万元', color: '#175E43' },
    { key: 'qty', name: '按件数', unit: '销售件数 · 单位：件', color: '#D9820B' },
  ];
  var DAILY_MODES = [
    { key: 'amount', name: '销售金额', unit: '销售金额（单位：万元）', color: '#1E7A55' },
    { key: 'qty', name: '件数', unit: '销售件数（单位：件）', color: '#D9820B' },
    { key: 'cnt', name: '日柜数', unit: '日柜数 · 当日在售结算单数（单位：柜）', color: '#4C9A80' },
  ];
  var MB_MODES = [
    { key: 'containers', name: '按柜数' },
    { key: 'amount', name: '按金额' },
    { key: 'qty', name: '按件数' },
  ];
  var GRADE_ORDER = ['A', 'B', 'C', 'AB', 'OTHER'];

  /* ---------- 数据集 ---------- */
  function marketSet() {
    var key = state.market;
    var ds = D.byMarket[key];
    /* 该档口下的结算单行：用 merchant_no 关联全量列表，补 arrival_date / brand / 金额 */
    var ids = {};
    ds.overview.settlements.forEach(function (s) { ids[s.merchant_no] = true; });
    var rows = D.settlementsList.settlements.filter(function (it) { return !!ids[it.merchant_no]; });
    return { ds: ds, rows: rows };
  }

  function brandOf(merchantNo) {
    var hit = null;
    D.settlementsList.settlements.some(function (it) {
      if (it.merchant_no === merchantNo) { hit = it.brand || '未识别品牌'; return true; }
      return false;
    });
    return hit || '未识别品牌';
  }

  /* ---------- KPI 大数带（年层） ---------- */
  function renderKpis(ds) {
    var total = ds.overview.total;
    var grid = document.getElementById('kpi-grid');
    var defs = [
      { label: '总柜数', value: C.fmtInt(total.container_count || ds.overview.settlements.length), unit: '柜', tone: 'purple',
        icon: '<path d="M3 8h13v9H3zM16 11h3l2 3v3h-5z"/><circle cx="7" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/>' },
      { label: '销售金额', value: C.fmtMoney(total.sales_amount), unit: '', tone: 'green',
        icon: '<path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/>' },
      { label: '总件数', value: C.fmtInt(total.sales_quantity), unit: '件', tone: 'amber',
        icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>' },
      { label: '每件均价', value: '¥' + (total.weighted_avg_price == null ? '–' : total.weighted_avg_price.toFixed(2)), unit: '/件', tone: 'blue',
        icon: '<path d="M20.6 13.4L11 3.8A2 2 0 0 0 9.6 3H5a2 2 0 0 0-2 2v4.6c0 .5.2 1 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.6z"/><circle cx="7.5" cy="7.5" r="1.2"/>' },
    ];
    var spark = [34, 52, 44, 66, 58, 82, 74];
    grid.innerHTML = defs.map(function (d) {
      return '<div class="kpi-card">' +
        '<div class="kpi-icon tone-' + d.tone + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + d.icon + '</svg></div>' +
        '<div class="kpi-info"><span class="kpi-label">' + d.label + '</span>' +
        '<div class="kpi-value">' + d.value + (d.unit ? ' <small>' + d.unit + '</small>' : '') + '</div>' +
        '<div class="kpi-delta"><span class="delta-note">口径与系统一致</span></div></div>' +
        '<div class="kpi-spark" aria-hidden="true">' + spark.map(function (h) { return '<i style="height:' + h + '%"></i>'; }).join('') + '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 月层 ---------- */
  function monthlyData(set) {
    var win = D.apiWindow;
    var months = C.monthlySeries(set.ds.trend.trend, win.start, win.end);
    var arr = C.arrivalsByMonth(set.rows);
    months.forEach(function (m) { m.containers = arr[m.month] || 0; });
    return months;
  }

  function renderMonthly(months) {
    var mode = MONTHLY_MODES.find(function (m) { return m.key === state.monthlyMode; });
    document.getElementById('monthly-unit').textContent = mode.unit;
    var values = months.map(function (r) {
      if (state.monthlyMode === 'amount') return Number((r.amount / 10000).toFixed(2));
      if (state.monthlyMode === 'qty') return Math.round(r.qty);
      return r.containers;
    });
    charts.monthly.setOption({
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      tooltip: Object.assign(C.tooltipBase(), {
        formatter: function (params) {
          var row = months[params[0].dataIndex];
          return '<strong>' + row.label + '</strong><br/>' +
            '<span style="color:#2F8F6B">●</span> 月柜数 ' + row.containers + ' 柜<br/>' +
            '<span style="color:#1E7A55">●</span> 销售金额 ' + C.fmtWanMoney(row.amount) + '<br/>' +
            '<span style="color:#D9820B">●</span> 销售件数 ' + C.fmtInt(row.qty) + ' 件';
        },
      }),
      xAxis: {
        type: 'category', data: months.map(function (r) { return r.label; }),
        axisLine: { lineStyle: { color: '#D8E2DC' } }, axisTick: { show: false },
        axisLabel: { color: '#6B7280', fontSize: 12, interval: 0 },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#EDF2EE' } }, axisLabel: { color: '#9CA3AF', fontSize: 11 } },
      series: [{
        type: 'bar', barWidth: '46%', data: values,
        itemStyle: { color: mode.color, borderRadius: [6, 6, 0, 0], opacity: 0.88 },
        label: {
          show: true, position: 'top', color: '#14532D', fontWeight: 600, fontSize: 11,
          formatter: function (p) { return state.monthlyMode === 'amount' ? p.value.toFixed(1) : C.fmtInt(p.value); },
        },
      }],
    }, { notMerge: true });

    var rail = document.getElementById('monthly-rail');
    var withSale = months.filter(function (r) { return r.amount > 0; });
    var totalArr = months.reduce(function (a, r) { return a + r.containers; }, 0);
    var html = '<h4>月度概览</h4>';
    if (withSale.length > 1) {
      var best = withSale.reduce(function (a, b) { return b.amount > a.amount ? b : a; }, withSale[0]);
      var worst = withSale.reduce(function (a, b) { return b.amount < a.amount ? b : a; }, withSale[0]);
      html += railRow('最高月销售额', '<strong>' + C.fmtWanMoney(best.amount) + '</strong>', best.label + ' · 到达 ' + best.containers + ' 柜') +
        railRow('最低月销售额', '<strong>' + C.fmtWanMoney(worst.amount) + '</strong>', '有销售月份 · ' + worst.label + ' · 到达 ' + worst.containers + ' 柜');
    } else if (withSale.length === 1) {
      html += railRow('当月销售额', '<strong>' + C.fmtWanMoney(withSale[0].amount) + '</strong>', withSale[0].label + ' · 窗口内唯一有单月份 · 到达 ' + withSale[0].containers + ' 柜');
    } else {
      html += railRow('当月销售额', '–', '窗口内暂无销售数据');
    }
    html += railRow('月均柜数', '<strong>' + (totalArr / months.length).toFixed(1) + '</strong> 柜', '共 ' + totalArr + ' 柜 / ' + months.length + ' 个月') +
      railRow('在营档口', '<strong>' + (state.market === 'all' ? D.marketNames.length : 1) + '</strong> 个', state.market === 'all' ? D.marketNames.join(' · ') : state.market);
    rail.innerHTML = html;
  }
  function railRow(label, value, note) {
    return '<div class="rail-row"><span class="rail-label">' + label + '</span>' +
      '<div class="rail-value">' + value + '</div><div class="rail-note">' + note + '</div></div>';
  }

  /* ---------- 日层 ---------- */
  function renderDaily(trend) {
    var mode = DAILY_MODES.find(function (m) { return m.key === state.dailyMode; });
    document.getElementById('daily-unit').textContent = mode.unit;
    var data = trend.map(function (r) {
      if (state.dailyMode === 'amount') return Number((r.sales_amount / 10000).toFixed(2));
      if (state.dailyMode === 'qty') return Math.round(r.sales_quantity);
      return r.container_count || 0;
    });
    charts.daily.setOption({
      grid: { left: 8, right: 12, top: 26, bottom: 4, containLabel: true },
      tooltip: Object.assign(C.tooltipBase(), {
        formatter: function (params) {
          var row = trend[params[0].dataIndex];
          return '<strong>2026-' + C.md(row.sale_date) + '</strong><br/>' +
            '<span style="color:#1E7A55">●</span> 销售金额 ' + C.fmtWanMoney(row.sales_amount) + '<br/>' +
            '<span style="color:#D9820B">●</span> 件数 ' + C.fmtInt(row.sales_quantity) + ' 件<br/>' +
            '<span style="color:#4C9A80">●</span> 日柜数 ' + (row.container_count || 0) + ' 柜<br/>' +
            '<span style="color:#9CA3AF">●</span> 件均价 ¥' + (row.weighted_avg_price == null ? '–' : row.weighted_avg_price.toFixed(2));
        },
      }),
      xAxis: {
        type: 'category', boundaryGap: false,
        data: trend.map(function (r) { return r.sale_date; }),
        axisLine: { lineStyle: { color: '#D8E2DC' } }, axisTick: { show: false },
        axisLabel: {
          color: '#9CA3AF', fontSize: 11, hideOverlap: true,
          interval: Math.max(1, Math.floor(trend.length / 9)),
          formatter: function (v) { return C.md(v); },
        },
      },
      yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: '#EDF2EE' } }, axisLabel: { color: '#9CA3AF', fontSize: 11 } },
      series: [{
        type: 'line', data: data, smooth: false, symbol: 'circle', symbolSize: 5.5,
        lineStyle: { color: mode.color, width: 2 },
        itemStyle: { color: mode.color, borderColor: '#fff', borderWidth: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(30,122,85,.20)' },
            { offset: 1, color: 'rgba(30,122,85,0)' },
          ]),
        },
      }],
    }, { notMerge: true });

    var rail = document.getElementById('daily-rail');
    var peak = trend.reduce(function (a, b) { return b.sales_amount > a.sales_amount ? b : a; }, trend[0]);
    var low = trend.reduce(function (a, b) { return b.sales_amount < a.sales_amount ? b : a; }, trend[0]);
    var totalAmount = trend.reduce(function (a, r) { return a + r.sales_amount; }, 0);
    var marketCount = state.market === 'all' ? D.marketNames.length : 1;
    rail.innerHTML = '<h4>销售概览</h4>' +
      railRow('最高日销售额', '<strong>' + C.fmtWanMoney(peak.sales_amount) + '</strong>', '2026-' + C.md(peak.sale_date) + ' · ' + (peak.container_count || 0) + ' 柜在售') +
      railRow('最低日销售额', '<strong>' + C.fmtWanMoney(low.sales_amount) + '</strong>', '2026-' + C.md(low.sale_date) + ' · ' + (low.container_count || 0) + ' 柜在售') +
      railRow('日均销售额', '<strong>' + C.fmtWanMoney(totalAmount / trend.length) + '</strong>', '共 ' + trend.length + ' 个销售日') +
      railRow('活跃档口', '<strong>' + marketCount + '</strong> 个', state.market === 'all' ? D.marketNames.join(' · ') : state.market);
  }

  /* ---------- 等级件数与均价 ---------- */
  function renderGrades(ds) {
    var tbody = document.getElementById('grade-body');
    var grades = (ds.gradeBreakdown.grades || []).filter(function (g) { return g.sales_quantity > 0; });
    var totalQty = grades.reduce(function (a, g) { return a + g.sales_quantity; }, 0) || 1;
    var order = grades.slice().sort(function (a, b) {
      return GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade);
    });
    tbody.innerHTML = order.map(function (g) {
      var meta = C.gradeMeta(g.grade);
      return '<tr>' +
        '<td><span class="gdot" style="background:' + meta.color + '"></span>' + C.esc(meta.name) + '</td>' +
        '<td class="num">' + C.fmtInt(g.sales_quantity) + '</td>' +
        '<td class="num">' + C.fmtMoney(g.sales_amount) + '</td>' +
        '<td><div class="share"><div class="share-bar"><i style="width:' + (g.sales_quantity / totalQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></div>' +
        '<span class="share-num">' + C.fmtPct(g.sales_quantity / totalQty) + '</span></div></td>' +
        '<td class="num">' + (g.weighted_avg_price == null ? '–' : '¥' + g.weighted_avg_price.toFixed(2)) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- 档口 × 品牌 ---------- */
  function renderMarketBrand(set) {
    var containers = (set.ds.gradeBreakdown.market_brand_containers || []);
    var markets = state.market === 'all'
      ? D.marketNames.filter(function (m) { return containers.some(function (r) { return r.market === m; }); })
      : [state.market];
    var cellVal = function (v) {
      if (state.mbMode === 'amount') return C.fmtWanMoney(v.amount);
      if (state.mbMode === 'qty') return C.fmtInt(v.qty);
      return C.fmtInt(v.count);
    };
    var rows = markets.map(function (m) {
      var perBrand = {};
      containers.filter(function (r) { return r.market === m; }).forEach(function (r) {
        perBrand[r.brand] = { count: r.container_count, amount: 0, qty: 0 };
      });
      set.rows.forEach(function (it) {
        var b = it.brand || '未识别品牌';
        if (perBrand[b]) { perBrand[b].amount += it.sales_amount; perBrand[b].qty += it.total_quantity; }
      });
      var brands = Object.keys(perBrand);
      var total = {
        count: brands.reduce(function (a, b) { return a + perBrand[b].count; }, 0),
        amount: brands.reduce(function (a, b) { return a + perBrand[b].amount; }, 0),
        qty: brands.reduce(function (a, b) { return a + perBrand[b].qty; }, 0),
      };
      return { market: m, perBrand: perBrand, total: total };
    });
    var modeOf = function (v) { return state.mbMode === 'amount' ? v.amount : state.mbMode === 'qty' ? v.qty : v.count; };
    var maxTotal = Math.max.apply(null, rows.map(function (r) { return modeOf(r.total); }).concat([1]));

    var brandCols = [];
    containers.forEach(function (r) { if (brandCols.indexOf(r.brand) < 0) brandCols.push(r.brand); });
    document.getElementById('mb-head').innerHTML = '<tr><th>档口</th>' + brandCols.map(function (b) {
      var meta = C.gradeMeta(b === '未识别品牌' ? 'OTHER' : b);
      return '<th><span class="bdot" style="background:' + (b === '香香' ? '#1E7A4F' : b === '晴牌' ? '#D9820B' : meta.color) + '"></span>' + C.esc(b) + '</th>';
    }).join('') + '<th>合计</th><th class="bar-col"></th></tr>';

    var body = document.getElementById('mb-body');
    body.innerHTML = rows.map(function (r) {
      return '<tr><td>' + C.esc(r.market) + '</td>' +
        brandCols.map(function (b) {
          var cell = r.perBrand[b];
          return '<td class="num">' + (cell ? cellVal(cell) : '–') + '</td>';
        }).join('') +
        '<td class="num strong">' + cellVal(r.total) + '</td>' +
        '<td class="bar-col"><div class="mb-bar"><i style="width:' + (modeOf(r.total) / maxTotal * 100).toFixed(1) + '%"></i></div></td></tr>';
    }).join('');
    if (rows.length > 1) {
      var foot = document.createElement('tr');
      foot.className = 'mb-foot';
      var brandTotals = brandCols.map(function (b) {
        var t = { count: 0, amount: 0, qty: 0 };
        rows.forEach(function (r) { if (r.perBrand[b]) { t.count += r.perBrand[b].count; t.amount += r.perBrand[b].amount; t.qty += r.perBrand[b].qty; } });
        return t;
      });
      foot.innerHTML = '<td>合计</td>' + brandTotals.map(cellVal).map(function (v) { return '<td class="num">' + v + '</td>'; }).join('') +
        '<td class="num strong">' + cellVal({ count: set.rows.length, amount: set.rows.reduce(function (a, r) { return a + r.sales_amount; }, 0), qty: set.rows.reduce(function (a, r) { return a + r.total_quantity; }, 0) }) + '</td>' +
        '<td class="bar-col"></td>';
      body.appendChild(foot);
    }
  }

  /* ---------- 规格销售明细 ---------- */
  function aggRows(rows) {
    var map = {};
    rows.forEach(function (r) {
      var label = (r.piece_count || '?') + '头' + (r.spec_kg || '?') + 'kg';
      if (!map[label]) map[label] = { label: label, qty: 0, amount: 0 };
      map[label].qty += r.quantity;
      map[label].amount += r.amount;
    });
    return Object.values(map);
  }

  function renderSpecs(rows) {
    var grid = document.getElementById('spec-grid');
    grid.innerHTML = '';
    var brandRows = state.specBrand === 'all' ? rows : rows.filter(function (r) { return (r.brand || '未识别品牌') === state.specBrand; });
    var totalQty = brandRows.reduce(function (a, r) { return a + r.quantity; }, 0) || 1;
    var grades = GRADE_ORDER.filter(function (g) {
      return state.specGrade === 'all' ? true : g === state.specGrade;
    });
    var present = grades.filter(function (g) {
      return brandRows.some(function (r) { return (r.grade || 'OTHER') === g; });
    });

    present.forEach(function (g) {
      var meta = C.gradeMeta(g);
      var gRows = brandRows.filter(function (r) { return (r.grade || 'OTHER') === g; });
      var gQty = gRows.reduce(function (a, r) { return a + r.quantity; }, 0);
      var gAmount = gRows.reduce(function (a, r) { return a + r.amount; }, 0);
      var all = aggRows(gRows).sort(function (a, b) { return b.qty - a.qty; });
      if (!all.length) return;
      var top = all.slice(0, 3);
      var extras = all.slice(3);
      var maxQty = all.reduce(function (a, r) { return r.qty > a ? r.qty : a; }, 1);
      var col = C.el('div', 'spec-col');
      col.innerHTML =
        '<header class="spec-col-head"><span class="gdot" style="background:' + meta.color + '"></span>' +
        '<strong>' + C.esc(meta.name) + '</strong>' +
        '<span class="spec-col-meta">' + C.fmtInt(gQty) + ' 件 · ' + C.fmtPct(gQty / totalQty) + ' · 件均价 ¥' + (gQty ? (gAmount / gQty).toFixed(2) : '0.00') + '</span></header>' +
        '<table><thead><tr><th>规格</th><th class="num">件数</th><th class="num">占' + meta.name.slice(0, 1) + '果</th><th class="num">占总件数</th><th class="num">件均价</th></tr></thead><tbody></tbody></table>' +
        (extras.length ? '<button type="button" class="spec-more" data-grade="' + g + '" aria-expanded="' + (state.specOpen[g] ? 'true' : 'false') + '"></button>' : '');
      var tbody = col.querySelector('tbody');
      top.forEach(function (r) { tbody.appendChild(specRow(r, meta, gQty, totalQty, maxQty)); });
      if (extras.length) {
        var eQty = extras.reduce(function (a, r) { return a + r.qty; }, 0);
        var eAmount = extras.reduce(function (a, r) { return a + r.amount; }, 0);
        if (!state.specOpen[g]) {
          var tr = C.el('tr', 'spec-extra-summary');
          tr.innerHTML =
            '<td><span class="spec-mini-bar"><i style="width:' + (eQty / maxQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></span>其他 ' + extras.length + ' 个规格</td>' +
            '<td class="num">' + C.fmtInt(eQty) + '</td>' +
            '<td class="num">' + C.fmtPct(eQty / (gQty || 1)) + '</td>' +
            '<td class="num">' + C.fmtPct(eQty / totalQty) + '</td>' +
            '<td class="num">¥' + (eAmount / eQty).toFixed(2) + '</td>';
          tbody.appendChild(tr);
        } else {
          extras.forEach(function (r) {
            var sub = specRow(r, meta, gQty, totalQty, maxQty);
            sub.classList.add('spec-extra-row');
            tbody.appendChild(sub);
          });
        }
      }
      var more = col.querySelector('.spec-more');
      if (more) {
        more.textContent = state.specOpen[g] ? '收起' + meta.name + '其余规格' : '查看 ' + meta.name + ' 全部规格 →';
        more.addEventListener('click', function () {
          state.specOpen[g] = !state.specOpen[g];
          renderSpecs(currentRows());
        });
      }
      grid.appendChild(col);
    });
    if (!grid.children.length) grid.appendChild(C.el('p', 'spec-empty', '当前筛选条件下暂无规格数据'));
  }
  function specRow(r, meta, gradeQty, totalQty, maxQty) {
    var tr = C.el('tr');
    tr.innerHTML =
      '<td><span class="spec-mini-bar"><i style="width:' + (r.qty / maxQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></span>' + C.esc(r.label) + '</td>' +
      '<td class="num">' + C.fmtInt(r.qty) + '</td>' +
      '<td class="num">' + C.fmtPct(r.qty / (gradeQty || 1)) + '</td>' +
      '<td class="num">' + C.fmtPct(r.qty / totalQty) + '</td>' +
      '<td class="num">¥' + (r.qty ? (r.amount / r.qty).toFixed(2) : '0.00') + '</td>';
    return tr;
  }

  function currentRows() {
    return marketSet().ds.gradeBreakdown.records || [];
  }

  /* ---------- 汇总渲染 ---------- */
  function renderAll() {
    var set = marketSet();
    var ds = set.ds;
    var total = ds.overview.total;

    var marketLabel = state.market === 'all' ? '全部档口（' + D.marketNames.length + '）' : state.market;
    var countries = (D.filterOptions.countries || []).map(function (c) { return c.name + ' ' + c.settlement_count; }).join(' · ');
    document.getElementById('year-context').textContent =
      marketLabel + ' · ' + countries + ' · 结算日 ' + coverageText(ds) + ' · 数据截至 ' + D.fetchedAt;
    document.getElementById('year-title').textContent = D.apiWindow.end.slice(0, 4) + ' 年 · 档口销售数据';

    renderKpis(ds);
    renderMonthly(monthlyData(set));
    renderDaily(ds.trend.trend || []);
    renderGrades(ds);
    renderMarketBrand(set);
    renderSpecs(ds.gradeBreakdown.records || []);
  }

  function coverageText(ds) {
    var t = ds.trend.trend || [];
    if (!t.length) return '暂无销售';
    return t[0].sale_date + ' ~ ' + t[t.length - 1].sale_date;
  }

  /* ---------- 初始化 ---------- */
  function fillFilters() {
    var dateChip = document.getElementById('f-date-chip');
    dateChip.textContent = D.apiWindow.start.replace(/-/g, '/') + ' → ' + D.apiWindow.end.replace(/-/g, '/');
    var marketSel = document.getElementById('f-market');
    D.marketNames.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      marketSel.appendChild(opt);
    });
    marketSel.addEventListener('change', function (e) {
      state.market = e.target.value === 'all' ? 'all' : e.target.value;
      renderAll();
    });
    document.getElementById('f-apply').addEventListener('click', renderAll);

    var brandSel = document.getElementById('spec-brand-filter');
    (D.filterOptions.brands || []).forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      brandSel.appendChild(opt);
    });
    brandSel.addEventListener('change', function (e) {
      state.specBrand = e.target.value;
      renderSpecs(currentRows());
    });
    var gradeSel = document.getElementById('spec-grade-filter');
    (D.byMarket.all.gradeBreakdown.grades || []).forEach(function (g) {
      if (g.sales_quantity <= 0) return;
      var meta = C.gradeMeta(g.grade);
      var opt = document.createElement('option');
      opt.value = g.grade;
      opt.textContent = meta.name;
      gradeSel.appendChild(opt);
    });
    gradeSel.addEventListener('change', function (e) {
      state.specGrade = e.target.value;
      renderSpecs(currentRows());
    });
  }

  function init() {
    C.renderShell('overview', '销售总览', '档口销售数据 · 年 / 月 / 日柜数与金额、数量一览（真实接口数据）',
      '<div class="chip date-chip" role="group" aria-label="销售日期">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>' +
      '<span class="chip-label">销售日期</span><strong id="f-date-chip"></strong></div>' +
      '<div class="chip select-chip"><span class="chip-label">国家</span><strong>全部国家</strong></div>' +
      '<label class="chip select-chip"><span class="chip-label">档口</span>' +
      '<select id="f-market" aria-label="档口（市场）"><option value="all" selected>全部档口</option></select></label>' +
      '<button type="button" class="apply-btn" id="f-apply">应用</button>' +
      '<button type="button" class="more-btn" title="更多筛选（demo 未实现）" aria-label="更多筛选">⋯</button>');

    if (!C.data()) { C.showMissingData(); return; }
    D = C.data();

    charts.monthly = C.makeChart('monthly-chart');
    charts.daily = C.makeChart('daily-chart');

    document.getElementById('monthly-seg-slot').innerHTML = C.segHtml('monthly-seg', MONTHLY_MODES, state.monthlyMode);
    document.getElementById('daily-seg-slot').innerHTML = C.segHtml('daily-seg', DAILY_MODES, state.dailyMode);
    document.getElementById('mb-seg-slot').innerHTML = C.segHtml('mb-seg', MB_MODES, state.mbMode);
    C.bindSeg('monthly-seg', null, function (v) { state.monthlyMode = v; }, renderAll);
    C.bindSeg('daily-seg', null, function (v) { state.dailyMode = v; }, renderAll);
    C.bindSeg('mb-seg', null, function (v) { state.mbMode = v; }, renderAll);

    fillFilters();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
