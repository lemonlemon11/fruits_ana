/* 销售总览「一屏看完」预览逻辑（视觉伴侣 · dev-preview）。
 * 口径：金额 = 件数×单价；小计/合计/均价 = Σ金额 ÷ Σ件数（ADR-006）；
 * 总柜数 = 结算单数（ADR-053）；BC 原始等级已归入 C。 */
(function () {
  'use strict'

  var data = window.OVERVIEW_DEMO
  var GRADE_ORDER = ['A', 'B', 'C']
  var GRADE_LABEL = { A: 'A果', B: 'B果', C: 'C果（含BC）' }
  var GRADE_COLOR = { A: '#177454', B: '#9a6514', C: '#a8463d' }
  var GRADE_BADGE_BG = { A: '#e8f4ef', B: '#faf1e4', C: '#faece9' }
  var BRAND_COLORS = { 晴牌: '#17663f', 香香果: '#4f8f6b', 钻牌: '#9a6514' }
  var BRAND_FALLBACK = ['#56635b', '#8aa095']

  function amountOf(row) { return row.qty * row.price }

  function formatNumber(value) {
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  function formatMoney(value) { return '¥' + formatNumber(value) }
  function formatPrice(value) { return value == null ? '—' : '¥' + value.toFixed(2) }
  function formatPercent(value) {
    return value == null ? '—' : (value * 100).toFixed(1) + '%'
  }

  /* ---------- 全量口径（页面级，不受规格表本地筛选影响） ---------- */
  var rows = data.specRows.map(function (row) {
    return Object.assign({ amount: amountOf(row) }, row)
  })
  var totals = rows.reduce(function (acc, row) {
    acc.qty += row.qty
    acc.amount += row.amount
    return acc
  }, { qty: 0, amount: 0 })
  var gradeTotals = GRADE_ORDER.map(function (grade) {
    var items = rows.filter(function (row) { return row.grade === grade })
    var qty = items.reduce(function (sum, row) { return sum + row.qty }, 0)
    var amount = items.reduce(function (sum, row) { return sum + row.amount }, 0)
    return { grade: grade, qty: qty, amount: amount, price: qty ? amount / qty : null }
  })

  /* ---------- KPI 4 格 + 覆盖小注 ---------- */
  function renderKpi() {
    var cells = [
      { label: '总柜数', value: formatNumber(data.meta.settlementCount), unit: '柜 · 结算单数' },
      { label: '总件数', value: formatNumber(totals.qty), unit: '件' },
      { label: '销售金额', value: formatMoney(totals.amount), unit: '筛选范围合计' },
      { label: '每件均价', value: formatPrice(totals.qty ? totals.amount / totals.qty : null), unit: '金额 ÷ 件数（加权）' },
    ]
    document.getElementById('kpi-grid').innerHTML = cells.map(function (cell) {
      return '<div class="kpi-cell"><span>' + cell.label + '</span><strong>' +
        cell.value + '</strong><small>' + cell.unit + '</small></div>'
    }).join('')
    document.getElementById('kpi-coverage').innerHTML =
      '近期单据：<b>' + data.meta.settlementCount + ' 张结算单</b> · 覆盖 <b>' +
      data.meta.coverageStart + ' ~ ' + data.meta.coverageEnd + '</b> · 最新单据 <b>' +
      data.meta.coverageEnd + '</b>'
  }

  /* ---------- 每日销售趋势：权重缩放，合计与 KPI 完全一致 ---------- */
  var daily = (function () {
    var weightSum = data.dailyWeights.reduce(function (sum, item) { return sum + item[1] }, 0)
    var usedAmount = 0
    var usedQty = 0
    return data.dailyWeights.map(function (item, index) {
      var isLast = index === data.dailyWeights.length - 1
      var amount
      var qty
      if (isLast) {
        amount = Math.round(totals.amount - usedAmount)
        qty = Math.round(totals.qty - usedQty)
      } else {
        amount = Math.round(totals.amount * item[1] / weightSum)
        qty = Math.round(totals.qty * item[1] / weightSum)
        usedAmount += amount
        usedQty += qty
      }
      return { date: item[0], amount: amount, qty: qty }
    })
  })()

  var trendMetric = 'amount'
  var trendChart = echarts.init(document.getElementById('trend-chart'))

  function trendOption() {
    var isAmount = trendMetric === 'amount'
    return {
      grid: { left: 54, right: 14, top: 16, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: function (value) {
          return isAmount ? formatMoney(value) : formatNumber(value) + ' 件'
        },
      },
      xAxis: {
        type: 'category',
        data: daily.map(function (point) { return point.date }),
        axisLine: { lineStyle: { color: '#8aa095' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#56635b',
          fontSize: 11,
          formatter: function (value) { return value.slice(5) },
          interval: Math.max(0, Math.floor(daily.length / 9) - 1),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e2e9e4' } },
        axisLabel: {
          color: '#56635b',
          fontSize: 11,
          formatter: function (value) {
            return isAmount && value >= 10000 ? (value / 10000) + '万' : formatNumber(value)
          },
        },
      },
      series: [{
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        data: daily.map(function (point) { return isAmount ? point.amount : point.qty }),
        lineStyle: { width: 2.2, color: '#17663f' },
        itemStyle: { color: '#17663f' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(23,102,63,.16)' },
              { offset: 1, color: 'rgba(23,102,63,0)' },
            ],
          },
        },
      }],
    }
  }

  function bindTrendToggle() {
    document.querySelectorAll('.trend-toggle-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        trendMetric = button.dataset.metric
        document.querySelectorAll('.trend-toggle-btn').forEach(function (item) {
          item.classList.toggle('is-active', item === button)
        })
        trendChart.setOption(trendOption())
      })
    })
  }

  /* ---------- 市场销售分析：品牌柜数环图 + 市场×品牌条形 ---------- */
  var marketChart = echarts.init(document.getElementById('market-chart'))

  function renderMarket() {
    var brandTotals = {}
    data.marketBrandContainers.forEach(function (row) {
      brandTotals[row.brand] = (brandTotals[row.brand] || 0) + row.count
    })
    var brands = Object.keys(brandTotals).sort(function (a, b) { return brandTotals[b] - brandTotals[a] })
    var paletteIndex = 0
    var brandColor = {}
    brands.forEach(function (brand) {
      brandColor[brand] = BRAND_COLORS[brand] || BRAND_FALLBACK[paletteIndex++ % BRAND_FALLBACK.length]
    })

    marketChart.setOption({
      title: {
        text: formatNumber(data.meta.settlementCount),
        subtext: '总柜数',
        left: 'center',
        top: '34%',
        itemGap: 2,
        textStyle: { color: '#104a2f', fontSize: 22, fontWeight: 700 },
        subtextStyle: { color: '#56635b', fontSize: 11 },
      },
      series: [{
        type: 'pie',
        radius: ['64%', '88%'],
        center: ['50%', '50%'],
        label: { show: false },
        data: brands.map(function (brand) {
          return { name: brand, value: brandTotals[brand], itemStyle: { color: brandColor[brand] } }
        }),
      }],
    })

    document.getElementById('market-legend').innerHTML = brands.map(function (brand) {
      return '<li><span class="legend-mark" style="background:' + brandColor[brand] + '"></span>' +
        '<span class="legend-label">' + brand + '</span>' +
        '<span class="legend-value"><b>' + brandTotals[brand] + '</b> 柜</span></li>'
    }).join('')

    var maxCount = Math.max.apply(null, data.marketBrandContainers.map(function (row) { return row.count }))
    document.getElementById('market-bars').innerHTML = data.marketBrandContainers
      .slice()
      .sort(function (a, b) { return b.count - a.count || a.market.localeCompare(b.market, 'zh-Hans-CN') })
      .map(function (row) {
        return '<li class="market-bar-row"><span class="bar-label">' + row.market + ' · ' + row.brand +
          '</span><span class="bar-track"><span class="bar-fill" style="width:' +
          (row.count / maxCount * 100) + '%;background:' + (brandColor[row.brand] || '#17663f') +
          '"></span></span><span class="bar-value">' + row.count + ' 柜</span></li>'
      }).join('')
  }

  /* ---------- 等级件数结构饼图 ---------- */
  var gradePieChart = echarts.init(document.getElementById('grade-pie-chart'))

  function renderGradePie() {
    gradePieChart.setOption({
      series: [{
        type: 'pie',
        radius: ['58%', '86%'],
        center: ['50%', '50%'],
        label: { show: false },
        data: gradeTotals.map(function (item) {
          return {
            name: GRADE_LABEL[item.grade],
            value: item.qty,
            itemStyle: { color: GRADE_COLOR[item.grade] },
          }
        }),
      }],
    })
    document.getElementById('grade-pie-legend').innerHTML = gradeTotals.map(function (item) {
      var share = totals.qty ? item.qty / totals.qty : null
      return '<li><span class="legend-mark" style="background:' + GRADE_COLOR[item.grade] + '"></span>' +
        '<span class="legend-label">' + GRADE_LABEL[item.grade] + '</span>' +
        '<span class="legend-value"><b>' + formatNumber(item.qty) + '</b> 件 · ' +
        formatPercent(share) + ' · 均价 ' + formatPrice(item.price) + '</span></li>'
    }).join('')
  }

  /* ---------- 规格件数与均价：等级分组摘要（等级+头数+KG，合并品牌） ---------- */
  var brandFilter = ''
  var gradeFilter = ''

  function filteredRows() {
    return rows.filter(function (row) {
      if (brandFilter && row.brand !== brandFilter) return false
      if (gradeFilter && row.grade !== gradeFilter) return false
      return true
    })
  }

  function specGroupSummary(items) {
    var map = {}
    items.forEach(function (row) {
      var key = row.grade + '::' + row.head + '::' + row.kg
      if (!map[key]) {
        map[key] = { grade: row.grade, spec: row.head + row.kg, qty: 0, amount: 0 }
      }
      map[key].qty += row.qty
      map[key].amount += row.amount
    })
    return Object.keys(map).map(function (key) {
      var item = map[key]
      item.price = item.qty ? item.amount / item.qty : null
      return item
    }).sort(function (a, b) { return b.qty - a.qty })
  }

  function specRowHtml(item, totalQty, grade, isMore) {
    var share = totalQty ? item.qty / totalQty : null
    var width = Math.max((share || 0) * 100, 2)
    return '<div class="spec-row' + (isMore ? ' spec-row--more' : '') + '">' +
      '<span class="row-spec">' + item.spec + '</span>' +
      '<span class="row-qty"><b>' + formatNumber(item.qty) + '</b> 件</span>' +
      '<span class="row-share"><span class="mini-track"><span class="mini-fill" style="width:' +
      width + '%;background:' + GRADE_COLOR[grade] + '"></span></span>' + formatPercent(share) + '</span>' +
      '<span class="row-price">' + formatPrice(item.price) + '</span></div>'
  }

  function renderSpecSummary() {
    var items = filteredRows()
    var totalQty = items.reduce(function (sum, row) { return sum + row.qty }, 0)
    var groups = GRADE_ORDER.filter(function (grade) { return !gradeFilter || gradeFilter === grade })
      .map(function (grade) {
        var gradeItems = items.filter(function (row) { return row.grade === grade })
        var qty = gradeItems.reduce(function (sum, row) { return sum + row.qty }, 0)
        var amount = gradeItems.reduce(function (sum, row) { return sum + row.amount }, 0)
        return {
          grade: grade,
          qty: qty,
          price: qty ? amount / qty : null,
          share: totalQty ? qty / totalQty : null,
          specs: specGroupSummary(gradeItems),
        }
      })

    document.getElementById('spec-summary').innerHTML = groups.map(function (group) {
      var top = group.specs.slice(0, 3)
      var rest = group.specs.slice(3)
      var body = top.map(function (item) { return specRowHtml(item, totalQty, group.grade, false) }).join('')
      if (rest.length) {
        var restQty = rest.reduce(function (sum, item) { return sum + item.qty }, 0)
        var restAmount = rest.reduce(function (sum, item) { return sum + item.amount }, 0)
        body += specRowHtml(
          { spec: '其他 ' + rest.length + ' 个规格', qty: restQty, price: restQty ? restAmount / restQty : null },
          totalQty, group.grade, true,
        )
      }
      if (!group.specs.length) {
        body = '<div class="spec-row spec-row--more"><span class="row-spec">暂无该等级规格数据</span>' +
          '<span class="row-qty"></span><span class="row-share"></span><span class="row-price">—</span></div>'
      }
      return '<section class="spec-group" aria-label="' + GRADE_LABEL[group.grade] + '规格摘要">' +
        '<header class="spec-group-header">' +
        '<span class="spec-badge" style="color:' + GRADE_COLOR[group.grade] +
        ';background:' + GRADE_BADGE_BG[group.grade] + '">' + group.grade + '</span>' +
        '<span class="spec-group-title">' + GRADE_LABEL[group.grade] + '</span>' +
        '<span class="group-subtotal"><b>' + formatNumber(group.qty) + ' 件 · ' + formatPercent(group.share) +
        '</b>小计均价 ' + formatPrice(group.price) + '</span>' +
        '</header>' + body + '</section>'
    }).join('')
  }

  /* ---------- 规格明细长表：品牌×等级 分组 + 小计 + 合计（与线上表同构） ---------- */
  function renderSpecTable() {
    var items = filteredRows()
    var groupMap = {}
    items.forEach(function (row) {
      var key = row.brand + '::' + row.grade
      if (!groupMap[key]) groupMap[key] = { brand: row.brand, grade: row.grade, rows: [] }
      groupMap[key].rows.push(row)
    })
    var groups = Object.keys(groupMap).map(function (key) {
      var group = groupMap[key]
      group.qty = group.rows.reduce(function (sum, row) { return sum + row.qty }, 0)
      group.amount = group.rows.reduce(function (sum, row) { return sum + row.amount }, 0)
      group.price = group.qty ? group.amount / group.qty : null
      group.rows.sort(function (a, b) {
        if (a.qty !== b.qty) return b.qty - a.qty
        return (a.head + a.kg).localeCompare(b.head + b.kg, 'zh-Hans-CN', { numeric: true })
      })
      return group
    }).sort(function (a, b) {
      if (a.qty !== b.qty) return b.qty - a.qty
      if (a.brand !== b.brand) return a.brand.localeCompare(b.brand, 'zh-Hans-CN')
      return GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)
    })

    var totalQty = items.reduce(function (sum, row) { return sum + row.qty }, 0)
    var totalAmount = items.reduce(function (sum, row) { return sum + row.amount }, 0)
    var html = groups.map(function (group) {
      var rowsHtml = group.rows.map(function (row) {
        return '<tr>' +
          '<td class="spec-brand">' + row.brand + '</td>' +
          '<td><span class="spec-badge" style="color:' + GRADE_COLOR[group.grade] +
          ';background:' + GRADE_BADGE_BG[group.grade] + '">' + GRADE_LABEL[group.grade] + '</span></td>' +
          '<td class="spec-cell">' + row.head + '</td>' +
          '<td class="spec-cell">' + row.kg + '</td>' +
          '<td><span class="spec-remark' + (row.remark ? '' : ' spec-remark--empty') + '">' +
          (row.remark || '—') + '</span></td>' +
          '<td class="spec-qty"><b>' + formatNumber(row.qty) + '</b> <small>件</small></td>' +
          '<td class="spec-price">' + formatPrice(row.price) + '</td></tr>'
      }).join('')
      rowsHtml += '<tr class="spec-subtotal"><td colspan="5">小计 · ' + group.brand + ' ' +
        GRADE_LABEL[group.grade] + '</td><td><b>' + formatNumber(group.qty) + '</b> <small>件</small></td>' +
        '<td class="spec-price"><b>' + formatPrice(group.price) + '</b></td></tr>'
      return rowsHtml
    }).join('')
    if (!groups.length) {
      html = '<tr><td colspan="7">当前筛选范围没有可统计的规格数据</td></tr>'
    } else {
      html += '<tr class="spec-total"><td colspan="5">合计 · 全部品牌等级</td><td><b>' +
        formatNumber(totalQty) + '</b> <small>件</small></td><td class="spec-price"><b>' +
        formatPrice(totalQty ? totalAmount / totalQty : null) + '</b></td></tr>'
    }
    document.getElementById('spec-table-body').innerHTML = html
  }

  /* ---------- 品牌/等级筛选（只作用于规格摘要与明细表） ---------- */
  function bindFilters() {
    var brands = []
    rows.forEach(function (row) {
      if (brands.indexOf(row.brand) < 0) brands.push(row.brand)
    })
    brands.sort(function (a, b) { return a.localeCompare(b, 'zh-Hans-CN') })

    var brandSelect = document.getElementById('spec-brand-filter')
    brandSelect.innerHTML = '<option value="">全部品牌</option>' + brands.map(function (brand) {
      return '<option value="' + brand + '">' + brand + '</option>'
    }).join('')
    brandSelect.addEventListener('change', function () {
      brandFilter = brandSelect.value
      renderSpecSummary()
      renderSpecTable()
    })

    var gradeSelect = document.getElementById('spec-grade-filter')
    gradeSelect.innerHTML = '<option value="">全部等级</option>' + GRADE_ORDER.map(function (grade) {
      return '<option value="' + grade + '">' + GRADE_LABEL[grade] + '</option>'
    }).join('')
    gradeSelect.addEventListener('change', function () {
      gradeFilter = gradeSelect.value
      renderSpecSummary()
      renderSpecTable()
    })
  }

  /* ---------- 查看明细 / 收起明细（页内手风琴） ---------- */
  function bindDetailToggle() {
    var panel = document.getElementById('detail-panel')
    function setExpanded(expanded) {
      panel.hidden = !expanded
      document.getElementById('detail-toggle').textContent = expanded ? '收起明细 ▴' : '查看明细 ▾'
      document.getElementById('detail-toggle').setAttribute('aria-expanded', String(expanded))
      document.getElementById('detail-collapse').setAttribute('aria-expanded', String(expanded))
    }
    document.getElementById('detail-toggle').addEventListener('click', function () {
      setExpanded(panel.hidden)
    })
    document.getElementById('detail-collapse').addEventListener('click', function () {
      setExpanded(false)
    })
  }

  /* ---------- 启动 ---------- */
  renderKpi()
  bindTrendToggle()
  renderMarket()
  renderGradePie()
  bindFilters()
  renderSpecSummary()
  renderSpecTable()
  bindDetailToggle()
  trendChart.setOption(trendOption())
  window.addEventListener('resize', function () {
    trendChart.resize()
    marketChart.resize()
    gradePieChart.resize()
  })

  /* ---------- 预览辅助：URL 参数驱动（无头截图验收用） ----------
   * ?detail=1            载入即展开规格明细（验收展开态）
   * ?metric=quantity     趋势图载入即切到件数
   * ?report=height       渲染后把整页高度写进 <title>（配合 --dump-dom 读数） */
  var params = new URLSearchParams(window.location.search)
  if (params.get('detail') === '1') {
    document.getElementById('detail-toggle').click()
  }
  if (params.get('metric') === 'quantity') {
    var quantityButton = document.querySelector('.trend-toggle-btn[data-metric="quantity"]')
    if (quantityButton) quantityButton.click()
  }
  if (params.get('report') === 'height') {
    window.setTimeout(function () {
      document.title = 'PAGE_HEIGHT=' + document.documentElement.scrollHeight +
        ';VIEW_WIDTH=' + window.innerWidth + ';VIEW_HEIGHT=' + window.innerHeight
    }, 400)
  }
})()
