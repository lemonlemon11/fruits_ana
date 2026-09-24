/* SLD 布局重设计 v2 · 真实数据联调版核心库。
 * 直接调用后端 /api（与正式前端同一契约），不改动任何后端逻辑。 */
(function () {
  'use strict';

  var ICONS = {
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 13l3-3 4 4 5-6"/></svg>',
    table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>',
    boxes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 8.3L12 13l8.7-4.7M12 13v9"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    chevD: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>'
  };

  /* ---------- 等级口径（与 frontend/src/utils/grades.ts 一致） ---------- */
  var GRADE_ORDER = ['A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER'];
  var GRADE_META = {
    A: { label: 'A 果', color: '#16856b' },
    B: { label: 'B 果', color: '#bd7414' },
    AB: { label: 'AB 果', color: '#8a6f2f' },
    C: { label: 'C 果（含 BC）', color: '#b94a3c' },
    D: { label: 'D 果', color: '#2f6f8f' },
    E: { label: 'E 果', color: '#7a5aa6' },
    F: { label: 'F 果', color: '#b34f82' },
    OTHER: { label: '其他', color: '#6e7780' }
  };

  function normalizeGrade(value) {
    var g = String(value == null ? '' : value).trim().toUpperCase();
    if (GRADE_ORDER.indexOf(g) >= 0) return g;
    return 'OTHER';
  }
  function gradeMeta(grade) { return GRADE_META[normalizeGrade(grade)]; }
  function activeGrades(rows) {
    var seen = {};
    (rows || []).forEach(function (r) { seen[normalizeGrade(r && r.grade)] = true; });
    return GRADE_ORDER.filter(function (g) { return seen[g]; });
  }

  /* ---------- 数字 / 日期格式化 ---------- */
  var fmt = {
    num: function (n) {
      if (n == null || isNaN(Number(n))) return '—';
      return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
    },
    money: function (n) {
      if (n == null || isNaN(Number(n))) return '—';
      return '¥' + Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
    },
    money2: function (n) {
      if (n == null || isNaN(Number(n))) return '—';
      return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    price: function (n) {
      if (n == null || isNaN(Number(n))) return '—';
      return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    pct: function (x, digits) {
      if (x == null || isNaN(Number(x))) return '—';
      return (Number(x) * 100).toFixed(digits == null ? 1 : digits) + '%';
    },
    date: function (s) { return s ? String(s).slice(0, 10) : '—'; },
    dateShort: function (s) { return s ? String(s).slice(5, 10) : '—'; },
    dt: function (s) { return s ? String(s).replace('T', ' ').slice(0, 16) : '—'; }
  };

  /* ---------- API ---------- */
  var currentUser = null;

  function api(path, options) {
    options = options || {};
    var init = {
      method: options.method || 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    };
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        init.body = options.body;
      } else {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
    }
    return fetch(path, init).then(function (res) {
      if (res.status === 401 && !options.skipAuthRedirect) {
        var next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
        location.href = 'login.html?next=' + next;
        throw new Error('请先登录');
      }
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var msg = data && data.detail
            ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
            : ('请求失败（' + res.status + '）');
          var err = new Error(msg);
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  function getUser(force) {
    if (currentUser && !force) return Promise.resolve(currentUser);
    return api('/api/auth/me', { skipAuthRedirect: true }).then(function (body) {
      var u = (body && body.user) || body || {};
      currentUser = {
        id: u.id,
        displayName: u.display_name || u.displayName || '',
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
        menus: Array.isArray(u.menus) ? u.menus : []
      };
      return currentUser;
    });
  }

  function can(permission) {
    return !!currentUser && currentUser.permissions.indexOf(permission) >= 0;
  }

  /* ---------- DOM 小工具 ---------- */
  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs() { return new URLSearchParams(location.search); }
  function setQuery(params) {
    var url = new URL(location.href);
    Object.keys(params).forEach(function (k) {
      if (params[k] == null || params[k] === '') url.searchParams.delete(k);
      else url.searchParams.set(k, params[k]);
    });
    history.replaceState(null, '', url);
  }
  function detailUrl(merchantNo) { return 'settlement-detail.html?merchant=' + encodeURIComponent(merchantNo); }

  function toast(msg, type) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = el('div', 'toast-wrap'); document.body.appendChild(wrap); }
    var t = el('div', 'toast' + (type ? ' toast-' + type : ''), esc(msg));
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  function confirmModal(options) {
    return new Promise(function (resolve) {
      var mask = el('div', 'modal-mask');
      var modal = el('div', 'modal');
      modal.appendChild(el('h3', null, esc(options.title || '确认操作')));
      modal.appendChild(el('div', 'modal-body', options.body || ''));
      var foot = el('div', 'modal-foot');
      var cancel = el('button', 'btn btn-ghost', '取 消');
      cancel.type = 'button';
      var ok = el('button', 'btn ' + (options.danger ? 'btn-accent' : 'btn-primary'), esc(options.okText || '确 定'));
      ok.type = 'button';
      foot.appendChild(cancel); foot.appendChild(ok);
      modal.appendChild(foot); mask.appendChild(modal); document.body.appendChild(mask);
      function done(v) { mask.remove(); resolve(v); }
      cancel.addEventListener('click', function () { done(false); });
      mask.addEventListener('click', function (ev) { if (ev.target === mask) done(false); });
      ok.addEventListener('click', function () { done(true); });
    });
  }

  function errorBanner(msg, retry) {
    var box = el('div', 'error-banner');
    box.setAttribute('role', 'alert');
    box.appendChild(el('span', null, '<strong>数据加载失败</strong> ' + esc(msg)));
    if (retry) {
      var btn = el('button', null, '重新查询');
      btn.type = 'button';
      btn.addEventListener('click', retry);
      box.appendChild(btn);
    }
    return box;
  }

  function skeletonCards(n) {
    var html = '';
    for (var i = 0; i < (n || 3); i++) {
      html += '<div class="skel-card"><div class="skel" style="width:40%"></div>' +
        '<div class="skel" style="width:75%;height:22px"></div><div class="skel" style="width:60%"></div></div>';
    }
    return html;
  }

  /* ---------- 图表 ---------- */
  function gradeBar(grades, totalQty) {
    var rows = (grades || []).filter(function (g) { return Number(g.sales_quantity) > 0; });
    var total = totalQty || rows.reduce(function (s, g) { return s + Number(g.sales_quantity || 0); }, 0);
    if (!total) return '<div class="faint" style="font-size:.82rem">暂无等级数据</div>';
    var html = '<div class="grade-bar">';
    rows.forEach(function (g) {
      var pct = Number(g.sales_quantity) / total * 100;
      html += '<i style="width:' + pct.toFixed(2) + '%;background:' + gradeMeta(g.grade).color + '"></i>';
    });
    return html + '</div>';
  }

  function donut(grades) {
    var rows = (grades || []).filter(function (g) { return Number(g.sales_quantity) > 0; });
    var total = rows.reduce(function (s, g) { return s + Number(g.sales_quantity || 0); }, 0);
    if (!total) return '<div class="empty-box">暂无等级数据</div>';
    var acc = 0;
    var stops = rows.map(function (g) {
      var start = acc / total * 100;
      acc += Number(g.sales_quantity);
      var end = acc / total * 100;
      return gradeMeta(g.grade).color + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%';
    });
    var html = '<div class="donut-wrap"><div class="donut" style="background:conic-gradient(' + stops.join(',') + ')"></div>';
    html += '<div class="donut-legend">';
    rows.forEach(function (g) {
      var share = g.quantity_share != null ? Number(g.quantity_share) : Number(g.sales_quantity) / total;
      html += '<div class="row"><span class="gdot" style="background:' + gradeMeta(g.grade).color + '"></span>' +
        esc(gradeMeta(g.grade).label) + ' ' + fmt.num(g.sales_quantity) + ' 件 <b>' + fmt.pct(share) + '</b></div>';
    });
    return html + '</div></div>';
  }

  function lineChart(points, options) {
    options = options || {};
    var W = 560, H = 200, padL = 8, padB = 22, padT = 10, padR = 44;
    var data = (points || []).map(function (p) { return Number(p.value) || 0; });
    if (!data.length) return '<div class="empty-box">当前范围没有趋势数据</div>';
    var max = Math.max.apply(null, data.concat([1]));
    var min = Math.min.apply(null, data.concat([0]));
    var span = max - min || 1;
    var iw = W - padL - padR, ih = H - padT - padB;
    function x(i) { return padL + (data.length === 1 ? iw / 2 : i / (data.length - 1) * iw); }
    function y(v) { return padT + ih - (v - min) / span * ih; }
    var path = data.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var area = path + ' L' + x(data.length - 1).toFixed(1) + ',' + (padT + ih) + ' L' + padL + ',' + (padT + ih) + ' Z';
    var color = options.color || '#1d9253';
    var gid = 'lg' + Math.random().toString(36).slice(2, 8);
    var html = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" style="width:100%;display:block">';
    html += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>';
    [0.25, 0.5, 0.75, 1].forEach(function (r) {
      var gy = padT + ih * r;
      html += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR + 8) + '" y2="' + gy + '" stroke="#e3ece3"/>';
      var val = max - span * r;
      html += '<text x="' + (W - 2) + '" y="' + (gy + 4) + '" font-size="10" fill="#8ba190" text-anchor="end">' + esc(options.axis ? options.axis(val) : fmt.num(val)) + '</text>';
    });
    html += '<path d="' + area + '" fill="url(#' + gid + ')"/>';
    html += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    var maxIdx = data.indexOf(max);
    html += '<circle cx="' + x(maxIdx).toFixed(1) + '" cy="' + y(max).toFixed(1) + '" r="4.5" fill="#fff" stroke="' + color + '" stroke-width="2.6"/>';
    var labelEvery = Math.ceil(data.length / 5);
    data.forEach(function (v, i) {
      if (i % labelEvery !== 0 && i !== data.length - 1) return;
      html += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" fill="#8ba190" text-anchor="middle">' + esc(fmt.dateShort(points[i].label)) + '</text>';
    });
    return html + '</svg>';
  }

  /* ---------- 外壳（侧栏 / 顶栏 / 手机栏 / 底栏） ---------- */
  var ROUTE_MAP = {
    '/overview': { id: 'overview', href: 'overview.html', icon: 'chart', label: '卖得怎么样', permission: 'overview:view' },
    '/settlements': { id: 'settlements', href: 'settlements.html', icon: 'table', label: '每一单', permission: 'settlement:list' },
    '/settlement-detail': { id: 'settlement-detail', href: 'settlement-detail.html', icon: 'search', label: '结算单详情', permission: 'settlement:detail' },
    '/settlement-comparison': { id: 'settlement-comparison', href: 'settlement-comparison.html', icon: 'compare', label: '结算单对比', permission: 'settlement:comparison' },
    '/series-comparison': { id: 'series-comparison', href: 'series-comparison.html', icon: 'boxes', label: '品牌对比', permission: 'series:comparison' },
    '/imports': { id: 'imports', href: 'imports.html', icon: 'upload', label: '录单 / 导入', permission: 'import:view' },
    '/entry': { id: 'entry', href: 'entry.html', icon: 'pen', label: '手工录单', permission: 'entry:view' }
  };
  var NAV_GROUPS = [
    { group: '经营', routes: ['/overview', '/settlements'] },
    { group: '分析', routes: ['/settlement-detail', '/settlement-comparison', '/series-comparison'] },
    { group: '录入', routes: ['/imports', '/entry'] }
  ];
  var TABS = [
    { route: '/overview', label: '看板', icon: 'chart' },
    { route: '/settlements', label: '每一单', icon: 'table' },
    { route: '/imports', label: '录单', icon: 'plus', center: true },
    { route: '/settlement-comparison', label: '对比', icon: 'compare' },
    { route: '/series-comparison', label: '品牌', icon: 'boxes' }
  ];
  var TITLES = {
    overview: '卖得怎么样', settlements: '每一单', 'settlement-detail': '结算单详情',
    'settlement-comparison': '结算单对比', 'series-comparison': '品牌对比',
    imports: '录单 / 导入', 'import-review': '导入复核', entry: '手工录单'
  };

  function icon(name) { return ICONS[name] || ICONS.chart; }

  function menuLabel(route) {
    var item = ROUTE_MAP[route];
    var menus = currentUser.menus || [];
    for (var i = 0; i < menus.length; i++) {
      if (menus[i].route_path === route && menus[i].name) return menus[i].name;
    }
    return item.label;
  }

  function visibleNav(route) {
    var item = ROUTE_MAP[route];
    var menus = currentUser.menus || [];
    for (var i = 0; i < menus.length; i++) {
      if (menus[i].route_path === route && menus[i].is_active === false) return false;
    }
    return can(item.permission);
  }

  function buildSidebar(current) {
    var html = '<div class="side-brand"><div class="logo-mark">果</div>' +
      '<div><b>果销分析</b><span>真实数据联调版</span></div></div>';
    NAV_GROUPS.forEach(function (g) {
      var items = g.routes.filter(visibleNav);
      if (!items.length) return;
      html += '<div class="side-group"><span>' + g.group + '</span><nav class="side-nav">';
      items.forEach(function (route) {
        var it = ROUTE_MAP[route];
        html += '<a class="side-item' + (it.id === current ? ' is-on' : '') + '" href="' + it.href + '">' +
          icon(it.icon) + esc(menuLabel(route)) + '</a>';
      });
      html += '</nav></div>';
    });
    var initial = esc((currentUser.displayName || '客').slice(0, 1));
    html += '<div class="side-user"><div class="avatar">' + initial + '</div><div><b>' + esc(currentUser.displayName) + '</b><span>已登录 · 真实数据</span></div></div>';
    var aside = el('aside', 'sidebar');
    aside.innerHTML = html;
    return aside;
  }

  function bellButton() {
    return '<div class="pop-wrap" data-bell><button class="icon-btn" type="button" aria-label="站内通知">' +
      icon('bell') + '<i class="dot" data-bell-dot style="display:none"></i></button></div>';
  }

  function userChip() {
    var initial = esc((currentUser.displayName || '客').slice(0, 1));
    return '<div class="pop-wrap" data-user><button class="user-chip" type="button" style="border:0;background:none;cursor:pointer;font:inherit">' +
      '<div class="avatar">' + initial + '</div>' + esc(currentUser.displayName) + '</button></div>';
  }

  function buildTopbar(title) {
    var header = el('header', 'topbar');
    header.innerHTML = '<h1>' + esc(title) + '</h1><div class="spacer"></div>' + bellButton() + userChip();
    return header;
  }

  function buildAppbar(title) {
    var header = el('header', 'appbar');
    header.innerHTML = '<div class="logo-mark">果</div>' +
      '<div class="appbar-title"><b>' + esc(title) + '</b><span>果销分析 · 真实数据</span></div>' + bellButton();
    return header;
  }

  function buildTabbar(current) {
    var nav = el('nav', 'tabbar');
    var html = '';
    TABS.forEach(function (t) {
      var it = ROUTE_MAP[t.route];
      if (!visibleNav(t.route)) return;
      if (t.center) {
        html += '<a class="tab tab-center' + (it.id === current ? ' is-on' : '') + '" href="' + it.href + '">' +
          '<span class="fab">' + icon(t.icon) + '</span><span>' + t.label + '</span></a>';
      } else {
        html += '<a class="tab' + (it.id === current ? ' is-on' : '') + '" href="' + it.href + '">' +
          icon(t.icon) + '<span>' + t.label + '</span></a>';
      }
    });
    nav.innerHTML = html;
    return nav;
  }

  /* 通知下拉 */
  function wireBell(container) {
    var wrap = container.querySelector('[data-bell]');
    if (!wrap) return;
    var btn = wrap.querySelector('button');
    var panel = null;
    function close() { if (panel) { panel.remove(); panel = null; } }
    function open() {
      close();
      panel = el('div', 'pop-panel');
      panel.innerHTML = '<div class="pop-head">站内通知<button type="button" data-read-all>全部已读</button></div>' +
        '<div class="pop-list"><div class="empty-box">加载中…</div></div>';
      wrap.appendChild(panel);
      api('/api/notifications?limit=20').then(function (data) {
        var list = panel.querySelector('.pop-list');
        var items = (data && data.items) || [];
        if (!items.length) { list.innerHTML = '<div class="empty-box">暂无通知</div>'; return; }
        list.innerHTML = items.map(function (n) {
          return '<div class="pop-item' + (n.is_read ? '' : ' unread') + '" data-id="' + n.id + '">' +
            '<div class="t">' + esc(n.title) + (n.priority && n.priority !== 'normal' ? '<span class="status status-warn">' + esc(n.priority) + '</span>' : '') + '</div>' +
            '<div class="c">' + esc(n.content || '') + '</div>' +
            '<div class="d">' + esc(fmt.dt(n.publish_at)) + '</div></div>';
        }).join('');
        list.querySelectorAll('.pop-item').forEach(function (item) {
          item.addEventListener('click', function () {
            api('/api/notifications/' + item.dataset.id + '/read', { method: 'POST' }).then(refreshDot);
            item.classList.remove('unread');
          });
        });
      }).catch(function (e) { panel.querySelector('.pop-list').innerHTML = '<div class="empty-box">' + esc(e.message) + '</div>'; });
      panel.querySelector('[data-read-all]').addEventListener('click', function () {
        api('/api/notifications/read-all', { method: 'POST' }).then(function () {
          panel.querySelectorAll('.pop-item').forEach(function (i) { i.classList.remove('unread'); });
          refreshDot();
        });
      });
    }
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); if (panel) close(); else open(); });
    document.addEventListener('click', function (ev) { if (panel && !wrap.contains(ev.target)) close(); });
  }

  function refreshDot() {
    api('/api/notifications?limit=1').then(function (data) {
      var n = data && Number(data.unread_count || 0);
      document.querySelectorAll('[data-bell-dot]').forEach(function (dot) { dot.style.display = n > 0 ? '' : 'none'; });
    }).catch(function () {});
  }

  function wireUserMenu(container) {
    var wrap = container.querySelector('[data-user]');
    if (!wrap) return;
    var btn = wrap.querySelector('button');
    var panel = null;
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (panel) { panel.remove(); panel = null; return; }
      panel = el('div', 'pop-panel pop-user');
      panel.innerHTML = '<button type="button" data-logout>' + icon('back') + '退出登录</button>';
      wrap.appendChild(panel);
      panel.querySelector('[data-logout]').addEventListener('click', function () {
        api('/api/auth/logout', { method: 'POST', skipAuthRedirect: true }).finally(function () {
          location.href = 'login.html';
        });
      });
      document.addEventListener('click', function (e2) { if (panel && !wrap.contains(e2.target)) { panel.remove(); panel = null; } });
    });
  }

  /* ---------- 顺仔问答 ---------- */
  function mountAsk() {
    if (!can('ask:view')) return;
    var fab = el('button', 'ask-fab', '顺');
    fab.type = 'button';
    fab.title = '顺仔问答';
    var panel = el('section', 'ask-panel');
    panel.innerHTML =
      '<div class="ask-head">顺仔问答<span>用大白话问你的销售数据</span></div>' +
      '<div class="ask-msgs"><div class="ask-msg bot">你好，我是顺仔。可以直接问：「最近哪张单卖得最贵？」「香香这个品牌 A 果占比多少？」</div></div>' +
      '<form class="ask-input"><input type="text" placeholder="问一句，如：单650 每件均价多少" autocomplete="off" /><button type="submit">问</button></form>';
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    var msgs = panel.querySelector('.ask-msgs');
    var history = [];
    fab.addEventListener('click', function () { panel.classList.toggle('open'); });
    panel.querySelector('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = panel.querySelector('input');
      var q = input.value.trim();
      if (!q) return;
      input.value = '';
      msgs.appendChild(el('div', 'ask-msg user', esc(q)));
      var thinking = el('div', 'ask-msg bot', '顺仔正在查数…');
      msgs.appendChild(thinking);
      msgs.scrollTop = msgs.scrollHeight;
      api('/api/ask', { method: 'POST', body: { question: q, history: history.slice(-6) } }).then(function (res) {
        var steps = (res.steps || []).map(function (s) { return '· ' + (s.summary || s.tool); }).join('\n');
        thinking.innerHTML = esc(res.answer || '暂时没有结论') + (steps ? '<div class="steps">' + esc(steps) + '</div>' : '');
        history.push({ role: 'user', content: q }, { role: 'assistant', content: res.answer || '' });
      }).catch(function (e) {
        thinking.textContent = '没问成：' + e.message;
      }).finally(function () { msgs.scrollTop = msgs.scrollHeight; });
    });
  }

  /* ---------- 页面骨架挂载 ---------- */
  function bootShell(pageId) {
    var page = document.querySelector('.page');
    if (!page) return Promise.resolve(null);
    return getUser().catch(function (e) {
      /* 未登录 / 会话过期：统一跳登录页，避免空白页 */
      var next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
      location.href = 'login.html?next=' + next;
      throw e;
    }).then(function () {
      var title = TITLES[pageId] || '果销分析';
      var shell = el('div', 'shell');
      page.parentNode.insertBefore(shell, page);
      var main = el('div', 'shell-main');
      shell.appendChild(buildSidebar(pageId));
      shell.appendChild(main);
      var topbar = buildTopbar(title);
      var appbar = buildAppbar(title);
      main.appendChild(topbar);
      main.appendChild(appbar);
      main.appendChild(page);
      shell.appendChild(buildTabbar(pageId === 'import-review' || pageId === 'entry' ? 'imports' : pageId));
      wireBell(topbar); wireBell(appbar);
      wireUserMenu(topbar);
      refreshDot();
      mountAsk();
      document.querySelectorAll('.acc-head').forEach(function (head) {
        head.addEventListener('click', function () { head.parentElement.classList.toggle('open'); });
      });
      return currentUser;
    });
  }

  /* ---------- 录单表单（手工录单 & 导入复核共用） ---------- */
  var FIXED_FEES = ['代卖佣金', '运费', '车位费', '入场费', '搬运费', '打冷费'];

  function emptySale() { return { sale_date: '', variety: '', head_count: '', spec_kg: '', sales_quantity: '', unit_price: '', amount: null, remark: '' }; }
  function emptyAfterSale() { return { content: '', summary: '', amount: '' }; }

  function EntryForm(options) {
    options = options || {};
    this.mode = options.mode || 'manual';
    this.markets = options.markets || [];
    this.varieties = options.varieties || [];
    this.payload = {
      merchant_no: '', order_no: '', container_no: '', vehicle_no: '',
      market: '', arrival_date: '', arrival_quantity: null,
      sales: [], after_sales: [], fees: FIXED_FEES.map(function (n) { return { name: n, amount: 0, is_custom: false }; })
    };
    this.root = el('div', 'entry-form');
  }

  EntryForm.prototype.setPayload = function (p) {
    var self = this;
    if (!p) return;
    ['merchant_no', 'order_no', 'container_no', 'vehicle_no', 'market', 'arrival_date'].forEach(function (k) {
      if (p[k] != null) self.payload[k] = p[k];
    });
    if (p.arrival_quantity != null) self.payload.arrival_quantity = p.arrival_quantity;
    if (Array.isArray(p.sales)) self.payload.sales = p.sales.map(function (s) { return Object.assign(emptySale(), s); });
    if (Array.isArray(p.after_sales)) self.payload.after_sales = p.after_sales.map(function (s) { return Object.assign(emptyAfterSale(), s); });
    if (Array.isArray(p.fees) && p.fees.length) {
      self.payload.fees = p.fees.map(function (f) { return { name: f.name || '', amount: Number(f.amount) || 0, is_custom: !!f.is_custom }; });
    }
    this.render();
  };

  EntryForm.prototype.getPayload = function () {
    var p = this.payload;
    return {
      merchant_no: (p.merchant_no || '').trim(),
      order_no: (p.order_no || '').trim(),
      container_no: (p.container_no || '').trim(),
      vehicle_no: (p.vehicle_no || '').trim(),
      market: p.market || '',
      arrival_date: p.arrival_date || '',
      arrival_quantity: p.arrival_quantity === '' || p.arrival_quantity == null ? null : Number(p.arrival_quantity),
      sales: p.sales.filter(function (s) { return s.sale_date && (s.variety || String(s.sales_quantity) !== ''); }).map(function (s) {
        return {
          sale_date: s.sale_date,
          variety: s.variety || '',
          head_count: s.head_count || '',
          spec_kg: s.spec_kg || '',
          sales_quantity: Number(s.sales_quantity) || 0,
          unit_price: Number(s.unit_price) || 0,
          amount: s.amount === '' || s.amount == null ? null : Number(s.amount),
          remark: s.remark || ''
        };
      }),
      after_sales: p.after_sales.filter(function (a) { return a.content || a.summary || Number(a.amount); }).map(function (a) {
        return { content: a.content || '', summary: a.summary || '', amount: Number(a.amount) || 0 };
      }),
      fees: p.fees.filter(function (f) { return !f.is_custom || (f.name || '').trim(); }).map(function (f) {
        return { name: f.name, amount: Number(f.amount) || 0, is_custom: !!f.is_custom };
      })
    };
  };

  EntryForm.prototype.totals = function () {
    var p = this.getPayload();
    var qty = p.sales.reduce(function (s, r) { return s + r.sales_quantity; }, 0);
    var amt = p.sales.reduce(function (s, r) { return s + (r.amount != null ? r.amount : r.sales_quantity * r.unit_price); }, 0);
    var fee = p.fees.reduce(function (s, r) { return s + r.amount; }, 0);
    var after = p.after_sales.reduce(function (s, r) { return s + r.amount; }, 0);
    return { qty: qty, amt: amt, fee: fee, after: after, rows: p.sales.length };
  };

  EntryForm.prototype.optionsHtml = function (list, current, placeholder) {
    var html = '<option value="">' + esc(placeholder || '请选择') + '</option>';
    (list || []).forEach(function (v) {
      html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    if (current && (list || []).indexOf(current) < 0) {
      html += '<option value="' + esc(current) + '" selected>' + esc(current) + '</option>';
    }
    return html;
  };

  EntryForm.prototype.render = function () {
    var self = this;
    var p = this.payload;
    var t = this.totals();
    var html = '';

    html += '<div class="acc open"><button class="acc-head" type="button">① 基本信息' +
      '<span class="chev">' + icon('chevD') + '</span></button><div class="acc-body"><div class="form-grid">' +
      '<div class="field"><label>市场 <span style="color:var(--danger)">*</span></label><select data-f="market">' + this.optionsHtml(this.markets, p.market, '请选择市场') + '</select></div>' +
      '<div class="field"><label>商号 <span style="color:var(--danger)">*</span></label><input data-f="merchant_no" type="text" placeholder="如 902" value="' + esc(p.merchant_no) + '"' + (this.mode === 'review' ? ' readonly' : '') + ' /></div>' +
      '<div class="field"><label>单号 <span style="color:var(--danger)">*</span></label><input data-f="order_no" type="text" placeholder="如 金秋-005" value="' + esc(p.order_no) + '" /></div>' +
      '<div class="field"><label>到达市场日期 <span style="color:var(--danger)">*</span></label><input data-f="arrival_date" type="date" value="' + esc(p.arrival_date || '') + '" /></div>' +
      '<div class="field"><label>到货件数 <span style="color:var(--danger)">*</span></label><input data-f="arrival_quantity" type="number" min="0" placeholder="如 1977" value="' + (p.arrival_quantity == null ? '' : esc(p.arrival_quantity)) + '" /></div>' +
      '<div class="field"><label>柜号 <span style="color:var(--danger)">*</span></label><input data-f="container_no" type="text" placeholder="如 CBHU2970762" value="' + esc(p.container_no) + '" /></div>' +
      '<div class="field"><label>转运车号 <span style="color:var(--danger)">*</span></label><input data-f="vehicle_no" type="text" placeholder="如 桂ABF330" value="' + esc(p.vehicle_no) + '" /></div>' +
      '</div></div></div>';

    html += '<div class="acc open"><button class="acc-head" type="button">② 销售明细' +
      '<span class="status badge-n status-info">已填 ' + t.rows + ' 行</span>' +
      '<span class="chev">' + icon('chevD') + '</span></button><div class="acc-body" data-ef-sales></div></div>';

    html += '<div class="acc"><button class="acc-head" type="button">③ 售后（没有可不填）' +
      '<span class="chev">' + icon('chevD') + '</span></button><div class="acc-body" data-ef-after></div></div>';

    html += '<div class="acc"><button class="acc-head" type="button">④ 费用（没有可不填）' +
      '<span class="chev">' + icon('chevD') + '</span></button><div class="acc-body" data-ef-fees></div></div>';

    this.root.innerHTML = html;

    this.root.querySelectorAll('[data-f]').forEach(function (input) {
      input.addEventListener('input', function () { self.payload[input.dataset.f] = input.value; });
    });
    this.root.querySelectorAll('.acc-head').forEach(function (head) {
      head.addEventListener('click', function () { head.parentElement.classList.toggle('open'); });
    });

    this.renderSales();
    this.renderAfterSales();
    this.renderFees();
  };

  EntryForm.prototype.renderSales = function () {
    var self = this;
    var box = this.root.querySelector('[data-ef-sales]');
    var html = '';
    this.payload.sales.forEach(function (s, i) {
      html += '<div class="line-item" data-i="' + i + '">' +
        '<div class="field"><label>销售日期 *</label><input data-s="sale_date" type="date" value="' + esc(s.sale_date) + '" /></div>' +
        '<div class="field"><label>品种 / 等级</label><select data-s="variety">' + self.optionsHtml(self.varieties, s.variety, '请选择') + '</select></div>' +
        '<div class="field"><label>规格（头数）</label><input data-s="head_count" type="text" placeholder="如 9 或 9/10" value="' + esc(s.head_count) + '" /></div>' +
        '<div class="field"><label>件数 *</label><input data-s="sales_quantity" type="number" min="0" value="' + esc(s.sales_quantity) + '" /></div>' +
        '<div class="field"><label>单价（元/件）*</label><input data-s="unit_price" type="number" min="0" step="0.01" value="' + esc(s.unit_price) + '" /></div>' +
        (self.mode === 'review'
          ? '<div class="field"><label>金额（文件值）</label><input data-s="amount" type="number" min="0" step="0.01" value="' + (s.amount == null ? '' : esc(s.amount)) + '" placeholder="留空自动算" /></div>'
          : '') +
        '<div class="field"><label>备注</label><input data-s="remark" type="text" value="' + esc(s.remark) + '" /></div>' +
        '<button class="btn btn-ghost row-del" type="button" data-del="' + i + '" style="min-height:50px">删行</button>' +
        '</div>';
    });
    box.innerHTML = html +
      '<button class="btn btn-ghost btn-block" type="button" data-add-sale style="margin-top:12px;border-style:dashed">' + icon('plus') + ' 再加一行</button>' +
      '<p class="note entry-total" data-ef-total></p>';

    box.querySelectorAll('.line-item').forEach(function (row) {
      var i = Number(row.dataset.i);
      row.querySelectorAll('[data-s]').forEach(function (input) {
        input.addEventListener('input', function () {
          self.payload.sales[i][input.dataset.s] = input.value;
          self.updateTotal();
        });
      });
      row.querySelector('[data-del]').addEventListener('click', function () {
        self.payload.sales.splice(i, 1);
        self.renderSales();
        self.refreshBadge();
      });
    });
    box.querySelector('[data-add-sale]').addEventListener('click', function () {
      self.payload.sales.push(emptySale());
      self.renderSales();
      self.refreshBadge();
    });
    this.updateTotal();
  };

  EntryForm.prototype.renderAfterSales = function () {
    var self = this;
    var box = this.root.querySelector('[data-ef-after]');
    var html = '';
    this.payload.after_sales.forEach(function (a, i) {
      html += '<div class="line-item" data-i="' + i + '">' +
        '<div class="field"><label>售后内容</label><input data-a="content" type="text" placeholder="如 坏果赔付" value="' + esc(a.content) + '" /></div>' +
        '<div class="field"><label>摘要</label><input data-a="summary" type="text" value="' + esc(a.summary) + '" /></div>' +
        '<div class="field"><label>金额（元）</label><input data-a="amount" type="number" min="0" step="0.01" value="' + esc(a.amount) + '" /></div>' +
        '<button class="btn btn-ghost row-del" type="button" data-del="' + i + '" style="min-height:50px">删行</button>' +
        '</div>';
    });
    box.innerHTML = html + '<button class="btn btn-ghost btn-block" type="button" data-add-after style="margin-top:12px;border-style:dashed">再加一条售后</button>';
    box.querySelectorAll('.line-item').forEach(function (row) {
      var i = Number(row.dataset.i);
      row.querySelectorAll('[data-a]').forEach(function (input) {
        input.addEventListener('input', function () { self.payload.after_sales[i][input.dataset.a] = input.value; });
      });
      row.querySelector('[data-del]').addEventListener('click', function () {
        self.payload.after_sales.splice(i, 1);
        self.renderAfterSales();
      });
    });
    box.querySelector('[data-add-after]').addEventListener('click', function () {
      self.payload.after_sales.push(emptyAfterSale());
      self.renderAfterSales();
    });
  };

  EntryForm.prototype.renderFees = function () {
    var self = this;
    var box = this.root.querySelector('[data-ef-fees]');
    var html = '<div class="form-grid">';
    this.payload.fees.forEach(function (f, i) {
      if (f.is_custom) {
        html += '<div class="line-item" data-i="' + i + '" style="grid-template-columns:1fr 1fr auto">' +
          '<div class="field"><label>费用名称</label><input data-fn type="text" placeholder="如 冷藏费" value="' + esc(f.name) + '" /></div>' +
          '<div class="field"><label>金额（元）</label><input data-fa type="number" min="0" step="0.01" value="' + esc(f.amount) + '" /></div>' +
          '<button class="btn btn-ghost row-del" type="button" data-del="' + i + '" style="min-height:50px">删行</button></div>';
      } else {
        html += '<div class="field"><label>' + esc(f.name) + '（元）</label><input data-fa data-i="' + i + '" type="number" min="0" step="0.01" value="' + esc(f.amount) + '" /></div>';
      }
    });
    html += '</div><button class="btn btn-ghost btn-block" type="button" data-add-fee style="margin-top:12px;border-style:dashed">添加自定义费用</button>' +
      '<p class="note entry-total" data-ef-fee-total></p>';
    box.innerHTML = html;

    box.querySelectorAll('.line-item').forEach(function (row) {
      var i = Number(row.dataset.i);
      row.querySelector('[data-fn]').addEventListener('input', function (ev) { self.payload.fees[i].name = ev.target.value; });
      row.querySelector('[data-fa]').addEventListener('input', function (ev) { self.payload.fees[i].amount = ev.target.value; self.updateFeeTotal(); });
      row.querySelector('[data-del]').addEventListener('click', function () {
        self.payload.fees.splice(i, 1);
        self.renderFees();
      });
    });
    box.querySelectorAll('.form-grid [data-fa]').forEach(function (input) {
      input.addEventListener('input', function () {
        self.payload.fees[Number(input.dataset.i)].amount = input.value;
        self.updateFeeTotal();
      });
    });
    box.querySelector('[data-add-fee]').addEventListener('click', function () {
      self.payload.fees.push({ name: '', amount: 0, is_custom: true });
      self.renderFees();
    });
    this.updateFeeTotal();
  };

  EntryForm.prototype.updateTotal = function () {
    var t = this.totals();
    var node = this.root.querySelector('[data-ef-total]');
    if (node) node.innerHTML = '已合计 <b class="num">' + fmt.num(t.qty) + ' 件 · ' + fmt.money(t.amt) + '</b>（件数 × 单价自动计算，文件值优先）。';
  };
  EntryForm.prototype.updateFeeTotal = function () {
    var t = this.totals();
    var node = this.root.querySelector('[data-ef-fee-total]');
    if (node) node.innerHTML = '费用合计 <b class="num">' + fmt.money(t.fee) + '</b>' + (t.after ? '，售后合计 <b class="num">' + fmt.money(t.after) + '</b>' : '') + '。';
  };
  EntryForm.prototype.refreshBadge = function () {
    var badge = this.root.querySelector('.acc:nth-child(2) .badge-n');
    if (badge) badge.textContent = '已填 ' + this.totals().rows + ' 行';
  };

  function validSpec(text) {
    var t = String(text || '').trim();
    if (!t) return true;
    var parts = t.split(/[\/~～—\-]+/).filter(function (x) { return x !== ''; });
    if (!parts.length) return false;
    return parts.every(function (x) { return /^\d+(\.\d+)?$/.test(x) && Number(x) > 0; });
  }

  EntryForm.prototype.validate = function () {
    var p = this.getPayload();
    if (!p.market || !p.merchant_no || !p.order_no || !p.container_no || !p.vehicle_no || !p.arrival_date || p.arrival_quantity == null) {
      return '请完整填写基本信息必填项（市场 / 商号 / 单号 / 到达日期 / 到货件数 / 柜号 / 车号）';
    }
    if (!p.sales.length) return '请至少添加一条销售明细';
    for (var i = 0; i < p.sales.length; i++) {
      var s = p.sales[i];
      if (!s.sale_date || !(s.sales_quantity > 0)) return '第 ' + (i + 1) + ' 行：请填写销售日期和数量（件）';
      if (s.variety && !/^[A-Z]{1,3}$/.test(s.variety.trim())) return '第 ' + (i + 1) + ' 行：品种需为 1~3 个大写字母，如 A、AB、BC；不填按其他等级统计';
      if (!validSpec(s.head_count)) return '第 ' + (i + 1) + ' 行：规格（头数）需为数字或区间（如 3/4、9/10、10）；不填可留空';
      if (!validSpec(s.spec_kg)) return '第 ' + (i + 1) + ' 行：规格（KG）需为数字或区间（如 10、9/10）；不填可留空';
      if (Number(s.unit_price) < 0) return '第 ' + (i + 1) + ' 行：单价不能为负数';
    }
    return null;
  };

  window.V2 = {
    api: api, getUser: getUser, can: can,
    fmt: fmt, esc: esc, el: el, qs: qs, setQuery: setQuery, detailUrl: detailUrl,
    toast: toast, confirmModal: confirmModal, errorBanner: errorBanner, skeletonCards: skeletonCards,
    normalizeGrade: normalizeGrade, gradeMeta: gradeMeta, activeGrades: activeGrades,
    gradeBar: gradeBar, donut: donut, lineChart: lineChart,
    bootShell: bootShell, EntryForm: EntryForm, FIXED_FEES: FIXED_FEES,
    icon: icon
  };
})();
