/* 53002 档口 demo 共享外壳与工具（真实数据版）。
 * 所有页面共用：侧栏（按真实系统菜单分组）/ 顶栏骨架 / 格式化 / 等级色 / ECharts 底座。
 * 数据只来自 real-data.js（tmp/stall-demo/fetch_real_data.py 拉取的真实接口快照，
 * 本地文件不入库）；缺失时给出引导提示，不渲染假数据。 */
(function () {
  'use strict';

  var GRADE_META = {
    A: { name: 'A果', color: '#1E7A4F' },
    B: { name: 'B果', color: '#D9820B' },
    C: { name: 'C果（含BC）', color: '#D64545' },
    AB: { name: 'AB果', color: '#8A5CD4' },
    OTHER: { name: '其他', color: '#8A94A1' },
  };
  var NAV = [
    { group: null, items: [{ key: 'overview', label: '销售总览', href: 'index.html', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>' }] },
    { group: '销售单管理', items: [
      { key: 'list', label: '结算单列表', href: 'list.html', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h8M8 14h5"/>' },
      { key: 'entry', label: '录单 / 导入', href: 'entry-import.html', icon: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>' },
    ] },
    { group: '销售分析', items: [
      { key: 'detail', label: '结算单详情', href: 'detail.html', icon: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/>' },
      { key: 'compare', label: '销售对比', href: 'comparison.html', icon: '<rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="9" width="7" height="10" rx="1.5"/>' },
    ] },
  ];

  function data() {
    if (!window.REAL_DATA) return null;
    return window.REAL_DATA;
  }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('zh-CN'); }
  function fmtMoney(n) { return '¥' + fmtInt(n); }
  function fmtMoney2(n) {
    return '¥' + (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtWanMoney(n) { return '¥' + ((Number(n) || 0) / 10000).toFixed(1) + ' 万'; }
  function fmtPct(x) { return x == null ? '–' : (x * 100).toFixed(1) + '%'; }
  function md(s) { return s ? s.slice(5) : ''; }
  function gradeMeta(grade) {
    return GRADE_META[grade] || { name: grade || '其他', color: '#64748B' };
  }

  function renderShell(activeKey, title, subtitle, filtersHtml) {
    var sidebar = document.getElementById('sidebar');
    var D = data();
    var groupsHtml = '';
    NAV.forEach(function (g) {
      groupsHtml += '<div class="nav-group">';
      if (g.group) groupsHtml += '<div class="nav-group-title">' + esc(g.group) + '</div>';
      g.items.forEach(function (it) {
        var isActive = it.key === activeKey;
        groupsHtml +=
          '<a class="nav-item' + (isActive ? ' active' : '') + '"' +
          (isActive ? ' aria-current="page"' : '') + ' href="' + it.href + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + it.icon + '</svg>' +
          esc(it.label) + '</a>';
      });
      groupsHtml += '</div>';
    });
    var fetchedAt = D ? D.fetchedAt : '—';
    sidebar.innerHTML =
      '<div class="brand"><span class="brand-mark" aria-hidden="true"><i></i></span>' +
      '<div class="brand-text"><strong>SLD</strong><span>水果市场销售分析</span></div></div>' +
      '<nav class="nav" aria-label="主导航">' + groupsHtml + '</nav>' +
      '<footer class="sidebar-foot"><span class="foot-badge">demo v2.0 · 真实数据</span>' +
      '<span>数据截至 ' + esc(fetchedAt) + ' · 接口快照</span><span>视觉伴侣 53002</span></footer>';

    var topbar = document.getElementById('topbar');
    topbar.innerHTML =
      '<div class="title-wrap"><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div>' +
      '<div class="filters">' + (filtersHtml || '') + '</div>';
  }

  function showMissingData() {
    var main = document.querySelector('.main');
    if (!main) return;
    main.innerHTML =
      '<div class="card data-missing-card">' +
      '<h2>真实数据快照未生成</h2>' +
      '<p>本 demo 只呈现真实接口数据，本地缺少 <code>real-data.js</code>。请在服务器上执行：</p>' +
      '<pre>.venv/bin/python tmp/stall-demo/fetch_real_data.py</pre>' +
      '<p>脚本只调用现有只读接口，不写库、不改动后端。</p></div>';
  }

  /* ECharts 底座：统一 tooltip/主题 + ResizeObserver 跟随容器（防画布溢出） */
  var ro = null;
  function makeChart(elId) {
    var node = document.getElementById(elId);
    var chart = echarts.init(node);
    if (typeof ResizeObserver !== 'undefined') {
      if (!ro) ro = new ResizeObserver(function (entries) {
        entries.forEach(function (e) {
          var inst = echarts.getInstanceByDom(e.target);
          if (inst) inst.resize();
        });
      });
      ro.observe(node);
    }
    return chart;
  }
  function tooltipBase() {
    return {
      trigger: 'axis',
      backgroundColor: '#fff', borderColor: '#E3EAE5', padding: [10, 14],
      textStyle: { color: '#1F2937', fontSize: 13 },
      extraCssText: 'box-shadow:0 8px 24px rgba(23,58,45,.12);border-radius:10px;',
    };
  }

  /* 按结算单归属月聚合：柜数按到达月（settlementsList），金额/件数按销售月（trend 求和） */
  function monthlySeries(trend, windowStart, windowEnd) {
    var sale = {};
    (trend || []).forEach(function (r) {
      var m = r.sale_date.slice(0, 7);
      if (!sale[m]) sale[m] = { amount: 0, qty: 0 };
      sale[m].amount += r.sales_amount;
      sale[m].qty += r.sales_quantity;
    });
    var months = [];
    var cur = new Date(Number(windowStart.slice(0, 4)), Number(windowStart.slice(5, 7)) - 1, 1);
    var end = new Date(Number(windowEnd.slice(0, 4)), Number(windowEnd.slice(5, 7)) - 1, 1);
    while (cur <= end) {
      var key = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
      var s = sale[key] || { amount: 0, qty: 0 };
      months.push({ month: key, label: (cur.getMonth() + 1) + '月', amount: s.amount, qty: s.qty });
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  }

  /* 柜数按到达月（settlementsList 过滤后的行） */
  function arrivalsByMonth(items) {
    var map = {};
    (items || []).forEach(function (it) {
      if (!it.arrival_date) return;
      var m = it.arrival_date.slice(0, 7);
      map[m] = (map[m] || 0) + 1;
    });
    return map;
  }

  /* 通用分段按钮组 */
  function bindSeg(id, get, set, onChange) {
    var wrap = document.getElementById(id);
    if (!wrap) return;
    wrap.querySelectorAll('.seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        set(btn.dataset.value);
        wrap.querySelectorAll('.seg-btn').forEach(function (b) {
          var isCur = b === btn;
          b.classList.toggle('active', isCur);
          b.setAttribute('aria-pressed', isCur ? 'true' : 'false');
        });
        onChange();
      });
    });
  }
  function segHtml(id, modes, current) {
    return '<div class="seg" id="' + id + '" role="group">' + modes.map(function (m) {
      return '<button type="button" class="seg-btn' + (m.key === current ? ' active' : '') + '" data-value="' + m.key + '" aria-pressed="' + (m.key === current) + '">' + esc(m.name) + '</button>';
    }).join('') + '</div>';
  }

  window.CORE = {
    data: data, el: el, esc: esc,
    fmtInt: fmtInt, fmtMoney: fmtMoney, fmtMoney2: fmtMoney2, fmtWanMoney: fmtWanMoney, fmtPct: fmtPct,
    md: md, gradeMeta: gradeMeta,
    renderShell: renderShell, showMissingData: showMissingData,
    makeChart: makeChart, tooltipBase: tooltipBase,
    monthlySeries: monthlySeries, arrivalsByMonth: arrivalsByMonth,
    bindSeg: bindSeg, segHtml: segHtml,
  };
})();
