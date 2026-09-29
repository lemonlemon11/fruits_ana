/* 销售总览「一屏看完」预览 v2 逻辑（视觉伴侣 · dev-preview）。
 * 口径：金额 = 件数×单价；小计/合计/均价 = Σ金额 ÷ Σ件数（ADR-006）；
 * 总柜数 = 结算单数（ADR-053）；BC 原始等级已归入 C。
 * v2：通栏大数带 + CSS conic 环图 + 对齐网格摘要；仅趋势图用 echarts。 */
(function () {
  'use strict'

  var data = window.OVERVIEW_DEMO
  var GRADE_ORDER = ['A', 'B', 'C']
  var GRADE_LABEL = { A: 'A果', B: 'B果', C: 'C果（含BC）' }
  var GRADE_COLOR = { A: '#177454', B: '#9a6514', C: '#a8463d' }
  var BRAND_COLORS = { 晴牌: '#17663f', 香香果: '#4f8f6b', 钻牌: '#9a6514' }
  var BRAND_FALLBACK = ['#56635b', '#8aa095']

  function amountOf(row) { return row.qty * row.price }
  function formatNumber(value) {
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  function formatPrice(value) { return value == null ? '—' : value.toFixed(2) }
  function formatPercent(value) {
    return value == null ? '—' : (value * 100).toFixed(1) + '%'
  }
  function moneyPrefix() { return '<small class="cur">¥</small>' }

  /* ---------- 全量口径（页面级，不受规格表本地筛选影响） ---------- */
  var rows = data.specRows.map(function (row) {
    return Object.assign({ amount: amountOf(row) }, row)
  })
  var totals = rows.reduce(function (acc, row) {
    acc.qty += row.qty
    acc.amount += row.amount
    return acc
  }, { qty: 0, amount: 0 })
  var avgPrice = totals.qty ? totals.amount / totals.qty : null
  var gradeTotals = GRADE_ORDER.map(function (grade) {
    var items = rows.filter(function (row) { return row.grade === grade })
    var qty = items.reduce(function (sum, row) { return sum + row.qty }, 0)
    var amount = items.reduce(function (sum, row) { return sum + row.amount }, 0)
    return { grade: grade, qty: qty, amount: amount, price: qty ? amount / qty : null }
  })

  /* ---------- 通栏大数带 ---------- */
  function renderHero() {
    var cells = [
      { metric: 'amount', label: '销售金额', hero: true, price: true, value: moneyPrefix() + formatNumber(totals.amount), cap: '筛选范围合计 · 点击看每日走势' },
      { metric: 'quantity', label: '总件数', value: formatNumber(totals.qty), unit: '件', cap: '全部等级合计 · 点击看每日走势' },
      { metric: 'price', label: '每件均价', price: true, value: moneyPrefix() + formatPrice(avgPrice), cap: '元/件 · 金额 ÷ 件数（加权）' },
      { metric: 'containers', label: '总柜数', value: formatNumber(data.meta.settlementCount), unit: '柜', cap: '结算单数 · 点击看每日走势' },
    ]
    document.getElementById('hero-cells').innerHTML = cells.map(function (cell) {
      return '<div class="hcell' + (cell.price ? ' hcell--price' : '') +
        '" role="button" tabindex="0" aria-pressed="false" data-metric="' + cell.metric + '">' +
        '<span class="hlabel">' + cell.label + '</span>' +
        '<strong class="hnum num ' + (cell.hero ? 'n-hero' : 'n-kpi') + '">' + cell.value +
        (cell.unit ? '<small class="unit">' + cell.unit + '</small>' : '') + '</strong>' +
        '<small class="hcap">' + cell.cap + '</small></div>'
    }).join('')

    document.getElementById('grade-chips').innerHTML = gradeTotals.map(function (item) {
      return '<span class="grade-chip">' +
        '<span class="chip-dot" style="background:' + GRADE_COLOR[item.grade] + '"></span>' +
        '<span class="chip-name">' + GRADE_LABEL[item.grade] + '</span>' +
        '<span class="chip-price">¥' + formatPrice(item.price) + '</span>/件</span>'
    }).join('')

    document.getElementById('hero-coverage').innerHTML =
      '近期单据 <b>' + data.meta.settlementCount + '</b> 张 · 覆盖 <b>' +
      data.meta.coverageStart.slice(5) + ' ~ ' + data.meta.coverageEnd.slice(5) +
      '</b> · 最新 <b>' + data.meta.coverageEnd.slice(5) + '</b>'
  }

  /* ---------- 每日趋势：权重缩放，金额/件数合计与 KPI 完全一致 ---------- */
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
      return {
        date: item[0],
        amount: amount,
        qty: qty,
        price: qty ? amount / qty : null,
        containers: data.containerDays[item[0]] || 0,
      }
    })
  })()

  /* KPI ↔ 趋势联动：点上方大数带各格切换指标（口径与后端 trend 一致） */
  var METRICS = {
    amount: { name: '销售金额', unit: '万元', label: function (v) { return (v / 10000).toFixed(1) }, tip: function (v) { return '¥' + formatNumber(v) } },
    quantity: { name: '总件数', unit: '件', label: function (v) { return formatNumber(v) }, tip: function (v) { return formatNumber(v) + ' 件' } },
    price: { name: '每件均价', unit: '元/件', label: function (v) { return v == null ? '—' : v.toFixed(1) }, tip: function (v) { return v == null ? '—' : '¥' + v.toFixed(2) } },
    containers: { name: '总柜数', unit: '柜', label: function (v) { return String(v) }, tip: function (v) { return v + ' 柜' } },
  }
  var trendMetric = 'amount'
  var trendChart = echarts.init(document.getElementById('trend-chart'))

  function trendOption() {
    var metric = METRICS[trendMetric]
    var values = daily.map(function (point) { return point[trendMetric === 'quantity' ? 'qty' : trendMetric] })
    var lastIndex = values.length - 1
    var peak = Math.max.apply(null, values.map(function (v) { return v == null ? -Infinity : v }))
    var peakIndex = values.indexOf(peak)
    /* 全点数值标注：短值（单位在标题注）+ 奇偶上下交错防重叠；峰值/末值加粗深墨绿。
       柜数的 0 值日不标注，避免成串 0 干扰。 */
    var seriesData = values.map(function (value, index) {
      var isKey = index === peakIndex || index === lastIndex
      var text = metric.label(value)
      if (trendMetric === 'containers' && !value) text = ''
      return {
        value: value,
        label: {
          position: index % 2 ? 'bottom' : 'top',
          color: isKey ? '#104a2f' : '#56635b',
          fontWeight: isKey ? 800 : 400,
          fontSize: isKey ? 11 : 10,
          formatter: text,
        },
      }
    })
    return {
      grid: { left: 14, right: 20, top: 30, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: function (value) { return metric.tip(value) },
      },
      xAxis: {
        type: 'category',
        data: daily.map(function (point) { return point.date }),
        axisLine: { lineStyle: { color: '#8aa095' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#56635b',
          fontSize: 10.5,
          formatter: function (value) { return value.slice(5) },
          interval: Math.max(0, Math.floor(daily.length / 10) - 1),
        },
      },
      yAxis: { show: false, type: 'value', splitLine: { show: false } },
      series: [{
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: 4.5,
        data: seriesData,
        lineStyle: { width: 2.2, color: '#104a2f' },
        itemStyle: { color: '#104a2f' },
        label: {
          show: true,
          distance: 5,
          fontFamily: 'Bahnschrift, "Microsoft YaHei", sans-serif',
        },
        connectNulls: true,
      }],
    }
  }

  function setTrendMetric(key) {
    if (!METRICS[key]) return
    trendMetric = key
    var metric = METRICS[key]
    document.getElementById('trend-metric-note').textContent =
      metric.name + ' · 单位：' + metric.unit
    document.querySelectorAll('#hero-cells .hcell').forEach(function (cell) {
      var active = cell.dataset.metric === key
      cell.classList.toggle('hcell--active', active)
      cell.setAttribute('aria-pressed', String(active))
    })
    trendChart.setOption(trendOption(), { replaceMerge: ['series'] })
  }

  function bindHeroMetric() {
    document.getElementById('hero-cells').addEventListener('click', function (event) {
      var cell = event.target.closest('.hcell[data-metric]')
      if (cell) setTrendMetric(cell.dataset.metric)
    })
    document.getElementById('hero-cells').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      var cell = event.target.closest('.hcell[data-metric]')
      if (cell) {
        event.preventDefault()
        setTrendMetric(cell.dataset.metric)
      }
    })
  }

  /* ---------- CSS conic 环图（等级结构 / 品牌柜数） ---------- */
  function renderDonut(el, segments, centerStrong, centerSmall) {
    var el2 = document.getElementById(el)
    var total = segments.reduce(function (sum, seg) { return sum + seg.value }, 0)
    var stops = []
    var acc = 0
    segments.forEach(function (seg) {
      if (!seg.value) return
      var from = total ? (acc / total * 100) : 0
      acc += seg.value
      var to = total ? (acc / total * 100) : 0
      stops.push(seg.color + ' ' + from.toFixed(3) + '% ' + to.toFixed(3) + '%')
    })
    el2.style.background = stops.length
      ? 'conic-gradient(' + stops.join(', ') + ')'
      : 'var(--surface-soft)'
    el2.innerHTML = '<b><strong>' + centerStrong + '</strong><small>' + centerSmall + '</small></b>'
  }

  function renderGradeDonut() {
    renderDonut('grade-donut', gradeTotals.map(function (item) {
      return { value: item.qty, color: GRADE_COLOR[item.grade] }
    }), formatNumber(totals.qty), '总件数')
    document.getElementById('grade-legend').innerHTML = gradeTotals.map(function (item) {
      var share = totals.qty ? item.qty / totals.qty : null
      return '<li><span class="legend-mark" style="background:' + GRADE_COLOR[item.grade] + '"></span>' +
        '<span class="legend-label">' + GRADE_LABEL[item.grade] + '</span>' +
        '<span class="legend-value"><b>' + formatNumber(item.qty) + '</b> · ' + formatPercent(share) + '</span></li>'
    }).join('')
  }

  /* ---------- 等级均价横条（按最高等级均价定标） ---------- */
  function renderGradePriceBars() {
    var maxPrice = Math.max.apply(null, gradeTotals.map(function (item) { return item.price || 0 }))
    document.getElementById('grade-price-bars').innerHTML = gradeTotals.map(function (item) {
      var width = maxPrice ? ((item.price || 0) / maxPrice * 100) : 0
      return '<div class="price-row">' +
        '<span class="p-label"><span class="g-dot" style="background:' + GRADE_COLOR[item.grade] + '"></span>' +
        GRADE_LABEL[item.grade] + '</span>' +
        '<span class="price-track"><span class="price-fill" style="width:' + width.toFixed(1) +
        '%;background:' + GRADE_COLOR[item.grade] + '"></span></span>' +
        '<span class="p-value">¥' + formatPrice(item.price) + '</span></div>'
    }).join('')
  }

  /* ---------- 市场销售分析：品牌环图 + 市场×品牌条形 ---------- */
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

    renderDonut('market-donut', brands.map(function (brand) {
      return { value: brandTotals[brand], color: brandColor[brand] }
    }), formatNumber(data.meta.settlementCount), '总柜数')

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
          (row.count / maxCount * 100).toFixed(1) + '%;background:' + (brandColor[row.brand] || '#17663f') +
          '"></span></span><span class="bar-value">' + row.count + '<small> 柜</small></span></li>'
      }).join('')
  }

  /* ---------- 规格摘要（等级+头数+KG 合并品牌；三列共用网格模板对齐） ---------- */
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

    /* 占比条以全摘要中最大规格占比定标 → 三列条长横向可比 */
    var maxShare = 0
    groups.forEach(function (group) {
      group.specs.forEach(function (item) {
        var share = totalQty ? item.qty / totalQty : 0
        if (share > maxShare) maxShare = share
      })
    })

    function rowHtml(item, grade, isMore) {
      var share = totalQty ? item.qty / totalQty : null
      var width = maxShare ? Math.max((share || 0) / maxShare * 100, 2) : 0
      return '<div class="sum-row' + (isMore ? ' sum-row--more' : '') + '">' +
        '<span class="s-spec">' + item.spec + '</span>' +
        '<span class="s-qty">' + formatNumber(item.qty) + '</span>' +
        '<span class="s-share"><span class="mini-track"><span class="mini-fill" style="width:' +
        width.toFixed(1) + '%;background:' + GRADE_COLOR[grade] + '"></span></span>' +
        formatPercent(share) + '</span>' +
        '<span class="s-price">' + (item.price == null ? '—' : '¥' + formatPrice(item.price)) + '</span></div>'
    }

    document.getElementById('spec-summary').innerHTML = groups.map(function (group) {
      var top = group.specs.slice(0, 3)
      var rest = group.specs.slice(3)
      var body = top.map(function (item) { return rowHtml(item, group.grade, false) }).join('')
      if (rest.length) {
        var restQty = rest.reduce(function (sum, item) { return sum + item.qty }, 0)
        var restAmount = rest.reduce(function (sum, item) { return sum + item.amount }, 0)
        body += rowHtml(
          { spec: '其他 ' + rest.length + ' 个规格', qty: restQty, price: restQty ? restAmount / restQty : null },
          group.grade, true,
        )
      }
      if (!group.specs.length) {
        body = '<div class="sum-row sum-row--empty"><span class="s-spec">暂无该等级规格数据</span>' +
          '<span class="s-qty"></span><span class="s-share"></span><span class="s-price">—</span></div>'
      }
      return '<section class="spec-group" aria-label="' + GRADE_LABEL[group.grade] + '规格摘要">' +
        '<header class="spec-group-header">' +
        '<span class="g-left"><span class="g-dot" style="background:' + GRADE_COLOR[group.grade] + '"></span>' +
        GRADE_LABEL[group.grade] + '</span>' +
        '<span class="g-sub"><b>' + formatNumber(group.qty) + '</b> 件 · ' + formatPercent(group.share) +
        ' · 小计 <span class="g-price">¥' + formatPrice(group.price) + '</span></span>' +
        '</header>' +
        '<div class="spec-group-rows">' + body + '</div>' +
        '<footer class="spec-group-foot"><button type="button" class="grade-detail-btn" data-grade="' +
        group.grade + '">查看明细 ▾</button></footer></section>'
    }).join('')
  }

  /* ---------- 等级明细弹层：各卡「查看明细」→ 该等级 品牌×规格 明细表 ---------- */
  var gradeModal = null

  function gradeDetailTableHtml(grade) {
    var items = filteredRows().filter(function (row) { return row.grade === grade })
    var brandMap = {}
    items.forEach(function (row) {
      if (!brandMap[row.brand]) brandMap[row.brand] = { brand: row.brand, rows: [] }
      brandMap[row.brand].rows.push(row)
    })
    var brands = Object.keys(brandMap).map(function (key) {
      var group = brandMap[key]
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
      return a.brand.localeCompare(b.brand, 'zh-Hans-CN')
    })

    var totalQty = items.reduce(function (sum, row) { return sum + row.qty }, 0)
    var totalAmount = items.reduce(function (sum, row) { return sum + row.amount }, 0)
    var html = brands.map(function (group) {
      var rowsHtml = group.rows.map(function (row) {
        return '<tr>' +
          '<td class="spec-brand">' + row.brand + '</td>' +
          '<td class="spec-cell">' + row.head + '</td>' +
          '<td class="spec-cell">' + row.kg + '</td>' +
          '<td><span class="spec-remark' + (row.remark ? '' : ' spec-remark--empty') + '">' +
          (row.remark || '—') + '</span></td>' +
          '<td class="td-num">' + formatNumber(row.qty) + '</td>' +
          '<td class="td-num spec-price">¥' + formatPrice(row.price) + '</td></tr>'
      }).join('')
      rowsHtml += '<tr class="spec-subtotal"><td colspan="4">小计 · ' + group.brand + '</td><td class="td-num"><b>' +
        formatNumber(group.qty) + '</b></td><td class="td-num spec-price"><b>¥' + formatPrice(group.price) +
        '</b></td></tr>'
      return rowsHtml
    }).join('')
    if (!brands.length) {
      html = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">当前筛选范围没有该等级的规格数据</td></tr>'
    } else {
      html += '<tr class="spec-total"><td colspan="4">合计 · ' + GRADE_LABEL[grade] + '（全部品牌）</td><td class="td-num"><b>' +
        formatNumber(totalQty) + '</b> 件</td><td class="td-num spec-price"><b>¥' +
        formatPrice(totalQty ? totalAmount / totalQty : null) + '</b></td></tr>'
    }
    return '<table class="spec-table spec-table--grade"><thead><tr>' +
      '<th>品牌</th><th>头数</th><th>KG</th><th>备注</th><th>总件数</th><th>每件均价</th>' +
      '</tr></thead><tbody>' + html + '</tbody></table>'
  }

  function openGradeDetail(grade) {
    if (!GRADE_ORDER.includes(grade)) return
    var items = filteredRows().filter(function (row) { return row.grade === grade })
    var qty = items.reduce(function (sum, row) { return sum + row.qty }, 0)
    var amount = items.reduce(function (sum, row) { return sum + row.amount }, 0)
    gradeModal.querySelector('.modal-heading h2').innerHTML = GRADE_LABEL[grade] +
      ' · 规格明细<span class="modal-sub">共 ' + formatNumber(qty) + ' 件 · 加权均价 ¥' +
      formatPrice(qty ? amount / qty : null) + '</span>'
    gradeModal.querySelector('.spec-table-wrap').innerHTML = gradeDetailTableHtml(grade)
    gradeModal.hidden = false
    document.getElementById('grade-modal-close').focus()
  }

  function closeGradeDetail() {
    gradeModal.hidden = true
  }

  function bindGradeModal() {
    gradeModal = document.getElementById('grade-modal')
    document.getElementById('spec-summary').addEventListener('click', function (event) {
      var button = event.target.closest('.grade-detail-btn')
      if (button) openGradeDetail(button.dataset.grade)
    })
    document.getElementById('grade-modal-close').addEventListener('click', closeGradeDetail)
    gradeModal.addEventListener('click', function (event) {
      if (event.target === gradeModal) closeGradeDetail()
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !gradeModal.hidden) closeGradeDetail()
    })
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
    })

    var gradeSelect = document.getElementById('spec-grade-filter')
    gradeSelect.innerHTML = '<option value="">全部等级</option>' + GRADE_ORDER.map(function (grade) {
      return '<option value="' + grade + '">' + GRADE_LABEL[grade] + '</option>'
    }).join('')
    gradeSelect.addEventListener('change', function () {
      gradeFilter = gradeSelect.value
      renderSpecSummary()
    })
  }

  /* ---------- 启动 ---------- */
  renderHero()
  bindHeroMetric()
  renderGradeDonut()
  renderGradePriceBars()
  renderMarket()
  bindFilters()
  renderSpecSummary()
  bindGradeModal()
  setTrendMetric(trendMetric)
  window.addEventListener('resize', function () { trendChart.resize() })

  /* ---------- 预览辅助：URL 参数驱动（无头截图验收用） ----------
   * ?detail=A|B|C          载入即弹出该等级明细（验收弹层；1 视同 A）
   * ?metric=amount|quantity|price|containers
   *                        趋势图载入即切到该指标（验收联动）
   * ?report=height         渲染后把整页高度写进 <title>（配合 --dump-dom 读数） */
  var params = new URLSearchParams(window.location.search)
  var detailGrade = String(params.get('detail') || '').toUpperCase()
  if (detailGrade === '1') detailGrade = 'A'
  if (GRADE_ORDER.includes(detailGrade)) {
    window.setTimeout(function () { openGradeDetail(detailGrade) }, 200)
  }
  var metricParam = params.get('metric')
  if (metricParam && METRICS[metricParam] && metricParam !== trendMetric) {
    setTrendMetric(metricParam)
  }
  if (params.get('report') === 'height') {
    window.setTimeout(function () {
      document.title = 'PAGE_HEIGHT=' + document.documentElement.scrollHeight +
        ';VIEW_WIDTH=' + window.innerWidth + ';VIEW_HEIGHT=' + window.innerHeight
    }, 400)
  }
})()
