/* 销售对比 demo：真实 series-comparison 快照（香香 15 张），勾选集合本地重算。
 * 晴牌仅 1 张（同品牌 ≥2 张才可对比），按真实业务规则仅作提示。 */
(function () {
  'use strict';
  var C = window.CORE;
  var D = null;
  var chart = null;
  var state = { brand: null, selected: [] };
  var GRADE_LINE_ORDER = ['A', 'B', 'C', 'AB'];

  function brandCounts() {
    var map = {};
    D.comparison.settlements.forEach(function (it) {
      var b = it.series || '未识别品牌';
      map[b] = (map[b] || 0) + 1;
    });
    return map;
  }

  function settlementsOf(brand) {
    return D.series ? D.series.settlements.filter(function (s) { return (s.series || '未识别品牌') === brand; }) : [];
  }

  function renderBrandTabs() {
    var counts = brandCounts();
    var tabs = document.getElementById('brand-tabs');
    tabs.innerHTML = Object.keys(counts).map(function (b) {
      var active = state.brand === b;
      var enough = counts[b] >= 2;
      return '<button type="button" class="seg-btn' + (active ? ' active' : '') + '" data-brand="' + C.esc(b) + '"' +
        (enough ? '' : ' disabled title="同品牌不足 2 张，无法对比"') + '>' +
        C.esc(b) + '（' + counts[b] + ' 张）</button>';
    }).join('');
    tabs.querySelectorAll('.seg-btn[data-brand]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.brand = btn.dataset.brand;
        var list = settlementsOf(state.brand).slice(0, 3).map(function (s) { return s.merchant_no; });
        state.selected = list;
        renderBrandTabs();
        renderPicker();
        renderAll();
      });
    });
  }

  function renderPicker() {
    var list = settlementsOf(state.brand);
    var grid = document.getElementById('pick-grid');
    grid.innerHTML = list.map(function (s) {
      var checked = state.selected.indexOf(s.merchant_no) >= 0;
      return '<label class="pick-item' + (checked ? ' checked' : '') + '">' +
        '<input type="checkbox" data-m="' + C.esc(s.merchant_no) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="cell-main">' + C.esc(s.merchant_no_normalized || s.merchant_no) + '</span>' +
        '<span class="pick-sub">' + C.esc(s.order_no_normalized || s.order_no || '') + ' · ' + C.fmtMoney(s.total.sales_amount) + '</span></label>';
    }).join('');
    grid.querySelectorAll('input[type=checkbox]').forEach(function (box) {
      box.addEventListener('change', function () {
        var m = box.dataset.m;
        if (box.checked) {
          if (state.selected.indexOf(m) < 0) state.selected.push(m);
        } else {
          state.selected = state.selected.filter(function (x) { return x !== m; });
        }
        var label = box.closest('.pick-item');
        if (label) label.classList.toggle('checked', box.checked);
        document.getElementById('picked-count').textContent = '已选 ' + state.selected.length + ' 张';
        renderAll();
      });
    });
    document.getElementById('picked-count').textContent = '已选 ' + state.selected.length + ' 张';
    var note = document.getElementById('picker-note');
    note.textContent = '同品牌 ≥ 2 张才可对比 · 勾选即时重算（晴牌仅 1 张，不可对比）';
  }

  function selectedSettlements() {
    var list = settlementsOf(state.brand).filter(function (s) { return state.selected.indexOf(s.merchant_no) >= 0; });
    var order = state.selected;
    return list.sort(function (a, b) { return order.indexOf(a.merchant_no) - order.indexOf(b.merchant_no); });
  }

  function renderOverview(sel) {
    var head = document.getElementById('ov-head');
    var body = document.getElementById('ov-body');
    var foot = document.getElementById('ov-foot');
    if (sel.length < 2) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td class="picker-note">至少勾选 2 张同品牌结算单后再对比</td></tr>';
      foot.innerHTML = '';
      return;
    }
    var grades = [];
    sel.forEach(function (s) {
      (s.grades || []).forEach(function (g) {
        if (grades.indexOf(g.grade) < 0) grades.push(g.grade);
      });
    });
    grades.sort(function (a, b) { return GRADE_LINE_ORDER.concat(['OTHER']).indexOf(a) - GRADE_LINE_ORDER.concat(['OTHER']).indexOf(b); });
    head.innerHTML = '<tr><th>商号</th><th>品牌</th>' + grades.map(function (g) {
      return '<th>' + C.esc(C.gradeMeta(g).name) + '</th>';
    }).join('') + '<th class="num">总件数</th><th class="num">总金额</th></tr>';

    var sumQty = 0, sumAmount = 0;
    var gradeSums = {};
    body.innerHTML = sel.map(function (s) {
      var qty = s.total.sales_quantity, amount = s.total.sales_amount;
      sumQty += qty; sumAmount += amount;
      return '<tr>' +
        '<td><span class="cell-main">' + C.esc(s.merchant_no_normalized || s.merchant_no) + '</span>' +
        '<div class="cell-sub">' + C.esc(s.order_no_normalized || s.order_no || '') + '</div></td>' +
        '<td>' + C.esc(s.series || '未识别品牌') + '</td>' +
        grades.map(function (g) {
          var hit = (s.grades || []).find(function (x) { return x.grade === g; });
          var q = hit ? hit.sales_quantity : 0;
          var share = hit ? hit.quantity_share : null;
          gradeSums[g] = (gradeSums[g] || 0) + q;
          var meta = C.gradeMeta(g);
          return '<td><div class="share-inline"><span>' + C.fmtInt(q) + '</span>' +
            '<span class="mini-bar"><i style="width:' + ((share || 0) * 100).toFixed(1) + '%;background:' + meta.color + '"></i></span>' +
            '<span class="cell-sub">' + C.fmtPct(share) + '</span></div></td>';
        }).join('') +
        '<td class="num">' + C.fmtInt(qty) + '</td>' +
        '<td class="num">' + C.fmtMoney(amount) + '</td></tr>';
    }).join('');
    foot.innerHTML = '<tr class="mb-foot"><td colspan="2">合计（' + sel.length + ' 张）</td>' +
      grades.map(function (g) {
        return '<td><div class="share-inline"><span>' + C.fmtInt(gradeSums[g] || 0) + '</span>' +
          '<span class="cell-sub">' + C.fmtPct((gradeSums[g] || 0) / (sumQty || 1)) + '</span></div></td>';
      }).join('') +
      '<td class="num">' + C.fmtInt(sumQty) + '</td>' +
      '<td class="num">' + C.fmtMoney(sumAmount) + '</td></tr>';
  }

  function renderChart(sel) {
    var el = document.getElementById('price-chart');
    if (sel.length < 2) { chart.clear(); return; }
    var grades = GRADE_LINE_ORDER.filter(function (g) {
      return sel.some(function (s) { return (s.grades || []).some(function (x) { return x.grade === g && x.sales_quantity > 0; }); });
    });
    chart.setOption({
      grid: { left: 8, right: 12, top: 34, bottom: 4, containLabel: true },
      legend: { top: 0, left: 'center', icon: 'circle', itemWidth: 8, textStyle: { color: '#4b5563', fontSize: 12 } },
      tooltip: Object.assign(C.tooltipBase(), {
        formatter: function (params) {
          var idx = params[0].dataIndex;
          var s = sel[idx];
          var rows = params.map(function (p) {
            return '<span style="color:' + p.color + '">●</span> ' + C.esc(p.seriesName) + ' ¥' + Number(p.value).toFixed(2);
          }).join('<br/>');
          return '<strong>' + C.esc(s.merchant_no_normalized || s.merchant_no) + ' · ' + C.esc(s.order_no_normalized || '') + '</strong><br/>' + rows;
        },
      }),
      xAxis: {
        type: 'category',
        data: sel.map(function (s) { return s.merchant_no_normalized || s.merchant_no; }),
        axisLine: { lineStyle: { color: '#D8E2DC' } }, axisTick: { show: false },
        axisLabel: { color: '#9CA3AF', fontSize: 11, interval: 0, rotate: sel.length > 8 ? 28 : 0 },
      },
      yAxis: {
        type: 'value', scale: true, name: '元/件',
        splitLine: { lineStyle: { color: '#EDF2EE' } },
        axisLabel: { color: '#9CA3AF', fontSize: 11 }, nameTextStyle: { color: '#9CA3AF', fontSize: 11 },
      },
      series: grades.map(function (g) {
        var meta = C.gradeMeta(g);
        return {
          type: 'line', name: meta.name, smooth: false, symbol: 'circle', symbolSize: 6,
          data: sel.map(function (s) {
            var hit = (s.grades || []).find(function (x) { return x.grade === g; });
            return hit && hit.weighted_avg_price != null ? Number(hit.weighted_avg_price.toFixed(2)) : null;
          }),
          lineStyle: { color: meta.color, width: 2 },
          itemStyle: { color: meta.color, borderColor: '#fff', borderWidth: 1.5 },
        };
      }),
    }, { notMerge: true });
  }

  /* AI 结论结构化渲染：小节标题行 → 色点标题 + 圆点列表；空等级合并成一行紧凑提示；
   * 数字（带单位）加粗强调。原始文本来自真实模型缓存，解析只做排版不做内容改写。 */
  var AI_SECTION_COLORS = {
    整体行情: '#14532D', A: '#1E7A4F', B: '#D9820B', C: '#D64545',
    AB: '#8A5CD4', BC: '#B3543F', D: '#4C9A80', E: '#5B8A72', F: '#8A94A1', 其他: '#8A94A1',
  };
  function aiSectionColor(title) {
    var t = title.replace(/\s/g, '');
    if (AI_SECTION_COLORS[t] != null && t === '整体行情') return AI_SECTION_COLORS[t];
    var m = t.match(/^(AB|BC|A|B|C|D|E|F|其他)果/);
    if (m) return AI_SECTION_COLORS[m[1]] || '#64748B';
    return '#64748B';
  }
  function highlightNums(escaped) {
    return escaped.replace(/(\d[\d,]*(?:\.\d+)?)( ?)(件|元|%|张|柜|个百分点|行)/g, function (_, num, space, unit) {
      var parts = num.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return '<b class="ai-num">' + parts.join('.') + '</b>' + space + unit;
    });
  }
  function renderAiBody(raw) {
    var body = document.getElementById('ai-body');
    body.innerHTML = '';
    var sections = [];
    var cur = null;
    raw.split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      if (t.charAt(0) === '-') {
        if (!cur) { cur = { title: '结论', items: [] }; sections.push(cur); }
        cur.items.push(t.replace(/^[-•]\s*/, ''));
      } else {
        cur = { title: t, items: [] };
        sections.push(cur);
      }
    });

    function bullets(items) {
      return '<ul class="ai-bullets">' + items.map(function (it) {
        return '<li>' + highlightNums(C.esc(it)) + '</li>';
      }).join('') + '</ul>';
    }

    /* 看板式布局：整体行情通栏 hero → 等级卡三列并排 → 暂无数据行 → 留意建议横排 */
    var hero = null, insight = null, grades = [], emptyBuf = [];
    sections.forEach(function (sec) {
      var title = sec.title.replace(/\s/g, '');
      if (title === '整体行情') { hero = sec; return; }
      if (title === '可以留意的地方') { insight = sec; return; }
      if ((sec.items.length === 1 && sec.items[0] === '暂无数据') || sec.items.length === 0) {
        emptyBuf.push(sec.title);
        return;
      }
      grades.push(sec);
    });

    if (hero) {
      var h = C.el('div', 'ai-hero');
      h.innerHTML =
        '<div class="ai-hero-title"><span class="ai-section-dot" style="background:#14532D"></span><span class="ai-section-title">' + C.esc(hero.title) + '</span>' +
        '<span class="ai-hero-tag">窗口合计</span></div>' + bullets(hero.items);
      body.appendChild(h);
    }

    if (grades.length) {
      var wrap = C.el('div', 'ai-cards');
      grades.forEach(function (sec) {
        var color = aiSectionColor(sec.title);
        var card = C.el('div', 'ai-grade-card');
        card.style.setProperty('--card-color', color);
        card.style.setProperty('--card-soft', color + '14');
        card.style.setProperty('--card-line', color + '33');
        card.innerHTML =
          '<div class="ai-grade-head"><span class="ai-section-dot" style="background:' + color + '"></span>' +
          '<span class="ai-section-title">' + C.esc(sec.title) + '</span></div>' + bullets(sec.items);
        wrap.appendChild(card);
      });
      body.appendChild(wrap);
    }

    if (emptyBuf.length) {
      var row = C.el('div', 'ai-empty-row');
      row.innerHTML = '<span class="ai-empty-label">暂无数据</span>' + emptyBuf.map(function (t) {
        return '<span class="ai-empty-chip">' + C.esc(t) + '</span>';
      }).join('');
      body.appendChild(row);
    }

    if (insight && insight.items.length) {
      var box = C.el('div', 'ai-insight');
      box.innerHTML =
        '<div class="ai-hero-title ai-insight-head"><span class="ai-insight-badge">留意</span><span class="ai-section-title">' + C.esc(insight.title) + '</span></div>' +
        '<ol class="ai-insight-list">' + insight.items.map(function (it, i) {
          return '<li><span class="ai-insight-no">' + (i + 1) + '</span><span>' + highlightNums(C.esc(it)) + '</span></li>';
        }).join('') + '</ol>';
      body.appendChild(box);
    }
  }

  function renderAi() {
    var ai = D.aiAnalysis;
    var badge = document.getElementById('ai-badge');
    var model = document.getElementById('ai-model');
    var body = document.getElementById('ai-body');
    if (ai && ai.content) {
      badge.textContent = '真实模型结论' + (ai.cached ? ' · 缓存命中' : ' · 本次生成');
      model.textContent = '模型 ' + (ai.model || '–') + ' · 数据窗口 ' + (D.apiWindow.start + ' ~ ' + D.apiWindow.end) + ' · 全量口径，不随勾选变化';
      renderAiBody(ai.content);
    } else {
      badge.textContent = '暂无缓存结论';
      model.textContent = '';
      body.textContent = '快照未包含该范围的 AI 结论缓存；在真实系统「销售对比」页生成后会出现在这里。demo 不主动调用生成接口。';
    }
  }

  function renderAll() {
    var sel = selectedSettlements();
    renderOverview(sel);
    renderChart(sel);
  }

  function init() {
    C.renderShell('compare', '销售对比', '勾选同品牌结算单对比各等级表现（真实接口数据）',
      '<div class="chip date-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>' +
      '<span class="chip-label">销售日期</span><strong>' + (window.REAL_DATA ? window.REAL_DATA.apiWindow.start.replace(/-/g, '/') + ' → ' + window.REAL_DATA.apiWindow.end.replace(/-/g, '/') : '') + '</strong></div>');

    if (!C.data()) { C.showMissingData(); return; }
    D = C.data();
    chart = C.makeChart('price-chart');

    if (!D.series) {
      document.getElementById('picker-note').textContent = '快照中没有可对比的品牌数据（同品牌 ≥2 张）';
      renderAi();
      return;
    }
    var counts = brandCounts();
    var first = Object.keys(counts).find(function (b) { return counts[b] >= 2 && settlementsOf(b).length; });
    state.brand = first || Object.keys(counts)[0];
    state.selected = settlementsOf(state.brand).slice(0, 3).map(function (s) { return s.merchant_no; });
    renderBrandTabs();
    renderPicker();
    renderAll();
    renderAi();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
