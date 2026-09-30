/* 销售总览「档口数据」改版 demo 数据（视觉伴侣 · 53002）。
 * 虚构数据，但全部口径自洽：
 * - 一柜 = 一张结算单（import_batch），总柜数口径 = 结算单数，一柜两单不去重柜号（ADR-053）；
 * - 每柜带销售窗口（到达日 + N 天），日/月销售额与件数由窗口内权重分摊，
 *   年合计 = 月合计 = 日合计 = ¥1,139,162.27 / 9,821 件；
 * - 月柜数 = 当月到达的柜数（合计 15 柜），日柜数 = 当日在售柜数；
 * - 等级与规格行合计与上图 KPI 一致：A 3,200 件 / B 4,100 件 / C（含 BC） 2,521 件；
 * - 市场 × 品牌柜数矩阵与视觉稿一致：江南 晴4/香3、海吉星 晴3/钻1、白沙洲 香2/钻2。 */
window.OVERVIEW_STALL_DEMO = {
  meta: {
    year: 2026,
    rangeStart: '2026-01-02',
    rangeEnd: '2026-09-20',
    country: '越南',
    /* 较上期（演示口径，静态展示） */
    deltas: { containers: '+3 柜', amount: '+8.2%', qty: '+5.6%', avg: '+2.1%' },
    /* 全量合计锚点（规格叶行分摊后向它对齐，保证各区块交叉一致） */
    targetQty: 9821,
    targetAmount: 1139162.27,
  },

  markets: ['广州江南', '长沙海吉星', '武汉白沙洲'],
  brands: ['晴牌', '香香果', '钻牌'],

  /* 品牌 → 主要档口（规格叶行按此权重拆市场，权重与下方柜矩阵一致） */
  brandMarkets: {
    晴牌: [{ m: '广州江南', w: 4 / 7 }, { m: '长沙海吉星', w: 3 / 7 }],
    香香果: [{ m: '广州江南', w: 3 / 5 }, { m: '武汉白沙洲', w: 2 / 5 }],
    钻牌: [{ m: '长沙海吉星', w: 1 / 3 }, { m: '武汉白沙洲', w: 2 / 3 }],
  },

  /* 15 柜（结算单）：arrive 决定月柜数归属；days 为在售天数；qty/amount 合计 = KPI */
  containers: [
    { market: '广州江南', brand: '晴牌', arrive: '2026-01-02', days: 14, qty: 720, amount: 84260.00 },
    { market: '广州江南', brand: '晴牌', arrive: '2026-02-05', days: 13, qty: 610, amount: 71850.00 },
    { market: '长沙海吉星', brand: '晴牌', arrive: '2026-02-18', days: 14, qty: 540, amount: 63270.00 },
    { market: '广州江南', brand: '香香果', arrive: '2026-03-10', days: 15, qty: 830, amount: 97640.00 },
    { market: '武汉白沙洲', brand: '香香果', arrive: '2026-04-03', days: 13, qty: 480, amount: 55830.00 },
    { market: '广州江南', brand: '晴牌', arrive: '2026-04-22', days: 14, qty: 760, amount: 89410.00 },
    { market: '长沙海吉星', brand: '钻牌', arrive: '2026-05-08', days: 15, qty: 650, amount: 76220.00 },
    { market: '广州江南', brand: '香香果', arrive: '2026-05-20', days: 13, qty: 590, amount: 68540.00 },
    { market: '武汉白沙洲', brand: '钻牌', arrive: '2026-06-12', days: 15, qty: 880, amount: 103280.00 },
    { market: '广州江南', brand: '晴牌', arrive: '2026-07-04', days: 14, qty: 470, amount: 54110.00 },
    { market: '长沙海吉星', brand: '晴牌', arrive: '2026-07-21', days: 13, qty: 700, amount: 81960.00 },
    { market: '武汉白沙洲', brand: '香香果', arrive: '2026-08-07', days: 14, qty: 620, amount: 72480.00 },
    { market: '长沙海吉星', brand: '晴牌', arrive: '2026-08-19', days: 13, qty: 540, amount: 63150.00 },
    { market: '广州江南', brand: '香香果', arrive: '2026-08-28', days: 15, qty: 911, amount: 105693.07 },
    { market: '武汉白沙洲', brand: '钻牌', arrive: '2026-09-05', days: 15, qty: 520, amount: 51469.20 },
  ],

  /* 规格行（等级 × 头数 × KG）：qty/price 合计出各等级件数与均价；
   * extra:true 的行在「查看全部规格」展开前折叠为「其他 N 个规格」；
   * brands 为该规格跨品牌的件数拆分权重，市场再按 brandMarkets 拆。 */
  specs: [
    { grade: 'A', head: '3头', kg: '14kg', qty: 1600, price: 132.69, brands: [{ b: '晴牌', w: 0.50 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.16 }] },
    { grade: 'A', head: '4头', kg: '13kg', qty: 540, price: 128.00, brands: [{ b: '晴牌', w: 0.44 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.22 }] },
    { grade: 'A', head: '5头', kg: '13kg', qty: 420, price: 124.91, brands: [{ b: '晴牌', w: 0.40 }, { b: '香香果', w: 0.36 }, { b: '钻牌', w: 0.24 }] },
    { grade: 'A', head: '6头', kg: '12kg', qty: 340, price: 130.50, extra: true, brands: [{ b: '晴牌', w: 0.44 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.22 }] },
    { grade: 'A', head: '4头', kg: '14kg', qty: 300, price: 127.98, extra: true, brands: [{ b: '晴牌', w: 0.44 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.22 }] },

    { grade: 'B', head: '5头', kg: '11kg', qty: 2030, price: 119.78, brands: [{ b: '晴牌', w: 0.45 }, { b: '香香果', w: 0.35 }, { b: '钻牌', w: 0.20 }] },
    { grade: 'B', head: '6头', kg: '10kg', qty: 930, price: 113.72, brands: [{ b: '晴牌', w: 0.41 }, { b: '香香果', w: 0.37 }, { b: '钻牌', w: 0.22 }] },
    { grade: 'B', head: '4头', kg: '12kg', qty: 760, price: 117.00, brands: [{ b: '晴牌', w: 0.40 }, { b: '香香果', w: 0.36 }, { b: '钻牌', w: 0.24 }] },
    { grade: 'B', head: '5头', kg: '12kg', qty: 380, price: 118.00, extra: true, brands: [{ b: '晴牌', w: 0.44 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.22 }] },

    { grade: 'C', head: '8头', kg: '8kg', qty: 900, price: 95.20, brands: [{ b: '晴牌', w: 0.42 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.24 }] },
    { grade: 'C', head: '7头', kg: '8kg', qty: 821, price: 95.67, brands: [{ b: '晴牌', w: 0.40 }, { b: '香香果', w: 0.36 }, { b: '钻牌', w: 0.24 }] },
    { grade: 'C', head: '9头', kg: '7kg', qty: 470, price: 91.00, brands: [{ b: '晴牌', w: 0.44 }, { b: '香香果', w: 0.34 }, { b: '钻牌', w: 0.22 }] },
    { grade: 'C', head: '6头', kg: '9kg', qty: 330, price: 99.50, extra: true, brands: [{ b: '晴牌', w: 0.40 }, { b: '香香果', w: 0.36 }, { b: '钻牌', w: 0.24 }] },
  ],
};
