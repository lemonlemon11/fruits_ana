/* SLD 布局重设计 · 视觉伴侣共享脚本：注入桌面侧边栏 / 手机顶栏与底部 Tab，并提供轻交互。 */
(function () {
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
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    chevD: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9.5h6M9 13h6M12 7.5v9"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 8.3L12 13l8.7-4.7M12 13v9"/></svg>',
    price: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4L11 3.8A2 2 0 0 0 9.6 3.2H4a1 1 0 0 0-1 1v5.6c0 .5.2 1 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.7" r="1.2"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
  };

  var NAV = [
    { group: '经营', items: [
      { id: 'overview', label: '卖得怎么样', icon: 'chart', href: 'overview.html' },
      { id: 'settlements', label: '每一单', icon: 'table', href: 'settlements.html' }
    ]},
    { group: '分析', items: [
      { id: 'settlement-detail', label: '结算单详情', icon: 'search', href: 'settlement-detail.html' },
      { id: 'settlement-comparison', label: '结算单对比', icon: 'compare', href: 'settlement-comparison.html' },
      { id: 'series-comparison', label: '品牌对比', icon: 'boxes', href: 'series-comparison.html' }
    ]},
    { group: '录入', items: [
      { id: 'imports', label: '录单 / 导入', icon: 'upload', href: 'imports.html' },
      { id: 'entry', label: '手工录单', icon: 'pen', href: 'entry.html' }
    ]}
  ];

  var TABS = [
    { id: 'overview', label: '看板', icon: 'chart', href: 'overview.html' },
    { id: 'settlements', label: '每一单', icon: 'table', href: 'settlements.html' },
    { id: 'imports', label: '录单', icon: 'plus', href: 'imports.html', center: true },
    { id: 'settlement-comparison', label: '对比', icon: 'compare', href: 'settlement-comparison.html' },
    { id: 'series-comparison', label: '品牌', icon: 'boxes', href: 'series-comparison.html' }
  ];

  var TITLES = {
    'overview': '卖得怎么样',
    'settlements': '每一单',
    'settlement-detail': '结算单详情',
    'settlement-comparison': '结算单对比',
    'series-comparison': '品牌对比',
    'imports': '录单 / 导入',
    'import-review': '导入复核',
    'entry': '手工录单'
  };

  function icon(name) { return ICONS[name] || ICONS.chart; }

  function buildSidebar(current) {
    var html = '<div class="side-brand"><div class="logo-mark">果</div>' +
      '<div><b>果销分析</b><span>水果市场销售分析</span></div></div>';
    NAV.forEach(function (g) {
      html += '<div class="side-group"><span>' + g.group + '</span><nav class="side-nav">';
      g.items.forEach(function (it) {
        html += '<a class="side-item' + (it.id === current ? ' is-on' : '') + '" href="' + it.href + '">' +
          icon(it.icon) + it.label + '</a>';
      });
      html += '</nav></div>';
    });
    html += '<div class="side-user"><div class="avatar">李</div><div><b>果农李叔</b><span>嘉兴水果市场</span></div></div>';
    var aside = document.createElement('aside');
    aside.className = 'sidebar';
    aside.innerHTML = html;
    return aside;
  }

  function buildTopbar(title) {
    var el = document.createElement('header');
    el.className = 'topbar';
    el.innerHTML = '<h1>' + title + '</h1>' +
      '<button class="chip" type="button">' + icon('cal') + '2026-08-11 ~ 2026-09-09</button>' +
      '<button class="chip" type="button">全部商号' + icon('chevD') + '</button>' +
      '<div class="spacer"></div>' +
      '<button class="icon-btn" type="button" aria-label="站内通知">' + icon('bell') + '<i class="dot"></i></button>' +
      '<div class="user-chip"><div class="avatar">李</div>李叔</div>';
    return el;
  }

  function buildAppbar(title) {
    var el = document.createElement('header');
    el.className = 'appbar';
    el.innerHTML = '<div class="logo-mark">果</div>' +
      '<div class="appbar-title"><b>' + title + '</b><span>果销分析 · 卖果明白账</span></div>' +
      '<button class="icon-btn" type="button" aria-label="站内通知">' + icon('bell') + '<i class="dot"></i></button>';
    return el;
  }

  function buildTabbar(current) {
    var nav = document.createElement('nav');
    nav.className = 'tabbar';
    var html = '';
    TABS.forEach(function (t) {
      if (t.center) {
        html += '<a class="tab tab-center' + (t.id === current ? ' is-on' : '') + '" href="' + t.href + '">' +
          '<span class="fab">' + icon(t.icon) + '</span><span>' + t.label + '</span></a>';
      } else {
        html += '<a class="tab' + (t.id === current ? ' is-on' : '') + '" href="' + t.href + '">' +
          icon(t.icon) + '<span>' + t.label + '</span></a>';
      }
    });
    nav.innerHTML = html;
    return nav;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.querySelector('.page');
    if (!page) return; /* 登录页无外壳 */
    var current = document.body.dataset.page || '';
    var title = TITLES[current] || '果销分析';

    var shell = document.createElement('div');
    shell.className = 'shell';
    page.parentNode.insertBefore(shell, page);

    var main = document.createElement('div');
    main.className = 'shell-main';
    shell.appendChild(buildSidebar(current));
    shell.appendChild(main);
    main.appendChild(buildTopbar(title));
    main.appendChild(buildAppbar(title));
    main.appendChild(page);
    shell.appendChild(buildTabbar(current === 'import-review' || current === 'entry' ? 'imports' : current));

    /* 手风琴 */
    document.querySelectorAll('.acc-head').forEach(function (head) {
      head.addEventListener('click', function () {
        head.parentElement.classList.toggle('open');
      });
    });
    /* 单选 chips */
    document.querySelectorAll('[data-chip-group]').forEach(function (group) {
      group.addEventListener('click', function (ev) {
        var chip = ev.target.closest('.chip');
        if (!chip) return;
        group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
        chip.classList.add('is-on');
      });
    });
  });
})();
