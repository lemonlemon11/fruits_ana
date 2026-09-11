/* 等级细分设计稿的渲染逻辑：纯前端、无依赖，数据来自 grade-detail-data.js。 */
(() => {
  const D = window.GRADE_DETAIL;
  if (!D) return;

  const GRADE_NAME = { A: 'A 果', B: 'B 果', C: 'C 果（含 BC）' };
  const SCHEME_TAG = { A: '已确认', B: '会重复计算', C: '会低估大号' };
  const num = (v, digits = 0) =>
    Number(v).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const share = (v) => `${((v / D.meta.totalQty) * 100).toFixed(1)}%`;

  function renderStats() {
    const items = [
      ['结算单', `${D.meta.settlements}`, '张'],
      ['销售明细', `${D.meta.records}`, '行'],
      ['总件数', num(D.meta.totalQty), '件'],
      ['整体均价', num(D.meta.overallAvg, 2), '元/件'],
    ];
    document.getElementById('stats').innerHTML = items
      .map(([label, value, unit]) =>
        `<div class="stat"><dt>${label}</dt><dd>${value} <span class="unit">${unit}</span></dd></div>`)
      .join('');
  }

  function schemeNote(key, rows) {
    const total = rows.reduce((sum, row) => sum + row.qty, 0);
    const base = `${rows.length} 个细分桶，件数合计 ${num(total)} 件`;
    if (key === 'B') {
      return `${base}，比实际总量多 ${num(total - D.meta.totalQty)} 件。区间写法被同时计入相邻号，`
        + '做占比时会虚高，只适合看单号趋势、不适合算总量。';
    }
    if (key === 'C') {
      return `${base}，与实际总量一致。区间写法只算较小的号，B7/5 会被算成 B5，可能低估大号价值。`;
    }
    return `${base}，与实际总量一致。区间写法如 B6/7 单独成行，不替业务做判断，是最无损的口径。`;
  }

  function renderChart(key) {
    const rows = D.schemes[key];
    const maxAvg = Math.max(...rows.map((row) => row.avg));
    const groups = ['A', 'B', 'C']
      .map((grade) => {
        const items = rows.filter((row) => row.grade === grade);
        if (!items.length) return '';
        const qty = items.reduce((sum, row) => sum + row.qty, 0);
        const amount = items.reduce((sum, row) => sum + row.amount, 0);
        const bars = items
          .map((row) => `
            <div class="bar-row">
              <span class="bar-label">${row.label}</span>
              <div class="bar-track">
                <div class="bar-fill grade-${grade.toLowerCase()}" style="width:${((row.avg / maxAvg) * 100).toFixed(1)}%"
                     role="img" aria-label="${row.label} 均价 ${num(row.avg, 2)} 元每件"></div>
              </div>
              <span class="bar-value">${num(row.avg, 2)} <span class="unit">元/件</span></span>
              <span class="bar-qty">${num(row.qty)} 件</span>
            </div>`)
          .join('');
        return `
          <div class="grade-group grade-${grade.toLowerCase()}">
            <p class="group-head">
              <span class="dot"></span>${GRADE_NAME[grade]}
              <span class="sum">${num(qty)} 件 · ${num(amount)} 元 · 均价 ${num(amount / qty, 2)} 元/件</span>
            </p>
            ${bars}
          </div>`;
      })
      .join('');
    document.getElementById('chart').innerHTML = groups;
    document.getElementById('scheme-note').textContent = schemeNote(key, rows);
  }

  function renderTable(key) {
    document.getElementById('detail-body').innerHTML = D.schemes[key]
      .map((row) => `
        <tr>
          <td>${row.label}</td>
          <td class="num">${num(row.qty)}</td>
          <td class="num">${num(row.amount)}</td>
          <td class="num">${num(row.avg, 2)}</td>
          <td class="num">${share(row.qty)}</td>
        </tr>`)
      .join('');
  }

  function renderQuality() {
    document.getElementById('quality').innerHTML = Object.entries(D.quality)
      .map(([label, value]) => `
        <li class="quality">
          <strong>${label}</strong>
          <p class="avg">${num(value.avg, 2)} <span class="unit">元/件</span></p>
          <p class="sub">${num(value.qty)} 件 · 占总量 ${share(value.qty)}</p>
        </li>`)
      .join('');
  }

  function renderTabs() {
    const tabs = document.getElementById('tabs');
    tabs.innerHTML = Object.keys(D.schemes)
      .map((key, index) => `
        <button class="tab" role="tab" id="tab-${key}" data-scheme="${key}"
                aria-selected="${index === 0}" aria-controls="chart">
          方案 ${key}<span class="tag">${SCHEME_TAG[key]}</span>
        </button>`)
      .join('');
    tabs.addEventListener('click', (event) => {
      const button = event.target.closest('.tab');
      if (!button) return;
      const key = button.dataset.scheme;
      tabs.querySelectorAll('.tab').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab === button));
      });
      renderChart(key);
      renderTable(key);
    });
    tabs.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const all = [...tabs.querySelectorAll('.tab')];
      const current = all.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
      event.preventDefault();
      all[next].focus();
      all[next].click();
    });
  }

  renderStats();
  renderTabs();
  renderChart('A');
  renderTable('A');
  renderQuality();
})();
