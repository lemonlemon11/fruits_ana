const MAX = 6
const PAGE_SIZE = 6

const brandConfigs = [
  { name: '宝贝', prefix: '宝贝', count: 24, firstMerchants: ['626', '单624', '640'], firstOrders: ['宝贝L004', '宝贝01', '宝贝02'] },
  { name: '金果', prefix: '金果', count: 18, firstMerchants: ['888', '单637'], firstOrders: ['金果A2', '金果01'] },
  { name: '榴莲皇', prefix: '榴莲皇', count: 32, firstMerchants: ['单702', '701'], firstOrders: ['榴莲皇01', '榴莲皇02'] },
  { name: '未识别品牌', prefix: '未知', count: 7, firstMerchants: ['6400'], firstOrders: ['626'] },
]

const containerPool = ['TCLU1234567', 'OOLU7654321', 'CBHU2970762', 'MWCU1823691', 'GESU5566778', 'TGBU9988776']

const settlements = brandConfigs.flatMap((config) => {
  const items = []
  for (let index = 0; index < config.count; index += 1) {
    const orderNo = config.firstOrders[index] || `${config.prefix}${String(index + 1).padStart(2, '0')}`
    const merchantNo = config.firstMerchants[index] || `单${config.prefix}${index + 1}`
    items.push({
      merchantNo,
      orderNo,
      series: config.name,
      containerNo: containerPool[index % containerPool.length],
      saleDate: `2026-09-${String(14 - (index % 14)).padStart(2, '0')}`,
      totalQuantity: 60 + ((index * 17) % 130),
      averagePrice: 300 + ((index * 23) % 260),
    })
  }
  return items
})

window.SETTLEMENT_DEMO = { MAX, PAGE_SIZE, brandConfigs, settlements }
