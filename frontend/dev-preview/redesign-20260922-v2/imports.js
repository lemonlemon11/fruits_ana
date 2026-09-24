/* 录单 / 导入：双入口 + xlsx 多文件上传（预览→复核）+ 手工录单草稿提醒 + 最近导入批次与问题。 */
(function () {
  var page = document.getElementById('page');
  var state = { imports: [], draft: null, uploading: false };

  function tilesHtml() {
    return '<div class="page-head" style="padding-bottom:8px">' +
      '<h1 class="mobile-only" style="font-size:1.2rem">新一柜到了？先录进来</h1>' +
      '<p>支持结算单 xlsx 文件导入（可一次多份），也可以手工录单。</p></div>' +
      '<div class="entry-tiles">' +
      '<label class="entry-tile" for="file-input" style="cursor:pointer">' +
        '<span class="tile-icon tile-green">' + V2.icon('upload') + '</span>' +
        '<span><b>上传结算单文件</b><span>选择 xlsx，系统自动识别商号、等级与金额，确认后入库</span></span>' +
        '<span class="chev">' + V2.icon('chevD') + '</span></label>' +
      '<a class="entry-tile" href="entry.html">' +
        '<span class="tile-icon tile-orange">' + V2.icon('pen') + '</span>' +
        '<span><b>手工录单</b><span>没有电子结算单？照着纸质单逐项填写，可先暂存</span></span>' +
        '<span class="chev">' + V2.icon('chevD') + '</span></a>' +
      '</div>' +
      '<input id="file-input" type="file" accept=".xlsx" multiple style="display:none" />' +
      '<div class="upload-drop desktop-only" id="drop-zone" style="cursor:pointer">' +
        '<div class="up-ic">' + V2.icon('upload') + '</div>' +
        '<b id="drop-text">把 xlsx 文件拖到这里，或点击选择</b>' +
        '<p>仅支持新模板结算单（.xlsx），一次最多 10 份；上传后进入二次确认</p></div>';
  }

  function draftHtml() {
    var d = state.draft;
    if (!d) return '';
    return '<div class="card card-pad" style="margin-top:14px;border-left:4px solid var(--accent)">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<b>有 1 份暂存的手工录单</b><span class="status status-warn">草稿</span>' +
      '<span class="note">' + V2.esc(d.order_no || d.merchant_no || '') + ' · 已填 ' + V2.fmt.num(d.sales_count) + ' 行销售明细 · ' + V2.esc(V2.fmt.dt(d.updated_at)) + '</span>' +
      '<a href="entry.html" style="margin-left:auto;color:var(--brand-700);font-weight:700">继续录单 ›</a></div></div>';
  }

  function statusBadge(b) {
    var warn = Number(b.warning_count) > 0, fail = Number(b.failure_count) > 0;
    if (fail) return '<span class="status status-bad">失败 ' + b.failure_count + '</span>';
    if (warn) return '<span class="status status-warn">成功 · ' + b.warning_count + ' 提醒</span>';
    return '<span class="status status-ok">已确认</span>';
  }

  function listHtml() {
    var rows = state.imports;
    if (!rows.length) return '<div class="empty-box">还没有导入记录</div>';
    var table = '<div class="card table-card desktop-only"><table class="data-table"><thead><tr>' +
      '<th>商号 / 单号</th><th>文件</th><th>导入时间</th><th class="num">成功行</th><th>状态</th><th></th></tr></thead><tbody>' +
      rows.map(function (b) {
        return '<tr><td><b>' + V2.esc(b.merchant_no_normalized || b.merchant_no) + ' · ' + V2.esc(b.order_no_normalized || b.order_no || '—') + '</b></td>' +
          '<td>' + V2.esc(b.file_name || '—') + '</td>' +
          '<td>' + V2.esc(V2.fmt.dt(b.imported_at)) + '</td>' +
          '<td class="num">' + V2.fmt.num(b.success_count) + '</td>' +
          '<td>' + statusBadge(b) + '</td>' +
          '<td style="white-space:nowrap">' +
            (Number(b.warning_count) + Number(b.failure_count) > 0 ? '<a class="link" href="#" data-issues="' + b.id + '">问题 ›</a> ' : '') +
            '<a class="link" href="' + V2.detailUrl(b.merchant_no) + '">详情 ›</a></td></tr>';
      }).join('') + '</tbody></table></div>';
    var cards = '<div class="mobile-only">' + rows.map(function (b) {
      return '<a class="bill-card" href="' + V2.detailUrl(b.merchant_no) + '">' +
        '<div class="bill-head"><span class="bill-no">' + V2.esc(b.merchant_no_normalized || b.merchant_no) + ' · ' + V2.esc(b.order_no_normalized || b.order_no || '—') + '</span>' + statusBadge(b) + '</div>' +
        '<div class="bill-meta" style="margin-top:8px"><span>' + V2.esc(b.file_name || '') + '</span></div>' +
        '<div class="bill-meta"><span>导入于 <b>' + V2.esc(V2.fmt.dt(b.imported_at)) + '</b></span><span>成功 <b>' + V2.fmt.num(b.success_count) + '</b> 行</span></div></a>';
    }).join('') + '</div>';
    return '<div class="section-title"><h2>最近导入</h2><span class="more">共 ' + rows.length + ' 批</span></div>' + table + cards;
  }

  function issuesModal(batchId) {
    V2.api('/api/imports/' + batchId + '/issues').then(function (issues) {
      var mask = V2.el('div', 'modal-mask');
      var modal = V2.el('div', 'modal modal-lg');
      modal.innerHTML = '<h3>批次问题明细</h3><div class="modal-body">' +
        (issues.length ? issues.map(function (i) {
          return '<div class="issue-row">' + V2.icon('warn') +
            '<span>' + (i.row_number ? '第 ' + i.row_number + ' 行：' : '') + V2.esc(i.message || '') +
            (i.raw_value ? '（原值：' + V2.esc(i.raw_value) + '）' : '') +
            (i.resolved ? ' <span class="status status-ok">已处理</span>' : '') + '</span>' +
            (!i.resolved ? '<button class="btn btn-ghost" type="button" data-resolve="' + i.id + '" style="margin-left:auto;min-height:32px;font-size:.78rem;flex:none">标为已处理</button>' : '') +
            '</div>';
        }).join('') : '<p class="note">这批没有记录问题。</p>') +
        '</div><div class="modal-foot"><a class="btn btn-ghost" href="/api/imports/' + batchId + '/issues.csv">导出 CSV</a>' +
        '<button class="btn btn-primary" type="button" data-close>关 闭</button></div>';
      mask.appendChild(modal);
      document.body.appendChild(mask);
      modal.querySelector('[data-close]').addEventListener('click', function () { mask.remove(); });
      mask.addEventListener('click', function (ev) { if (ev.target === mask) mask.remove(); });
      modal.querySelectorAll('[data-resolve]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          V2.api('/api/imports/' + batchId + '/issues/' + btn.dataset.resolve + '/resolve', { method: 'POST' }).then(function () {
            V2.toast('已标记处理', 'ok');
            mask.remove();
            issuesModal(batchId);
          }).catch(function (e) { V2.toast(e.message, 'err'); });
        });
      });
    }).catch(function (e) { V2.toast('问题明细加载失败：' + e.message, 'err'); });
  }

  function upload(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /\.xlsx$/i.test(f.name); });
    if (!list.length) { V2.toast('只支持 .xlsx 文件', 'err'); return; }
    if (list.length > 10) { V2.toast('一次最多 10 份', 'err'); return; }
    if (state.uploading) return;
    state.uploading = true;
    var dropText = document.getElementById('drop-text');
    if (dropText) dropText.textContent = '正在上传并解析 ' + list.length + ' 份文件…';
    var form = new FormData();
    list.forEach(function (f) { form.append('files', f); });
    V2.api('/api/imports/preview', { method: 'POST', body: form }).then(function (job) {
      V2.toast('解析完成，进入复核', 'ok');
      location.href = 'import-review.html?job=' + encodeURIComponent(job.token);
    }).catch(function (e) {
      V2.toast('上传失败：' + e.message, 'err');
      if (dropText) dropText.textContent = '把 xlsx 文件拖到这里，或点击选择';
    }).finally(function () { state.uploading = false; });
  }

  function render() {
    page.innerHTML = tilesHtml() + draftHtml() + listHtml();
    var input = document.getElementById('file-input');
    var drop = document.getElementById('drop-zone');
    input.addEventListener('change', function () { upload(input.files); input.value = ''; });
    if (drop) {
      drop.addEventListener('click', function () { input.click(); });
      drop.addEventListener('dragover', function (ev) { ev.preventDefault(); });
      drop.addEventListener('drop', function (ev) { ev.preventDefault(); upload(ev.dataTransfer.files); });
    }
    page.querySelectorAll('[data-issues]').forEach(function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); issuesModal(a.dataset.issues); });
    });
  }

  function load() {
    Promise.all([
      V2.api('/api/imports'),
      V2.api('/api/entry/draft').catch(function () { return { draft: null }; })
    ]).then(function (rs) {
      var imports = rs[0];
      state.imports = Array.isArray(imports) ? imports : (imports && (imports.imports || imports.items)) || [];
      state.draft = rs[1] && rs[1].draft;
      render();
    }).catch(function (e) {
      page.innerHTML = '';
      page.appendChild(V2.errorBanner(e.message, load));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    V2.bootShell('imports').then(load);
  });
})();
