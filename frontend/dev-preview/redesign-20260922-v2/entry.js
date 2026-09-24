/* 手工录单：分步手风琴表单（市场/品种来自字段选项），支持暂存草稿、恢复草稿、保存（冲突二次确认覆盖）、编辑已有手工单。 */
(function () {
  var page = document.getElementById('page');
  var editMerchant = '';
  var form = null;
  var state = { saving: false };

  function headerHtml() {
    return '<div class="backbar mobile-only"><a class="back" href="imports.html" aria-label="返回录单导入">' + V2.icon('back') + '</a><h1>' + (editMerchant ? '修改手工单' : '手工录单') + '</h1></div>' +
      '<div class="card card-pad" style="border-left:4px solid var(--brand-600)">' +
      '<b>照着纸质结算单填，带 <span style="color:var(--danger)">*</span> 为必填</b>' +
      '<p class="note" style="margin-top:4px">随时可点「暂存」，下次打开自动恢复；保存后进入正式数据。</p></div><div style="height:14px"></div>';
  }

  function actionBar() {
    var old = document.querySelector('.action-bar');
    if (old) old.remove();
    var bar = V2.el('div', 'action-bar');
    bar.innerHTML =
      '<button class="btn btn-ghost" type="button" id="draft-btn">暂存草稿</button>' +
      '<button class="btn btn-primary" type="button" id="save-btn">' + V2.icon('check') + (editMerchant ? ' 保存修改' : ' 保存这张单') + '</button>';
    document.body.appendChild(bar);
    document.getElementById('draft-btn').addEventListener('click', saveDraft);
    document.getElementById('save-btn').addEventListener('click', function () { save(false); });
  }

  function saveDraft() {
    if (!form) return;
    var p = form.getPayload();
    V2.api('/api/entry/draft', {
      method: 'PUT',
      body: { editing: !!editMerchant, merchant_no: p.merchant_no, order_no: p.order_no, payload: Object.assign({ overwrite: false }, p) }
    }).then(function () {
      V2.toast('已暂存，下次打开自动恢复', 'ok');
    }).catch(function (e) { V2.toast('暂存失败：' + e.message, 'err'); });
  }

  function save(overwrite) {
    if (!form || state.saving) return;
    var err = form.validate();
    if (err) { V2.toast(err, 'err'); return; }
    state.saving = true;
    var p = form.getPayload();
    var body = Object.assign({ overwrite: overwrite === true }, p);
    var req = editMerchant
      ? V2.api('/api/entry/' + encodeURIComponent(editMerchant), { method: 'PUT', body: body })
      : V2.api('/api/entry', { method: 'POST', body: body });
    req.then(function (res) {
      V2.toast('已保存', 'ok');
      V2.api('/api/entry/draft', { method: 'DELETE' }).catch(function () {});
      var merchant = (res && res.merchant_no) || p.merchant_no;
      location.href = V2.detailUrl(merchant);
    }).catch(function (e) {
      if (e.status === 409) {
        V2.confirmModal({
          title: '商号已存在',
          danger: true,
          okText: '覆盖旧单',
          body: V2.esc(e.message) + '<br><b>覆盖后旧数据不可恢复。</b>'
        }).then(function (ok) { if (ok) save(true); });
      } else {
        V2.toast('保存失败：' + e.message, 'err');
      }
    }).finally(function () { state.saving = false; });
  }

  function load() {
    Promise.all([
      V2.api('/api/entry/field-options?field=market').catch(function () { return { options: [] }; }),
      V2.api('/api/entry/field-options?field=variety').catch(function () { return { options: [] }; })
    ]).then(function (rs) {
      var markets = ((rs[0] && rs[0].options) || []).map(function (o) { return o.value; });
      var varieties = ((rs[1] && rs[1].options) || []).map(function (o) { return o.value; });
      form = new V2.EntryForm({ mode: 'manual', markets: markets, varieties: varieties });
      page.innerHTML = headerHtml();
      page.appendChild(form.root);
      form.render();
      actionBar();

      if (editMerchant) {
        return V2.api('/api/entry/' + encodeURIComponent(editMerchant)).then(function (entry) {
          form.setPayload(entry);
        }).catch(function (e) { V2.toast('读取手工单失败：' + e.message, 'err'); });
      }
      return V2.api('/api/entry/draft').then(function (d) {
        if (d && d.draft && d.draft.payload) {
          form.setPayload(d.draft.payload);
          V2.toast('已恢复上次暂存的草稿', 'ok');
        } else if (form.payload.sales.length === 0) {
          form.payload.sales.push({ sale_date: '', variety: '', head_count: '', spec_kg: '', sales_quantity: '', unit_price: '', amount: null, remark: '' });
          form.render();
        }
      }).catch(function () {
        if (form.payload.sales.length === 0) { form.payload.sales.push({ sale_date: '', variety: '', head_count: '', spec_kg: '', sales_quantity: '', unit_price: '', amount: null, remark: '' }); form.render(); }
      });
    }).catch(function (e) {
      page.innerHTML = '';
      page.appendChild(V2.errorBanner(e.message, load));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    editMerchant = V2.qs().get('edit') || '';
    V2.bootShell('entry').then(load);
  });
})();
