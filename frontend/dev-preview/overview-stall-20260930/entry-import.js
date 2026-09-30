/* 录单 / 导入 demo：导入批次与问题统计来自真实接口快照；手工录单为表单骨架（不提交、不写库）。 */
(function () {
  'use strict';
  var C = window.CORE;
  var D = null;

  function badge(status) {
    var map = { success: ['badge-success', '成功'], warning: ['badge-warning', '有警告'], failed: ['badge-failed', '失败'], pending: ['badge-pending', '待确认'] };
    var hit = map[status] || ['badge-pending', status || '未知'];
    return '<span class="badge ' + hit[0] + '">' + hit[1] + '</span>';
  }

  function fmtTime(s) { return s ? s.replace('T', ' ').slice(0, 16) : '–'; }

  function renderQuality() {
    var list = D.imports.imports || [];
    var warn = list.filter(function (b) { return b.status === 'warning'; }).length;
    var failed = list.filter(function (b) { return b.status === 'failed'; }).length;
    var pending = list.filter(function (b) { return b.status !== 'success' && b.status !== 'warning' && b.status !== 'failed'; }).length;
    var items = [
      ['累计批次', C.fmtInt(list.length), '个'],
      ['需关注批次', C.fmtInt(warn), warn ? '（有未处理警告）' : ''],
      ['失败批次', C.fmtInt(failed), failed ? '（需要重新导入）' : ''],
      ['等级口径', 'BC → C', '按管理端字段转换规则'],
    ];
    document.getElementById('quality-grid').innerHTML = items.map(function (m) {
      return '<div class="quality-item"><span class="kpi-label">' + m[0] + '</span>' +
        '<div class="quality-value">' + m[1] + (m[2] ? ' <small>' + m[2] + '</small>' : '') + '</div></div>';
    }).join('');
    document.getElementById('import-note').textContent =
      pending ? '另有 ' + pending + ' 条待确认草稿' : '全部批次已处理';
  }

  function renderBatches() {
    var list = D.imports.imports || [];
    var wrap = document.getElementById('batch-list');
    wrap.innerHTML = list.map(function (b) {
      var hasIssues = !!(D.importIssues && D.importIssues[b.id] && (D.importIssues[b.id].issues || []).length);
      var sub = '商号 ' + (b.merchant_no_normalized || b.merchant_no || '–') +
        ' · 单号 ' + (b.order_no_normalized || b.order_no || '–') +
        ' · ' + fmtTime(b.imported_at);
      var stats = '成功 ' + (b.success_count || 0) + ' 行' +
        (b.failure_count ? ' · 失败 ' + b.failure_count : '') +
        (b.unresolved_warnings ? ' · 未处理警告 ' + b.unresolved_warnings : '');
      return '<div class="batch-block">' +
        '<div class="batch-row">' +
        '<div><div class="batch-name" title="' + C.esc(b.file_name || '') + '">' + C.esc(b.file_name || '手工录单') + '</div>' +
        '<div class="batch-sub">' + C.esc(sub) + '</div></div>' +
        '<div>' + badge(b.status) + '</div>' +
        '<div class="batch-stat">' + stats + '</div>' +
        '<div class="batch-stat">' + C.esc(b.container_no ? '柜号 ' + b.container_no : '') + '</div>' +
        (hasIssues ? '<button type="button" class="batch-toggle" data-batch="' + b.id + '">查看问题</button>' : '<span class="batch-stat muted">无未处理问题</span>') +
        '</div>' +
        (hasIssues ? '<div class="batch-issues" id="issues-' + b.id + '" hidden></div>' : '') +
        '</div>';
    }).join('');
    wrap.querySelectorAll('.batch-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.batch;
        var panel = document.getElementById('issues-' + id);
        if (!panel) return;
        if (panel.hidden) {
          var issues = (D.importIssues[id] && D.importIssues[id].issues) || [];
          panel.innerHTML = '<table class="data-table"><thead><tr><th>行号</th><th>级别</th><th>类型</th><th>字段</th><th>说明</th><th>原始值</th></tr></thead><tbody>' +
            issues.slice(0, 20).map(function (it) {
              return '<tr><td>' + C.esc(it.row_number == null ? '–' : it.row_number) + '</td>' +
                '<td>' + C.esc(it.severity === 'error' ? '错误' : it.severity === 'warning' ? '警告' : (it.severity || '–')) + '</td>' +
                '<td>' + C.esc(it.issue_type || '–') + '</td>' +
                '<td>' + C.esc(it.field || '–') + '</td>' +
                '<td>' + C.esc(it.message || '–') + '</td>' +
                '<td>' + C.esc(it.raw_value == null || it.raw_value === '' ? '–' : it.raw_value) + '</td></tr>';
            }).join('') + '</tbody></table>' +
            (issues.length > 20 ? '<p class="picker-note">仅显示前 20 条，共 ' + issues.length + ' 条</p>' : '');
          panel.hidden = false;
          btn.textContent = '收起问题';
        } else {
          panel.hidden = true;
          btn.textContent = '查看问题';
        }
      });
    });
  }

  function fieldOptions(field) {
    return ((D.entryFieldOptions || {})[field] || []).map(function (o) { return o.value; });
  }
  function selectHtml(id, options, placeholder) {
    return '<select' + (id ? ' id="' + id + '"' : '') + '><option value="">' + placeholder + '</option>' +
      options.map(function (v) { return '<option value="' + C.esc(v) + '">' + C.esc(v) + '</option>'; }).join('') + '</select>';
  }

  function renderBaseForm() {
    var countries = (D.filterOptions.countries || []).map(function (c) { return c.name; });
    var cells = [
      ['商号 <span class="req">*</span>', '<input id="e-merchant" placeholder="如 444" />'],
      ['柜号 <span class="req">*</span>', '<input id="e-container" placeholder="如 HJX001" />'],
      ['单号 <span class="req">*</span>', '<input id="e-order" placeholder="如 香香-001" />'],
      ['转运车号 <span class="req">*</span>', '<input id="e-vehicle" placeholder="如 桂AX6166" />'],
      ['国家 <span class="req">*</span>', selectHtml('e-country', countries, '选择国家')],
      ['市场 <span class="req">*</span>', selectHtml('e-market', fieldOptions('market'), '选择市场')],
      ['到达市场日期 <span class="req">*</span>', '<input id="e-arrival" type="date" />'],
      ['来货数量（件） <span class="req">*</span>', '<input id="e-qty" type="number" min="0" placeholder="如 1990" />'],
    ];
    document.getElementById('base-form').innerHTML = cells.map(function (c) {
      return '<div class="form-field"><label>' + c[0] + '</label>' + c[1] + '</div>';
    }).join('');
  }

  function saleRowHtml() {
    var varieties = fieldOptions('variety');
    var grades = ['A', 'B', 'C', 'AB', 'BC', 'OTHER'];
    return '<tr>' +
      '<td><input type="date" /></td>' +
      '<td>' + selectHtml('', varieties, '品种') + '</td>' +
      '<td>' + selectHtml('', grades, '等级') + '</td>' +
      '<td><input placeholder="如 3" /></td>' +
      '<td><input placeholder="如 10" /></td>' +
      '<td><input placeholder="备注" /></td>' +
      '<td><input type="number" min="0" class="s-qty" placeholder="0" /></td>' +
      '<td><input type="number" min="0" class="s-price" placeholder="0" /></td>' +
      '<td class="calc s-amount">0</td></tr>';
  }

  function bindSales() {
    var body = document.getElementById('sales-body');
    body.innerHTML = saleRowHtml() + saleRowHtml() + saleRowHtml();
    document.getElementById('add-sale-row').addEventListener('click', function () {
      if (body.children.length >= 8) return;
      body.insertAdjacentHTML('beforeend', saleRowHtml());
    });
    body.addEventListener('input', function (e) {
      var row = e.target.closest('tr');
      if (!row) return;
      var qty = Number(row.querySelector('.s-qty').value) || 0;
      var price = Number(row.querySelector('.s-price').value) || 0;
      row.querySelector('.s-amount').textContent = C.fmtMoney(qty * price);
      renderSettle();
    });
  }

  function bindAfterAndFees() {
    document.getElementById('after-body').innerHTML =
      '<tr><td><input placeholder="如 抽检补果" /></td><td><input placeholder="摘要" /></td><td><input type="number" min="0" class="a-amount" placeholder="0" /></td></tr>' +
      '<tr><td><input placeholder="内容" /></td><td><input placeholder="摘要" /></td><td><input type="number" min="0" class="a-amount" placeholder="0" /></td></tr>';
    document.getElementById('fee-body').innerHTML =
      '<tr><td><input placeholder="费用名（如 柜租）" /></td><td><input placeholder="摘要" /></td><td><input type="number" min="0" class="f-amount" placeholder="0" /></td></tr>' +
      '<tr><td><input placeholder="费用名（如 报关）" /></td><td><input placeholder="摘要" /></td><td><input type="number" min="0" class="f-amount" placeholder="0" /></td></tr>';
    ['after-body', 'fee-body'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', renderSettle);
    });
  }

  function renderSettle() {
    var sum = function (cls) {
      return Array.prototype.reduce.call(document.querySelectorAll('.' + cls), function (a, el) {
        return a + (Number(el.value) || 0);
      }, 0);
    };
    var qty = sum('s-qty');
    var sales = sum('s-amount') || Array.prototype.reduce.call(document.querySelectorAll('#sales-body tr'), function (a, row) {
      return a + (Number(row.querySelector('.s-qty').value) || 0) * (Number(row.querySelector('.s-price').value) || 0);
    }, 0);
    var after = sum('a-amount');
    var fee = sum('f-amount');
    var goods = sales - after;
    var items = [
      ['总件数', C.fmtInt(qty), '件'],
      ['销售金额', C.fmtMoney(sales), ''],
      ['售后合计', C.fmtMoney(after), ''],
      ['货款合计', C.fmtMoney(goods), ''],
      ['费用合计', C.fmtMoney(fee), ''],
      ['应付贵方总金额', C.fmtMoney(goods - fee), '（RMB）'],
    ];
    document.getElementById('settle-summary').innerHTML = items.map(function (m) {
      return '<div class="metric-item"><div class="metric-label">' + m[0] + '</div>' +
        '<div class="metric-value">' + m[1] + (m[2] ? ' <small>' + m[2] + '</small>' : '') + '</div></div>';
    }).join('');
  }

  function toast(msg) {
    var t = C.el('div', 'demo-toast', C.esc(msg));
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function init() {
    C.renderShell('entry', '录单 / 导入', '两种录单方式与数据质量概览（真实接口数据，demo 不写库）',
      '<div class="chip date-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>' +
      '<span class="chip-label">数据截至</span><strong>' + (window.REAL_DATA ? window.REAL_DATA.fetchedAt : '') + '</strong></div>');

    if (!C.data()) { C.showMissingData(); return; }
    D = C.data();

    renderQuality();
    renderBatches();
    renderBaseForm();
    bindSales();
    bindAfterAndFees();
    renderSettle();

    document.getElementById('mode-upload').addEventListener('click', function () {
      toast('demo 演示：真实上传入口见系统「录单 / 导入」页');
    });
    document.getElementById('mode-entry').addEventListener('click', function () {
      document.getElementById('manual-entry').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('entry-submit').addEventListener('click', function () {
      toast('demo 演示：保存不会写入系统库');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
