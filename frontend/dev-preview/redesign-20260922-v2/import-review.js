/* 导入复核：按草稿手风琴展示解析结果，问题标红；支持修改草稿、确认导入（冲突需二次确认）、放弃任务。 */
(function () {
  var page = document.getElementById('page');
  var jobToken = '';
  var state = { job: null, drafts: {}, markets: [], varieties: [], confirming: false };

  function draftState(token) { return state.drafts[token]; }

  function loadJob() {
    page.innerHTML = V2.skeletonCards(3);
    Promise.all([
      V2.api('/api/imports/jobs/' + encodeURIComponent(jobToken)),
      V2.api('/api/entry/field-options?field=market').catch(function () { return { options: [] }; }),
      V2.api('/api/entry/field-options?field=variety').catch(function () { return { options: [] }; })
    ]).then(function (rs) {
      state.job = rs[0];
      state.markets = ((rs[1] && rs[1].options) || []).map(function (o) { return o.value; });
      state.varieties = ((rs[2] && rs[2].options) || []).map(function (o) { return o.value; });
      render();
      var drafts = (state.job && state.job.drafts) || [];
      return Promise.all(drafts.map(function (d) {
        return V2.api('/api/imports/jobs/' + encodeURIComponent(jobToken) + '/drafts/' + encodeURIComponent(d.token))
          .then(function (full) { state.drafts[d.token] = { data: full, form: null, dirty: false, error: null }; })
          .catch(function (e) { state.drafts[d.token] = { data: null, form: null, dirty: false, error: e.message }; });
      })).then(render);
    }).catch(function (e) {
      page.innerHTML = '';
      page.appendChild(V2.errorBanner(e.message, loadJob));
    });
  }

  function issueBadge(d) {
    if (d.has_error) return '<span class="status badge-n status-bad">有问题</span>';
    if (Number(d.issue_count) > 0) return '<span class="status badge-n status-warn">' + d.issue_count + ' 处提醒</span>';
    return '<span class="status badge-n status-ok">可提交</span>';
  }

  function issuesHtml(issues) {
    if (!issues || !issues.length) return '';
    return '<div class="divider"></div>' + issues.map(function (i) {
      var bad = i.severity === 'error';
      return '<div class="issue-row"' + (bad ? '' : ' style="background:#fdf6ea"') + '>' + V2.icon('warn') +
        '<span>' + (bad ? '<b style="color:var(--danger)">阻断</b> ' : '<b style="color:var(--accent-strong)">提醒</b> ') +
        (i.row ? '第 ' + i.row + ' 行 · ' : '') + V2.esc(i.message || '') +
        (i.raw_value ? '（原值：' + V2.esc(i.raw_value) + '）' : '') + '</span></div>';
    }).join('');
  }

  function draftAccHtml(d) {
    var ds = draftState(d.token);
    var open = d.has_error ? ' open' : '';
    var html = '<div class="acc' + open + '" data-acc="' + V2.esc(d.token) + '">' +
      '<button class="acc-head" type="button">' +
      '<span style="width:19px;height:19px;color:' + (d.has_error ? 'var(--danger)' : 'var(--brand-700)') + ';display:inline-flex">' + V2.icon('doc') + '</span>' +
      '<span class="acc-name">' + V2.esc(d.file_name) + '</span>' + issueBadge(d) +
      '<span class="chev">' + V2.icon('chevD') + '</span></button><div class="acc-body">';
    if (!ds) html += '<div class="skel" style="height:60px"></div>';
    else if (ds.error) html += '<div class="error-banner"><span><strong>草稿加载失败</strong> ' + V2.esc(ds.error) + '</span></div>';
    else html += '<div data-form="' + V2.esc(d.token) + '"></div>' +
      '<div class="flex-between mt8"><span class="note" data-dirty="' + V2.esc(d.token) + '"></span>' +
      '<button class="btn btn-ghost" type="button" data-save="' + V2.esc(d.token) + '" style="min-height:40px;font-size:.84rem">保存这份修改</button></div>';
    return html + '</div></div>';
  }

  function failuresHtml() {
    var failures = (state.job && state.job.failures) || [];
    if (!failures.length) return '';
    return '<div class="card card-pad alert-card" style="margin-bottom:14px"><b>' + failures.length + ' 份文件解析失败</b>' +
      failures.map(function (f) {
        return '<div class="alert-row">' + V2.icon('warn') + '<span><b>' + V2.esc(f.file_name) + '</b>：' + V2.esc(f.error) + '</span></div>';
      }).join('') + '</div>';
  }

  function render() {
    var job = state.job;
    if (!job) return;
    var drafts = job.drafts || [];
    page.innerHTML =
      '<div class="backbar mobile-only"><a class="back" href="imports.html" aria-label="返回录单导入">' + V2.icon('back') + '</a><h1>导入复核</h1></div>' +
      '<div class="page-head" style="padding-bottom:8px"><p>确认前请逐份核对：系统金额与文件合计是否一致、问题行是否需要修改。确认后才会写入正式数据。</p></div>' +
      failuresHtml() +
      drafts.map(draftAccHtml).join('') +
      '<div style="height:12px"></div>';

    var bar = V2.el('div', 'action-bar');
    bar.innerHTML =
      '<button class="btn btn-ghost" type="button" id="discard-btn">放弃本次导入</button>' +
      '<button class="btn btn-primary" type="button" id="confirm-btn">' + V2.icon('check') + ' 确认导入（' + drafts.length + ' 份）</button>';
    var old = document.querySelector('.action-bar');
    if (old) old.remove();
    document.body.appendChild(bar);

    drafts.forEach(function (d) {
      var ds = draftState(d.token);
      if (!ds || !ds.data) return;
      if (!ds.form) {
        ds.form = new V2.EntryForm({ mode: 'review', markets: state.markets, varieties: state.varieties });
        var mount = page.querySelector('[data-form="' + d.token + '"]');
        if (mount) {
          mount.appendChild(ds.form.root);
          var payload = ds.data.payload || {};
          ds.form.setPayload(payload);
          var issueBox = V2.el('div', null, issuesHtml(payload.issues));
          if (issueBox.innerHTML) mount.insertBefore(issueBox, ds.form.root);
        }
      }
      var saveBtn = page.querySelector('[data-save="' + d.token + '"]');
      if (saveBtn) saveBtn.addEventListener('click', function () { saveDraft(d.token); });
    });

    page.querySelectorAll('.acc-head').forEach(function (head) {
      head.addEventListener('click', function () { head.parentElement.classList.toggle('open'); });
    });
    document.getElementById('confirm-btn').addEventListener('click', function () { confirm(false); });
    document.getElementById('discard-btn').addEventListener('click', discard);
  }

  function saveDraft(token) {
    var ds = draftState(token);
    if (!ds || !ds.form) return;
    var err = ds.form.validate();
    if (err) { V2.toast(err, 'err'); return; }
    var p = ds.form.getPayload();
    V2.api('/api/imports/jobs/' + encodeURIComponent(jobToken) + '/drafts/' + encodeURIComponent(token), {
      method: 'PUT',
      body: {
        merchant_no: p.merchant_no, order_no: p.order_no, container_no: p.container_no, vehicle_no: p.vehicle_no,
        market: p.market, arrival_date: p.arrival_date, arrival_quantity: p.arrival_quantity,
        sales: p.sales, after_sales: p.after_sales, fees: p.fees, overwrite: false
      }
    }).then(function () {
      var dirty = page.querySelector('[data-dirty="' + token + '"]');
      if (dirty) dirty.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      V2.toast('已保存这份草稿', 'ok');
    }).catch(function (e) { V2.toast('保存失败：' + e.message, 'err'); });
  }

  function confirm(force) {
    if (state.confirming) return;
    state.confirming = true;
    var btn = document.getElementById('confirm-btn');
    if (btn) btn.disabled = true;
    V2.api('/api/imports/jobs/' + encodeURIComponent(jobToken) + '/confirm', {
      method: 'POST', body: { force: force === true }
    }).then(function (res) {
      var items = (res && res.confirmed) || [];
      V2.confirmModal({
        title: '导入完成',
        okText: '去看每一单',
        body: items.map(function (i) {
          return '<div style="padding:6px 0">' + V2.esc(i.file_name) + ' → 商号 <b>' + V2.esc(i.merchant_no) + '</b>' +
            '（' + V2.esc(i.status) + (i.error_count ? '，' + i.error_count + ' 错误' : '') + (i.warning_count ? '，' + i.warning_count + ' 提醒' : '') + '）</div>';
        }).join('') || '已全部写入。'
      }).then(function () { location.href = 'settlements.html'; });
    }).catch(function (e) {
      if (e.status === 409) {
        V2.confirmModal({
          title: '确认前请二次确认',
          danger: true,
          okText: '仍要导入',
          body: (e.message || '存在阻断或冲突') + '<br><b>继续导入将按规则覆盖 / 跳过对应单据。</b>'
        }).then(function (ok) { if (ok) confirm(true); });
      } else {
        V2.toast('确认失败：' + e.message, 'err');
      }
    }).finally(function () {
      state.confirming = false;
      if (btn) btn.disabled = false;
    });
  }

  function discard() {
    V2.confirmModal({
      title: '放弃本次导入',
      danger: true,
      okText: '放弃',
      body: '本任务下所有草稿都会被丢弃，已上传的文件不会写入正式数据。确定吗？'
    }).then(function (ok) {
      if (!ok) return;
      V2.api('/api/imports/jobs/' + encodeURIComponent(jobToken) + '/discard', { method: 'POST' })
        .then(function () { location.href = 'imports.html'; })
        .catch(function (e) { V2.toast(e.message, 'err'); });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    jobToken = V2.qs().get('job') || '';
    if (!jobToken) {
      page.innerHTML = '<div class="empty-box">缺少 job 参数，请从 <a class="link" href="imports.html">录单 / 导入</a> 上传文件进入。</div>';
      return;
    }
    V2.bootShell('import-review').then(loadJob);
  });
})();
