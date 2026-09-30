/* 结算单列表 demo：真实快照数据，客户端筛选/排序/分页（与服务端参数同口径）。 */
(function () {
  'use strict';
  var C = window.CORE;
  var D = null;
  var state = { merchant: 'all', brand: 'all', sortBy: null, sortOrder: 'desc', page: 1, pageSize: 10 };

  var COLUMNS = [
    { key: 'merchant_no', label: '商号', sortable: false },
    { key: 'brand', label: '品牌', sortable: false },
    { key: 'order_no_normalized', label: '单号', sortable: false },
    { key: 'arrival_date', label: '到达市场日期', sortable: true },
    { key: 'total_quantity', label: '总件数', sortable: true, num: true },
    { key: 'grade_a', label: 'A果件数', sortable: true, num: true },
    { key: 'grade_b', label: 'B果件数', sortable: true, num: true },
    { key: 'sales_amount', label: '销售金额', sortable: true, num: true },
    { key: 'average_price', label: '每件均价', sortable: true, num: true },
    { key: 'confirmed_at', label: '录单时间', sortable: true },
    { key: 'ops', label: '操作', sortable: false },
  ];

  function rows() {
    return D.settlementsList.settlements.filter(function (it) {
      if (state.merchant !== 'all' && it.merchant_no !== state.merchant) return false;
      if (state.brand !== 'all' && (it.brand || '未识别品牌') !== state.brand) return false;
      return true;
    });
  }

  function sorted(list) {
    if (!state.sortBy) return list;
    var key = state.sortBy;
    var dir = state.sortOrder === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var va = valueOf(a, key), vb = valueOf(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -1 * dir : va > vb ? dir : 0;
    });
  }
  function valueOf(it, key) {
    if (key === 'grade_a') return (it.grade_quantities && it.grade_quantities.A) || 0;
    if (key === 'grade_b') return (it.grade_quantities && it.grade_quantities.B) || 0;
    if (key === 'confirmed_at') return it.confirmed_at || null;
    return it[key] == null ? null : it[key];
  }

  function fmtTime(s) {
    return s ? s.replace('T', ' ').slice(0, 16) : '–';
  }

  function render() {
    var all = rows();
    var list = sorted(all);
    var pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > pages) state.page = pages;
    var pageRows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    document.getElementById('list-count').textContent =
      '共 ' + all.length + ' 张 · ' + C.fmtInt(all.reduce(function (a, r) { return a + r.total_quantity; }, 0)) + ' 件 · 第 ' + state.page + ' / ' + pages + ' 页';
    var bt = D.settlementsList.brand_totals || [];
    document.getElementById('brand-count').textContent = bt.map(function (b) {
      return b.brand + ' ' + b.settlement_count + ' 柜';
    }).join(' · ');

    document.getElementById('list-head').innerHTML = '<tr>' + COLUMNS.map(function (col) {
      var isSorted = state.sortBy === col.key;
      return '<th class="' + (col.sortable ? 'sortable' : '') + (isSorted ? ' sorted' : '') + (col.num ? ' num' : '') + '"' +
        (col.sortable ? ' data-key="' + col.key + '" title="点击排序"' : '') + '>' + col.label +
        (col.sortable ? '<span class="arrow">' + (isSorted ? (state.sortOrder === 'asc' ? '▲' : '▼') : '⇅') + '</span>' : '') + '</th>';
    }).join('') + '</tr>';
    document.querySelectorAll('#list-head th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.key;
        if (state.sortBy === key) {
          state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortBy = key;
          state.sortOrder = 'desc';
        }
        render();
      });
    });

    document.getElementById('list-body').innerHTML = pageRows.map(function (it) {
      var gq = it.grade_quantities || {};
      return '<tr>' +
        '<td><span class="cell-main" title="' + C.esc(it.merchant_no) + '">' + C.esc(it.merchant_no_normalized || it.merchant_no) + '</span></td>' +
        '<td>' + C.esc(it.brand || '未识别品牌') + '</td>' +
        '<td><span class="cell-main">' + C.esc(it.order_no_normalized || it.order_no) + '</span>' +
        (it.order_no && it.order_no !== (it.order_no_normalized || it.order_no) ? '<div class="cell-sub" title="原始单号">' + C.esc(it.order_no) + '</div>' : '') + '</td>' +
        '<td>' + C.esc(it.arrival_date || '–') + '</td>' +
        '<td class="num">' + C.fmtInt(it.total_quantity) + '</td>' +
        '<td class="num">' + C.fmtInt(gq.A || 0) + '</td>' +
        '<td class="num">' + C.fmtInt(gq.B || 0) + '</td>' +
        '<td class="num">' + C.fmtMoney(it.sales_amount) + '</td>' +
        '<td class="num">' + (it.average_price == null ? '–' : '¥' + it.average_price.toFixed(2)) + '</td>' +
        '<td class="muted">' + fmtTime(it.confirmed_at) + '</td>' +
        '<td><button type="button" class="op-link" data-m="' + C.esc(it.merchant_no) + '">查看明细</button>' +
        '<button type="button" class="op-link disabled" disabled title="demo 未接导出接口">Excel</button>' +
        '<button type="button" class="op-link disabled" disabled title="demo 未接导出接口">PDF</button>' +
        '<button type="button" class="op-link danger disabled" disabled title="demo 不提供删除">删除</button></td>' +
        '</tr>';
    }).join('');
    document.querySelectorAll('#list-body .op-link[data-m]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        location.href = 'detail.html?m=' + encodeURIComponent(btn.dataset.m);
      });
    });

    var pager = document.getElementById('pager');
    var btns = '';
    btns += '<button type="button" class="page-btn" data-p="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>‹</button>';
    for (var i = 1; i <= pages; i++) {
      btns += '<button type="button" class="page-btn' + (i === state.page ? ' current' : '') + '" data-p="' + i + '">' + i + '</button>';
    }
    btns += '<button type="button" class="page-btn" data-p="' + (state.page + 1) + '"' + (state.page >= pages ? ' disabled' : '') + '>›</button>';
    pager.innerHTML = btns + '<span class="page-info">共 ' + list.length + ' 张</span>';
    pager.querySelectorAll('.page-btn[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = Number(b.dataset.p);
        if (p >= 1 && p <= pages) { state.page = p; render(); }
      });
    });
  }

  function init() {
    C.renderShell('list', '结算单列表', '每一单的到达、销售与录单情况（真实接口数据）',
      '<div class="chip date-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>' +
      '<span class="chip-label">销售日期</span><strong>' + (window.REAL_DATA ? window.REAL_DATA.apiWindow.start.replace(/-/g, '/') + ' → ' + window.REAL_DATA.apiWindow.end.replace(/-/g, '/') : '') + '</strong></div>' +
      '<label class="chip select-chip"><span class="chip-label">商号</span><select id="f-merchant"><option value="all">全部结算单</option></select></label>' +
      '<label class="chip select-chip"><span class="chip-label">品牌</span><select id="f-brand"><option value="all">全部品牌</option></select></label>' +
      '<button type="button" class="apply-btn" id="f-apply">应用</button>');

    if (!C.data()) { C.showMissingData(); return; }
    D = C.data();

    var mSel = document.getElementById('f-merchant');
    D.settlementsList.settlements.forEach(function (it) {
      var opt = document.createElement('option');
      opt.value = it.merchant_no;
      opt.textContent = (it.merchant_no_normalized || it.merchant_no) + '（' + (it.order_no_normalized || it.order_no) + '）';
      mSel.appendChild(opt);
    });
    var bSel = document.getElementById('f-brand');
    (D.filterOptions.brands || []).forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      bSel.appendChild(opt);
    });
    document.getElementById('f-apply').addEventListener('click', function () {
      state.merchant = mSel.value;
      state.brand = bSel.value;
      state.page = 1;
      render();
    });

    /* 支持 detail 页返回时带 ?page= */
    var q = new URLSearchParams(location.search);
    var p = Number(q.get('page'));
    if (p >= 1) state.page = p;
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
