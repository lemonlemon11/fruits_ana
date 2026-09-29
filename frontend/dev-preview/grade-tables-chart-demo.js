/* 等级独立对比（grade-tables）图表化演示：A 分面小图 / B 分组柱状 / C 量价散点。
 * 数据来自 grade-tables-chart-demo.data.js（真实库 get_series_comparison，本地保留不入库），
 * 指标口径与正式页一致：件数 / 金额 / 每件均价 / 金额占比。 */
;(() => {
  const echarts = window.echarts
  const DATA = window.GRADE_TABLES_DEMO_DATA
  if (!echarts || !DATA) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<p class="card" style="color:#9b3029">缺少 echarts 或数据文件 grade-tables-chart-demo.data.js（本地生成，不入库）。请先跑 tmp/grade-tables-chart-demo/gen_data.py。</p>',
    )
    return
  }

  const GRADE_META = {
    A: { label: 'A果', color: '#177454' },
    B: { label: 'B果', color: '#9a6514' },
    AB: { label: 'AB果', color: '#8a6f2f' },
    C: { label: 'C果', color: '#a8463d' },
    D: { label: 'D果', color: '#2f6f8f' },
    E: { label: 'E果', color: '#7a5aa6' },
    F: { label: 'F果', color: '#b34f82' },
  }
  const GRADE_ORDER = Object.keys(GRADE_META)

  const note = document.getElementById('data-note')
  if (note) note.textContent = `数据：${DATA.source}。${DATA.excludedNote}。`

  const SETTLEMENTS = DATA.settlements
  const GRADES = GRADE_ORDER
    .filter((key) => SETTLEMENTS.some((s) => s.cells[key]))
    .map((key) => ({ key, ...GRADE_META[key] }))

  const cellOf = (s, key) => s.cells[key] ?? null
  const totalOf = (s) => GRADES.reduce((sum, g) => sum + (cellOf(s, g.key)?.a ?? 0), 0)

  const fmtQty = (n) => n.toLocaleString('zh-CN')
  const fmtMoney = (n) => '¥' + Math.round(n).toLocaleString('zh-CN')
  const fmtPct = (v) => (v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%')

  const MUTED = '#56635b'
  const LINE = '#c8d2cd'
  const LINE_STRONG = '#8aa095'
  const INK = '#1f2923'

  const charts = []
  // 结算单一多，横排标签放不下：超过 8 张统一斜排，悬浮提示里给全名单号。
  const CROWDED = SETTLEMENTS.length > 8
  const axisLabel = { color: MUTED, interval: 0, fontSize: 10 }
  if (CROWDED) Object.assign(axisLabel, { rotate: 45 })

  /* ---------- 方案 A：分面小图 ---------- */

  const allQtys = SETTLEMENTS.flatMap((s) => GRADES.map((g) => cellOf(s, g.key)?.q)).filter((v) => v != null)
  const allPrices = SETTLEMENTS.flatMap((s) => GRADES.map((g) => cellOf(s, g.key)?.p)).filter((v) => v != null)
  // 统一刻度：所有小图共用坐标范围，跨等级可比；各自刻度交给 echarts scale 自适应。
  const SHARED_QTY_MAX = Math.ceil(Math.max(...allQtys) / 50) * 50
  const SHARED_PRICE_MIN = Math.floor(Math.min(...allPrices) / 10) * 10
  const SHARED_PRICE_MAX = Math.ceil(Math.max(...allPrices) / 10) * 10

  let scaleMode = 'shared'
  const facetCharts = []

  function facetOption(grade) {
    return {
      aria: { enabled: true },
      grid: { left: 4, right: 4, top: 14, bottom: 2, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const s = SETTLEMENTS[params[0].dataIndex]
          const cell = cellOf(s, grade.key)
          if (!cell) return `<strong>${s.full}（${s.date}）</strong><br/>该单没有${grade.label}`
          return [
            `<strong>${s.full}（${s.date}）</strong>`,
            `件数：${fmtQty(cell.q)} 件`,
            `金额：${fmtMoney(cell.a)}`,
            `每件均价：${fmtMoney(cell.p)}`,
            `金额占比：${fmtPct(s.shares[grade.key] ?? null)}`,
          ].join('<br/>')
        },
      },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: SETTLEMENTS.map((s) => s.short),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: LINE_STRONG } },
        axisLabel: { ...axisLabel, width: CROWDED ? undefined : 66, overflow: 'truncate' },
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: scaleMode === 'shared' ? SHARED_QTY_MAX : null,
          axisLabel: { color: MUTED, fontSize: 10, formatter: (v) => fmtQty(v) },
          splitLine: { lineStyle: { color: LINE, type: 'dashed' } },
        },
        {
          type: 'value',
          scale: scaleMode === 'local',
          min: scaleMode === 'shared' ? SHARED_PRICE_MIN : null,
          max: scaleMode === 'shared' ? SHARED_PRICE_MAX : null,
          axisLabel: { color: MUTED, fontSize: 10, formatter: (v) => fmtQty(v) },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '件数',
          type: 'bar',
          yAxisIndex: 0,
          data: SETTLEMENTS.map((s) => cellOf(s, grade.key)?.q ?? null),
          barMaxWidth: 30,
          itemStyle: { color: grade.color, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '每件均价',
          type: 'line',
          yAxisIndex: 1,
          data: SETTLEMENTS.map((s) => cellOf(s, grade.key)?.p ?? null),
          connectNulls: false,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2.5, color: INK },
          itemStyle: { color: INK },
          emphasis: { focus: 'series' },
        },
      ],
    }
  }

  function buildFacets() {
    const grid = document.getElementById('facet-grid')
    GRADES.forEach((grade) => {
      const items = SETTLEMENTS.map((s) => cellOf(s, grade.key)).filter(Boolean)
      const qty = items.reduce((sum, c) => sum + c.q, 0)
      const amount = items.reduce((sum, c) => sum + c.a, 0)
      const avg = qty ? amount / qty : null

      const card = document.createElement('article')
      card.className = 'facet-card'
      card.innerHTML = [
        `<h3><span class="grade-dot" style="background:${grade.color}"></span>${grade.label}`,
        `<span class="facet-sum">${fmtQty(qty)} 件 · ${fmtMoney(amount)} · 均价 ${fmtMoney(avg)}</span></h3>`,
        '<p class="facet-chips">',
        '<span class="chip"><i class="swatch-bar"></i>件数（左轴）</span>',
        '<span class="chip"><i class="swatch-line"></i>每件均价（右轴）</span>',
        '</p>',
        `<div class="facet-chart" role="img" aria-label="${grade.label}在 ${SETTLEMENTS.length} 张结算单的件数柱状与每件均价折线"></div>`,
      ].join('')
      grid.appendChild(card)

      const chart = echarts.init(card.querySelector('.facet-chart'))
      chart.setOption(facetOption(grade))
      charts.push(chart)
      facetCharts.push({ chart, grade })
    })
  }

  function applyScaleMode(mode) {
    scaleMode = mode
    document.getElementById('scale-shared').setAttribute('aria-pressed', String(mode === 'shared'))
    document.getElementById('scale-local').setAttribute('aria-pressed', String(mode === 'local'))
    facetCharts.forEach(({ chart, grade }) => chart.setOption(facetOption(grade)))
  }

  /* ---------- 方案 B：分组柱状图 ---------- */

  function buildGroupedBar() {
    const chart = echarts.init(document.getElementById('chart-b'))
    chart.setOption({
      aria: { enabled: true },
      grid: { left: 10, right: 16, top: 40, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const s = SETTLEMENTS[params[0].dataIndex]
          const lines = GRADES.map((g) => {
            const cell = cellOf(s, g.key)
            if (!cell) return `${g.label}：该单没有`
            return `${g.label}：${fmtQty(cell.q)} 件 · 均价 ${fmtMoney(cell.p)} · 占比 ${fmtPct(s.shares[g.key] ?? null)}`
          })
          return [`<strong>${s.full}（${s.date}）</strong>`, ...lines].join('<br/>')
        },
      },
      legend: { top: 4, right: 8, itemWidth: 12, textStyle: { color: MUTED } },
      xAxis: {
        type: 'category',
        data: SETTLEMENTS.map((s) => s.short),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: LINE_STRONG } },
        axisLabel: { ...axisLabel, width: CROWDED ? undefined : 92, overflow: 'truncate' },
      },
      yAxis: [
        {
          // 轴单位在区块说明与图例（件数/均价）已标明；轴名与顶部图例同带会叠压，故不设。
          type: 'value',
          min: 0,
          axisLabel: { color: MUTED, formatter: (v) => fmtQty(v) },
          splitLine: { lineStyle: { color: LINE, type: 'dashed' } },
        },
        {
          type: 'value',
          scale: true,
          axisLabel: { color: MUTED, formatter: (v) => fmtQty(v) },
          splitLine: { show: false },
        },
      ],
      series: GRADES.flatMap((g) => [
        {
          name: `${g.label}·件数`,
          type: 'bar',
          data: SETTLEMENTS.map((s) => cellOf(s, g.key)?.q ?? null),
          barMaxWidth: 26,
          itemStyle: { color: g.color, borderRadius: [3, 3, 0, 0] },
          emphasis: { focus: 'series' },
        },
        {
          name: `${g.label}·均价`,
          type: 'line',
          yAxisIndex: 1,
          data: SETTLEMENTS.map((s) => cellOf(s, g.key)?.p ?? null),
          connectNulls: false,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2.5, color: g.color },
          itemStyle: { color: g.color, borderColor: '#fff', borderWidth: 1 },
          emphasis: { focus: 'series' },
        },
      ]),
    })
    charts.push(chart)
  }

  /* ---------- 方案 C：量价散点图 ---------- */

  function buildScatter() {
    const chart = echarts.init(document.getElementById('chart-c'))
    chart.setOption({
      aria: { enabled: true },
      // containLabel 只包含刻度文字，轴名称在刻度之外——底部留出名称的空间；顶部留出最高点标签与图例的距离。
      grid: { left: 12, right: 24, top: 58, bottom: 34, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (param) => {
          const [q, p, amount] = param.value
          const s = SETTLEMENTS.find((item) => item.full === param.name)
          const grade = GRADES.find((g) => g.label === param.seriesName)
          return [
            `<strong>${param.name}（${s.date}）</strong>`,
            `${grade.label}：件数 ${fmtQty(q)} 件`,
            `每件均价：${fmtMoney(p)}`,
            `金额：${fmtMoney(amount)} · 占比 ${fmtPct(s.shares[grade.key] ?? null)}`,
          ].join('<br/>')
        },
      },
      legend: { top: 4, right: 8, itemWidth: 12, textStyle: { color: MUTED } },
      xAxis: {
        type: 'value',
        name: '件数（件）',
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: MUTED },
        min: 0,
        axisLabel: { color: MUTED, formatter: (v) => fmtQty(v) },
        splitLine: { lineStyle: { color: LINE, type: 'dashed' } },
      },
      yAxis: {
        type: 'value',
        // 轴名从简（与正式页均价图一致）；纵轴含义在区块说明里已写明，长名会被画布左缘裁切。
        name: '元/件',
        scale: true,
        // 最高点若贴着轴上限，其顶部标签会浮出绘图区；余量需覆盖气泡半径+标签高度。
        max: (value) => Math.ceil((value.max + 60) / 10) * 10,
        nameTextStyle: { color: MUTED },
        axisLabel: { color: MUTED, formatter: (v) => fmtQty(v) },
        splitLine: { lineStyle: { color: LINE, type: 'dashed' } },
      },
      series: GRADES.map((g) => ({
        name: g.label,
        type: 'scatter',
        data: SETTLEMENTS
          .filter((s) => cellOf(s, g.key))
          .map((s) => {
            const cell = cellOf(s, g.key)
            return { name: s.full, value: [cell.q, cell.p, cell.a] }
          }),
        // 真实金额量级 11 万~43 万：按平方根映射直径，落在 28~55px。
        symbolSize: (value) => Math.max(14, Math.sqrt(value[2]) / 12),
        itemStyle: { color: g.color, opacity: 0.85, borderColor: '#fff', borderWidth: 1 },
        label: {
          show: true,
          position: 'top',
          distance: 6,
          color: MUTED,
          fontSize: 11,
          formatter: (p) => SETTLEMENTS.find((item) => item.full === p.name).short,
        },
        // 相邻气泡的标签会叠在一起，交给 ECharts 自动隐藏重叠标签。
        labelLayout: { hideOverlap: true },
        emphasis: { focus: 'series' },
      })),
    })
    charts.push(chart)
  }

  buildFacets()
  buildGroupedBar()
  buildScatter()

  document.getElementById('scale-shared').addEventListener('click', () => applyScaleMode('shared'))
  document.getElementById('scale-local').addEventListener('click', () => applyScaleMode('local'))

  window.addEventListener('resize', () => charts.forEach((chart) => chart.resize()))
})()
