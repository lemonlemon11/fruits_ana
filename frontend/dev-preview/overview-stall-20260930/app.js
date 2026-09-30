/* 销售总览「档口数据」demo 交互逻辑（视觉伴侣 · 53002）。
 * 结构对应老板手绘模型：年（总柜数·金额/数量）→ 月（月柜数）→ 日（日柜数）三级同屏瀑布。 */
(function () {
  'use strict';

  var DEMO = window.OVERVIEW_STALL_DEMO;
  var META = DEMO.meta;
  var GRADE_META = {
    A: { name: 'A果', color: '#1E7A4F', soft: 'rgba(30,122,79,.14)' },
    B: { name: 'B果', color: '#D9820B', soft: 'rgba(217,130,11,.14)' },
    C: { name: 'C果（含BC）', color: '#D64545', soft: 'rgba(214,69,69,.14)' },
  };
  var BRAND_COLORS = { 晴牌: '#1E7A4F', 香香果: '#D9820B', 钻牌: '#3B6FD4' };

  /* ---------- 工具 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashCode(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  }
  function parseDate(s) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function iso(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function md(s) { return s.slice(5).replace('-', '-'); }
  function fmtInt(n) { return Math.round(n).toLocaleString('zh-CN'); }
  function fmtMoney(n) { return '¥' + fmtInt(n); }
  function fmtMoney2(n) {
    return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtWanMoney(n) { return '¥' + (n / 10000).toFixed(1) + ' 万'; }
  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }
  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 数据推导 ---------- */
  /* 规格行 →（品牌 × 档口）叶行；分摊后对齐 KPI 锚点，保证各区块交叉一致 */
  function buildLeaves() {
    var leaves = [];
    DEMO.specs.forEach(function (s) {
      var acc = 0;
      s.brands.forEach(function (bw, i) {
        var q = i === s.brands.length - 1 ? Math.round(s.qty - acc) : Math.round(s.qty * bw.w);
        acc += q;
        if (q <= 0) return;
        var bms = DEMO.brandMarkets[bw.b];
        var accm = 0;
        bms.forEach(function (mw, j) {
          var qm = j === bms.length - 1 ? q - accm : Math.round(q * mw.w);
          accm += qm;
          if (qm <= 0) return;
          leaves.push({
            market: mw.m, brand: bw.b, grade: s.grade,
            label: s.head + s.kg, head: s.head, kg: s.kg, extra: !!s.extra,
            qty: qm, price: s.price, amount: qm * s.price,
          });
        });
      });
    });
    var qSum = leaves.reduce(function (a, l) { return a + l.qty; }, 0);
    var last = leaves[leaves.length - 1];
    last.qty += META.targetQty - qSum;
    last.amount = last.qty * last.price;
    var aSum = leaves.reduce(function (a, l) { return a + l.amount; }, 0);
    leaves[0].amount += META.targetAmount - aSum;

    /* 关键：按（档口 × 品牌）组对齐柜真值——等级/规格区块与 KPI/日/月/档口品牌表
     * 同源，切单档口后各区块合计仍一致（视觉伴侣验收修正）。
     * 注意先聚合柜真值：同档口同品牌可能有多张结算单，不能逐张对齐。 */
    var groups = new Map();
    leaves.forEach(function (l) {
      var k = l.market + '|' + l.brand;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    });
    var truth = new Map();
    DEMO.containers.forEach(function (c) {
      var k = c.market + '|' + c.brand;
      var t = truth.get(k);
      if (!t) { t = { qty: 0, amount: 0 }; truth.set(k, t); }
      t.qty += c.qty;
      t.amount += c.amount;
    });
    truth.forEach(function (t, k) {
      var g = groups.get(k);
      if (!g) return;
      var dq = t.qty - g.reduce(function (a, l) { return a + l.qty; }, 0);
      if (dq !== 0) {
        var big = g.reduce(function (a, l) { return l.qty > a.qty ? l : a; }, g[0]);
        big.qty = Math.max(1, big.qty + dq);
        big.amount = big.qty * big.price;
      }
      var da = t.amount - g.reduce(function (a, l) { return a + l.amount; }, 0);
      if (da !== 0) {
        var big2 = g.reduce(function (a, l) { return l.amount > a.amount ? l : a; }, g[0]);
        big2.amount += da;
      }
    });
    return leaves;
  }

  /* 柜 → 每日销售序列（窗口内钟形权重 + 确定性噪声分摊） */
  function buildDaily(containers) {
    var map = new Map();
    containers.forEach(function (c) {
      var rnd = mulberry32(hashCode(c.arrive + c.market + c.brand));
      var start = parseDate(c.arrive);
      var ws = [], sum = 0, i;
      for (i = 0; i < c.days; i++) {
        var ramp = Math.sin(((i + 0.5) / c.days) * Math.PI);
        var w = Math.max(0.08, ramp * (0.72 + 0.55 * rnd()));
        ws.push(w); sum += w;
      }
      for (i = 0; i < c.days; i++) {
        var key = iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
        if (key < META.rangeStart || key > META.rangeEnd) continue;
        var rec = map.get(key);
        if (!rec) { rec = { date: key, amount: 0, qty: 0, cnt: 0 }; map.set(key, rec); }
        rec.amount += (c.amount * ws[i]) / sum;
        rec.qty += (c.qty * ws[i]) / sum;
        rec.cnt += 1;
      }
    });
    return Array.from(map.values()).sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .map(function (r) { return { date: r.date, amount: r.amount, qty: r.qty, cnt: r.cnt, avg: r.qty ? r.amount / r.qty : 0 }; });
  }

  /* 月聚合：覆盖筛选区间内全部月份（零填充），月柜数 = 当月到达柜数，金额/件数 = 当月销售日合计 */
  function buildMonthly(daily, containers) {
    var sale = new Map();
    daily.forEach(function (r) {
      var m = r.date.slice(0, 7);
      var rec = sale.get(m);
      if (!rec) { rec = { amount: 0, qty: 0 }; sale.set(m, rec); }
      rec.amount += r.amount; rec.qty += r.qty;
    });
    var arrivals = new Map();
    containers.forEach(function (c) {
      var m = c.arrive.slice(0, 7);
      arrivals.set(m, (arrivals.get(m) || 0) + 1);
    });
    /* 由筛选区间生成连续月份序列 */
    var months = [];
    var cursor = new Date(Number(META.rangeStart.slice(0, 4)), Number(META.rangeStart.slice(5, 7)) - 1, 1);
    var end = new Date(Number(META.rangeEnd.slice(0, 4)), Number(META.rangeEnd.slice(5, 7)) - 1, 1);
    while (cursor <= end) {
      var key = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0');
      var s = sale.get(key) || { amount: 0, qty: 0 };
      months.push({
        month: key,
        label: (cursor.getMonth() + 1) + '月',
        containers: arrivals.get(key) || 0,
        amount: s.amount,
        qty: s.qty,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  function groupLeaves(leaves, keyFn) {
    var map = new Map();
    leaves.forEach(function (l) {
      var k = keyFn(l);
      var rec = map.get(k);
      if (!rec) { rec = { key: k, qty: 0, amount: 0 }; map.set(k, rec); }
      rec.qty += l.qty; rec.amount += l.amount;
    });
    return Array.from(map.values());
  }

  /* ---------- 页面状态 ---------- */
  var state = { market: 'all', mbMode: 'containers', monthlyMode: 'containers', dailyMode: 'amount', specBrand: 'all', specGrade: 'all', specOpen: { A: false, B: false, C: false } };
  var ALL_LEAVES = buildLeaves();
  var charts = { monthly: null, daily: null };

  function filteredContainers() {
    return state.market === 'all' ? DEMO.containers : DEMO.containers.filter(function (c) { return c.market === state.market; });
  }
  function filteredLeaves() {
    return state.market === 'all' ? ALL_LEAVES : ALL_LEAVES.filter(function (l) { return l.market === state.market; });
  }

  /* ---------- KPI 大数带（年） ---------- */
  var KPI_DEFS = [
    { key: 'containers', label: '总柜数', unit: '柜', icon: 'container', tone: 'purple' },
    { key: 'amount', label: '销售金额', unit: '', icon: 'amount', tone: 'green' },
    { key: 'qty', label: '总件数', unit: '件', icon: 'qty', tone: 'amber' },
    { key: 'avg', label: '每件均价', unit: '/件', icon: 'avg', tone: 'blue' },
  ];
  var KPI_ICONS = {
    container: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8h13v9H3zM16 11h3l2 3v3h-5z"/><circle cx="7" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/></svg>',
    amount: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/></svg>',
    qty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
    avg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.6 13.4L11 3.8A2 2 0 0 0 9.6 3H5a2 2 0 0 0-2 2v4.6c0 .5.2 1 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.6z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
  };
  var SPARKS = {
    containers: [34, 52, 44, 66, 58, 82, 74],
    amount: [42, 58, 50, 72, 62, 88, 78],
    qty: [38, 54, 46, 68, 60, 84, 72],
    avg: [46, 50, 56, 52, 62, 66, 74],
  };

  function renderKpis(total) {
    var grid = document.getElementById('kpi-grid');
    grid.innerHTML = '';
    var values = {
      containers: { big: fmtInt(total.containers), small: '柜', delta: META.deltas.containers },
      amount: { big: fmtMoney(total.amount), small: '', delta: META.deltas.amount },
      qty: { big: fmtInt(total.qty), small: '件', delta: META.deltas.qty },
      avg: { big: '¥' + total.avg.toFixed(2), small: '/件', delta: META.deltas.avg },
    };
    KPI_DEFS.forEach(function (def) {
      var v = values[def.key];
      var card = el('div', 'kpi-card');
      card.innerHTML =
        '<div class="kpi-icon tone-' + def.tone + '">' + KPI_ICONS[def.icon] + '</div>' +
        '<div class="kpi-info">' +
        '<span class="kpi-label">' + def.label + '</span>' +
        '<div class="kpi-value">' + v.big + (v.small ? ' <small>' + v.small + '</small>' : '') + '</div>' +
        '<div class="kpi-delta"><span class="delta-up">↗ ' + esc(v.delta) + '</span><span class="delta-note">较上期</span></div>' +
        '</div>' +
        '<div class="kpi-spark" aria-hidden="true">' + SPARKS[def.key].map(function (h) {
          return '<i style="height:' + h + '%"></i>';
        }).join('') + '</div>';
      grid.appendChild(card);
    });
  }

  /* ---------- 月层 ---------- */
  var MONTHLY_MODES = [
    { key: 'containers', name: '按柜数', unit: '月柜数 · 当月到达结算单数', color: '#2F8F6B' },
    { key: 'amount', name: '按金额', unit: '销售金额 · 单位：万元', color: '#175E43' },
    { key: 'qty', name: '按件数', unit: '销售件数 · 单位：件', color: '#D9820B' },
  ];
  function monthlyValue(row, mode) {
    if (mode === 'amount') return Number((row.amount / 10000).toFixed(2));
    if (mode === 'qty') return Math.round(row.qty);
    return row.containers;
  }
  function renderMonthly(monthly) {
    var mode = MONTHLY_MODES.find(function (m) { return m.key === state.monthlyMode; });
    document.getElementById('monthly-unit').textContent = mode.unit;
    var chart = charts.monthly;
    chart.setOption({
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: '#fff', borderColor: '#E3EAE5', padding: [10, 14],
        textStyle: { color: '#1F2937', fontSize: 13 },
        extraCssText: 'box-shadow:0 8px 24px rgba(23,58,45,.12);border-radius:10px;',
        formatter: function (params) {
          var row = monthly[params[0].dataIndex];
          return '<strong>' + row.label + '</strong><br/>' +
            '<span style="color:#2F8F6B">●</span> 月柜数 ' + row.containers + ' 柜<br/>' +
            '<span style="color:#1E7A55">●</span> 销售金额 ' + fmtWanMoney(row.amount) + '<br/>' +
            '<span style="color:#D9820B">●</span> 销售件数 ' + fmtInt(row.qty) + ' 件';
        },
      },
      xAxis: {
        type: 'category', data: monthly.map(function (r) { return r.label; }),
        axisLine: { lineStyle: { color: '#D8E2DC' } }, axisTick: { show: false },
        axisLabel: { color: '#6B7280', fontSize: 12 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#EDF2EE' } },
        axisLabel: { color: '#9CA3AF', fontSize: 11 },
      },
      series: [{
        type: 'bar', barWidth: '46%',
        data: monthly.map(function (r) { return monthlyValue(r, mode.key); }),
        itemStyle: { color: mode.color, borderRadius: [6, 6, 0, 0], opacity: 0.88 },
        label: {
          show: true, position: 'top', color: '#14532D', fontWeight: 600, fontSize: 11,
          formatter: function (p) {
            var v = p.value;
            return mode.key === 'amount' ? v.toFixed(1) : fmtInt(v);
          },
        },
      }],
    }, { notMerge: true });

    /* 右栏：月度概览（最高/最低按月销售额，避免单档口下柜数并列导致两行雷同） */
    var rail = document.getElementById('monthly-rail');
    var withSale = monthly.filter(function (r) { return r.amount > 0; });
    var totalArr = monthly.reduce(function (a, r) { return a + r.containers; }, 0);
    var marketCount = state.market === 'all' ? DEMO.markets.length : 1;
    var html = '<h4>月度概览</h4>';
    if (withSale.length) {
      var best = withSale.reduce(function (a, b) { return b.amount > a.amount ? b : a; }, withSale[0]);
      var worst = withSale.reduce(function (a, b) { return b.amount < a.amount ? b : a; }, withSale[0]);
      html += railRow('最高月销售额', '<strong>' + fmtWanMoney(best.amount) + '</strong>', best.label + ' · 到达 ' + best.containers + ' 柜') +
        railRow('最低月销售额', '<strong>' + fmtWanMoney(worst.amount) + '</strong>', '有销售月份 · ' + worst.label + ' · 到达 ' + worst.containers + ' 柜');
    }
    html += railRow('月均柜数', '<strong>' + (totalArr / monthly.length).toFixed(1) + '</strong> 柜', '共 ' + totalArr + ' 柜 / ' + monthly.length + ' 个月') +
      railRow('在营档口', '<strong>' + marketCount + '</strong> 个', state.market === 'all' ? '江南 · 海吉星 · 白沙洲' : state.market);
    rail.innerHTML = html;
  }
  function railRow(label, value, note) {
    return '<div class="rail-row"><span class="rail-label">' + label + '</span>' +
      '<div class="rail-value">' + value + '</div><div class="rail-note">' + note + '</div></div>';
  }

  /* ---------- 日层 ---------- */
  var DAILY_MODES = [
    { key: 'amount', name: '销售金额', unit: '销售金额（单位：万元）', color: '#1E7A55' },
    { key: 'qty', name: '件数', unit: '销售件数（单位：件）', color: '#D9820B' },
    { key: 'cnt', name: '日柜数', unit: '日柜数 · 当日在售结算单数（单位：柜）', color: '#4C9A80' },
  ];
  function renderDaily(daily) {
    var mode = DAILY_MODES.find(function (m) { return m.key === state.dailyMode; });
    document.getElementById('daily-unit').textContent = mode.unit;
    var data = daily.map(function (r) {
      if (state.dailyMode === 'amount') return Number((r.amount / 10000).toFixed(2));
      if (state.dailyMode === 'qty') return Math.round(r.qty);
      return r.cnt;
    });
    charts.daily.setOption({
      grid: { left: 8, right: 12, top: 26, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff', borderColor: '#E3EAE5', padding: [10, 14],
        textStyle: { color: '#1F2937', fontSize: 13 },
        extraCssText: 'box-shadow:0 8px 24px rgba(23,58,45,.12);border-radius:10px;',
        formatter: function (params) {
          var row = daily[params[0].dataIndex];
          return '<strong>2026-' + row.date + '</strong><br/>' +
            '<span style="color:#1E7A55">●</span> 销售金额 ' + fmtWanMoney(row.amount) + '<br/>' +
            '<span style="color:#D9820B">●</span> 件数 ' + fmtInt(row.qty) + ' 件<br/>' +
            '<span style="color:#4C9A80">●</span> 日柜数 ' + row.cnt + ' 柜<br/>' +
            '<span style="color:#9CA3AF">●</span> 件均价 ¥' + row.avg.toFixed(2);
        },
      },
      xAxis: {
        type: 'category', boundaryGap: false,
        data: daily.map(function (r) { return r.date; }),
        axisLine: { lineStyle: { color: '#D8E2DC' } }, axisTick: { show: false },
        axisLabel: {
          color: '#9CA3AF', fontSize: 11, hideOverlap: true,
          interval: Math.max(1, Math.floor(daily.length / 9)),
          formatter: function (v) { return md(v); },
        },
      },
      yAxis: {
        type: 'value', min: 0,
        splitLine: { lineStyle: { color: '#EDF2EE' } },
        axisLabel: { color: '#9CA3AF', fontSize: 11 },
      },
      series: [{
        type: 'line', data: data, smooth: false,
        symbol: 'circle', symbolSize: 5.5,
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
    var peak = daily.reduce(function (a, b) { return b.amount > a.amount ? b : a; }, daily[0]);
    var low = daily.reduce(function (a, b) { return b.amount < a.amount ? b : a; }, daily[0]);
    var totalAmount = daily.reduce(function (a, r) { return a + r.amount; }, 0);
    var activeMarkets = {};
    filteredContainers().forEach(function (c) { activeMarkets[c.market] = 1; });
    var marketCount = Object.keys(activeMarkets).length;
    rail.innerHTML =
      '<h4>销售概览</h4>' +
      railRow('最高日销售额', '<strong>' + fmtWanMoney(peak.amount) + '</strong>', '2026-' + md(peak.date) + ' · ' + peak.cnt + ' 柜在售') +
      railRow('最低日销售额', '<strong>' + fmtWanMoney(low.amount) + '</strong>', '2026-' + md(low.date) + ' · ' + low.cnt + ' 柜在售') +
      railRow('日均销售额', '<strong>' + fmtWanMoney(totalAmount / daily.length) + '</strong>', '共 ' + daily.length + ' 个销售日') +
      railRow('活跃档口', '<strong>' + marketCount + '</strong> 个', state.market === 'all' ? '覆盖全部在营档口' : state.market);
  }

  /* ---------- 等级件数与均价 ---------- */
  function renderGrades(leaves) {
    var tbody = document.getElementById('grade-body');
    var totalQty = leaves.reduce(function (a, l) { return a + l.qty; }, 0);
    var groups = groupLeaves(leaves, function (l) { return l.grade; });
    var order = ['A', 'B', 'C'];
    tbody.innerHTML = '';
    order.forEach(function (g) {
      var rec = groups.find(function (x) { return x.key === g; });
      if (!rec) return;
      var meta = GRADE_META[g];
      var avg = rec.qty ? rec.amount / rec.qty : 0;
      var tr = el('tr');
      tr.innerHTML =
        '<td><span class="gdot" style="background:' + meta.color + '"></span>' + meta.name + '</td>' +
        '<td class="num">' + fmtInt(rec.qty) + '</td>' +
        '<td class="num">' + fmtMoney(rec.amount) + '</td>' +
        '<td><div class="share"><div class="share-bar"><i style="width:' + (rec.qty / totalQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></div><span class="share-num">' + fmtPct(rec.qty / totalQty) + '</span></div></td>' +
        '<td class="num">' + '¥' + avg.toFixed(2) + '</td>';
      tbody.appendChild(tr);
    });
  }

  /* ---------- 档口 × 品牌 ---------- */
  var MB_MODES = [
    { key: 'containers', name: '按柜数' },
    { key: 'amount', name: '按金额' },
    { key: 'qty', name: '按件数' },
  ];
  function renderMarketBrand(containers) {
    var markets = state.market === 'all' ? DEMO.markets : [state.market];
    var cellVal = function (c) {
      if (state.mbMode === 'amount') return fmtWanMoney(c.amount);
      if (state.mbMode === 'qty') return fmtInt(c.qty);
      return fmtInt(c.count);
    };
    var rows = markets.map(function (m) {
      var cs = DEMO.markets.indexOf(m);
      var perBrand = DEMO.brands.map(function (b) {
        var list = containers.filter(function (c) { return c.market === m && c.brand === b; });
        return {
          count: list.length,
          amount: list.reduce(function (a, c) { return a + c.amount; }, 0),
          qty: list.reduce(function (a, c) { return a + c.qty; }, 0),
        };
      });
      var total = {
        count: perBrand.reduce(function (a, x) { return a + x.count; }, 0),
        amount: perBrand.reduce(function (a, x) { return a + x.amount; }, 0),
        qty: perBrand.reduce(function (a, x) { return a + x.qty; }, 0),
      };
      return { market: m, mi: cs, perBrand: perBrand, total: total };
    });
    var maxTotal = Math.max.apply(null, rows.map(function (r) {
      return state.mbMode === 'amount' ? r.total.amount : state.mbMode === 'qty' ? r.total.qty : r.total.count;
    }).concat([1]));

    var thead = document.getElementById('mb-head');
    thead.innerHTML = '<tr><th>档口</th>' + DEMO.brands.map(function (b) {
      return '<th><span class="bdot" style="background:' + BRAND_COLORS[b] + '"></span>' + b + '</th>';
    }).join('') + '<th>合计</th><th class="bar-col"></th></tr>';
    var tbody = document.getElementById('mb-body');
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.innerHTML = '<td>' + esc(r.market) + '</td>' +
        r.perBrand.map(function (cell) { return '<td class="num">' + (cell.count ? cellVal(cell) : '–') + '</td>'; }).join('') +
        '<td class="num strong">' + cellVal(r.total) + '</td>' +
        '<td class="bar-col"><div class="mb-bar"><i style="width:' + ((state.mbMode === 'amount' ? r.total.amount : state.mbMode === 'qty' ? r.total.qty : r.total.count) / maxTotal * 100).toFixed(1) + '%"></i></div></td>';
      tbody.appendChild(tr);
    });
    if (state.market === 'all' && rows.length > 1) {
      var foot = el('tr', 'mb-foot');
      var brandTotals = DEMO.brands.map(function (b, i) {
        return {
          count: rows.reduce(function (a, r) { return a + r.perBrand[i].count; }, 0),
          amount: rows.reduce(function (a, r) { return a + r.perBrand[i].amount; }, 0),
          qty: rows.reduce(function (a, r) { return a + r.perBrand[i].qty; }, 0),
        };
      });
      foot.innerHTML = '<td>合计</td>' +
        brandTotals.map(function (cell) { return '<td class="num">' + cellVal(cell) + '</td>'; }).join('') +
        '<td class="num strong">' + cellVal({
          count: containers.length,
          amount: containers.reduce(function (a, c) { return a + c.amount; }, 0),
          qty: containers.reduce(function (a, c) { return a + c.qty; }, 0),
        }) + '</td><td class="bar-col"></td>';
      tbody.appendChild(foot);
    }
  }

  /* ---------- 规格销售明细 ---------- */
  /* 叶行按规格聚合回一行（拆分只为筛选口径正确，展示不重复出现同名规格） */
  function aggByLabel(rows) {
    var map = new Map();
    rows.forEach(function (l) {
      var rec = map.get(l.label);
      if (!rec) { rec = { label: l.label, qty: 0, amount: 0 }; map.set(l.label, rec); }
      rec.qty += l.qty;
      rec.amount += l.amount;
    });
    return Array.from(map.values());
  }

  function renderSpecs(leaves) {
    var grid = document.getElementById('spec-grid');
    grid.innerHTML = '';
    var brandLeaves = state.specBrand === 'all' ? leaves : leaves.filter(function (l) { return l.brand === state.specBrand; });
    var totalQty = brandLeaves.reduce(function (a, l) { return a + l.qty; }, 0) || 1;
    var grades = state.specGrade === 'all' ? ['A', 'B', 'C'] : [state.specGrade];
    grades.forEach(function (g) {
      var gLeaves = brandLeaves.filter(function (l) { return l.grade === g; });
      var meta = GRADE_META[g];
      var gQty = gLeaves.reduce(function (a, l) { return a + l.qty; }, 0);
      var gAmount = gLeaves.reduce(function (a, l) { return a + l.amount; }, 0);
      var col = el('div', 'spec-col');
      col.innerHTML =
        '<header class="spec-col-head"><span class="gdot" style="background:' + meta.color + '"></span>' +
        '<strong>' + meta.name + '</strong>' +
        '<span class="spec-col-meta">' + fmtInt(gQty) + ' 件 · ' + fmtPct(gQty / totalQty) + ' · 件均价 ¥' + (gQty ? (gAmount / gQty).toFixed(2) : '0.00') + '</span></header>' +
        '<table><thead><tr><th>规格</th><th class="num">件数</th><th class="num">占' + meta.name.slice(0, 1) + '果</th><th class="num">占总件数</th><th class="num">件均价</th></tr></thead><tbody></tbody></table>' +
        '<button type="button" class="spec-more" data-grade="' + g + '" aria-expanded="' + (state.specOpen[g] ? 'true' : 'false') + '"></button>';
      var tbody = col.querySelector('tbody');

      var mainRows = aggByLabel(gLeaves.filter(function (l) { return !l.extra; }));
      var extraRows = aggByLabel(gLeaves.filter(function (l) { return l.extra; }));
      var byQty = function (a, b) { return b.qty - a.qty; };
      mainRows.sort(byQty);
      extraRows.sort(byQty);
      var allRows = mainRows.concat(extraRows);
      var maxQty = allRows.reduce(function (a, r) { return r.qty > a ? r.qty : a; }, 1);
      mainRows.forEach(function (r) { tbody.appendChild(specRow(r, meta, gQty, totalQty, maxQty)); });
      if (extraRows.length) {
        var eQty = extraRows.reduce(function (a, r) { return a + r.qty; }, 0);
        var eAmount = extraRows.reduce(function (a, r) { return a + r.amount; }, 0);
        if (!state.specOpen[g]) {
          /* 收起态：只显示「其他 N 个规格」聚合行；展开后隐藏聚合行只留明细（避免重复节奏） */
          var tr = el('tr', 'spec-extra-summary');
          tr.innerHTML =
            '<td><span class="spec-mini-bar"><i style="width:' + (eQty / maxQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></span>其他 ' + extraRows.length + ' 个规格</td>' +
            '<td class="num">' + fmtInt(eQty) + '</td>' +
            '<td class="num">' + fmtPct(eQty / (gQty || 1)) + '</td>' +
            '<td class="num">' + fmtPct(eQty / totalQty) + '</td>' +
            '<td class="num">¥' + (eAmount / eQty).toFixed(2) + '</td>';
          tbody.appendChild(tr);
        } else {
          extraRows.forEach(function (r) {
            var sub = specRow(r, meta, gQty, totalQty, maxQty);
            sub.classList.add('spec-extra-row');
            tbody.appendChild(sub);
          });
        }
      }
      var more = col.querySelector('.spec-more');
      updateMoreText(more, g, extraRows.length);
      more.addEventListener('click', function () {
        state.specOpen[g] = !state.specOpen[g];
        renderSpecs(filteredLeaves());
      });
      grid.appendChild(col);
    });
    if (!grid.children.length) {
      grid.appendChild(el('p', 'spec-empty', '当前筛选条件下暂无规格数据'));
    }
  }
  function specRow(r, meta, gradeQty, totalQty, maxQty) {
    var tr = el('tr');
    tr.innerHTML =
      '<td><span class="spec-mini-bar"><i style="width:' + (r.qty / maxQty * 100).toFixed(1) + '%;background:' + meta.color + '"></i></span>' + esc(r.label) + '</td>' +
      '<td class="num">' + fmtInt(r.qty) + '</td>' +
      '<td class="num">' + fmtPct(r.qty / (gradeQty || 1)) + '</td>' +
      '<td class="num">' + fmtPct(r.qty / totalQty) + '</td>' +
      '<td class="num">¥' + (r.amount / r.qty).toFixed(2) + '</td>';
    return tr;
  }
  function updateMoreText(btn, g, extraCount) {
    if (!extraCount) { btn.style.display = 'none'; return; }
    var meta = GRADE_META[g];
    btn.textContent = state.specOpen[g] ? '收起' + meta.name + '其余规格' : '查看 ' + meta.name + ' 全部规格 →';
  }

  /* ---------- 汇总渲染 ---------- */
  function computeAndRender() {
    var containers = filteredContainers().map(function (c) { return { market: c.market, brand: c.brand, amount: c.amount, qty: c.qty }; });
    var total = {
      containers: containers.length,
      amount: containers.reduce(function (a, c) { return a + c.amount; }, 0),
      qty: containers.reduce(function (a, c) { return a + c.qty; }, 0),
    };
    total.avg = total.qty ? total.amount / total.qty : 0;

    var ctx = document.getElementById('year-context');
    var marketLabel = state.market === 'all' ? '全部档口（' + DEMO.markets.length + '）' : state.market;
    ctx.textContent = marketLabel + ' · ' + META.country + ' · 覆盖 2026-01-02 ~ 09-20';

    renderKpis(total);
    var daily = buildDaily(filteredContainers());
    var monthly = buildMonthly(daily, filteredContainers());
    renderMonthly(monthly);
    renderDaily(daily);
    var leaves = filteredLeaves();
    renderGrades(leaves);
    renderMarketBrand(containers.map(function (c) { return c; }));
    renderSpecs(leaves);
  }

  /* ---------- 分段按钮 ---------- */
  function bindSeg(id, key, modes, onChange) {
    var wrap = document.getElementById(id);
    wrap.innerHTML = '';
    modes.forEach(function (m) {
      var btn = el('button', 'seg-btn' + (state[key] === m.key ? ' active' : ''));
      btn.type = 'button';
      btn.textContent = m.name;
      btn.setAttribute('aria-pressed', state[key] === m.key ? 'true' : 'false');
      btn.addEventListener('click', function () {
        state[key] = m.key;
        wrap.querySelectorAll('.seg-btn').forEach(function (b) {
          var isCur = b === btn;
          b.classList.toggle('active', isCur);
          b.setAttribute('aria-pressed', isCur ? 'true' : 'false');
        });
        onChange();
      });
      wrap.appendChild(btn);
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var containers = filteredContainers();
    var daily = buildDaily(containers);
    var monthly = buildMonthly(daily, containers);

    var mChart = echarts.init(document.getElementById('monthly-chart'));
    var dChart = echarts.init(document.getElementById('daily-chart'));
    charts.monthly = mChart;
    charts.daily = dChart;
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { mChart.resize(); dChart.resize(); });
      ro.observe(document.getElementById('monthly-chart'));
      ro.observe(document.getElementById('daily-chart'));
    }

    computeAndRender();

    bindSeg('monthly-seg', 'monthlyMode', MONTHLY_MODES, computeAndRender);
    bindSeg('daily-seg', 'dailyMode', DAILY_MODES, computeAndRender);
    bindSeg('mb-seg', 'mbMode', MB_MODES, computeAndRender);

    document.getElementById('f-market').addEventListener('change', function (e) {
      state.market = e.target.value;
      computeAndRender();
    });
    document.getElementById('f-apply').addEventListener('click', function () {
      computeAndRender();
    });
    document.getElementById('spec-brand-filter').addEventListener('change', function (e) {
      state.specBrand = e.target.value;
      renderSpecs(filteredLeaves());
    });
    document.getElementById('spec-grade-filter').addEventListener('change', function (e) {
      state.specGrade = e.target.value;
      renderSpecs(filteredLeaves());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
