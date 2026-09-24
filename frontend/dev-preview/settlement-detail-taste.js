const DATA = {
  grades: [
    { grade: 'A', label: 'A 果', quantity: 486, amount: 268542, fill: 1 },
    { grade: 'B', label: 'B 果', quantity: 431, amount: 195247, fill: 0.72 },
    { grade: 'C', label: 'C 果（含 BC）', quantity: 331, amount: 98551, fill: 0.48 },
  ],
  records: [
    { date: '2026-09-16', grade: 'A', variety: '榴莲', quantity: 96, unitPrice: 561.2, amount: 53875.2 },
    { date: '2026-09-16', grade: 'B', variety: '榴莲', quantity: 104, unitPrice: 452.8, amount: 47091.2 },
    { date: '2026-09-17', grade: 'A', variety: '榴莲', quantity: 118, unitPrice: 548.6, amount: 64734.8 },
    { date: '2026-09-17', grade: 'C', variety: '榴莲', quantity: 82, unitPrice: 296.4, amount: 24304.8 },
    { date: '2026-09-18', grade: 'B', variety: '榴莲', quantity: 76, unitPrice: 458.1, amount: 34815.6 },
    { date: '2026-09-18', grade: 'C', variety: '榴莲', quantity: 57, unitPrice: 301.7, amount: 17196.9 },
  ],
}

const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

function formatNumber(value) {
  return formatter.format(value)
}

function renderGrades() {
  const totalQuantity = DATA.grades.reduce((sum, item) => sum + item.quantity, 0)
  const maxAvg = Math.max(...DATA.grades.map((item) => item.amount / item.quantity))
  const root = document.getElementById('grade-chart')

  root.innerHTML = DATA.grades
    .map((item) => {
      const avg = item.amount / item.quantity
      const share = (item.quantity / totalQuantity) * 100
      const width = (avg / maxAvg) * 100
      return `
        <div class="grade-row">
          <span class="grade-label">${item.label}</span>
          <div class="grade-track" role="img" aria-label="${item.label} 平均每件售价 ${formatNumber(avg)} 元">
            <div class="grade-fill" style="width: ${width.toFixed(1)}%; opacity: ${item.fill}"></div>
          </div>
          <span class="grade-value">${formatNumber(avg)} 元/件</span>
          <span class="grade-share">${formatNumber(item.quantity)} 件 · ${share.toFixed(1)}%</span>
        </div>`
    })
    .join('')
}

function renderRecords() {
  const root = document.getElementById('record-body')
  document.getElementById('record-count').textContent = `${DATA.records.length} 条`
  root.innerHTML = DATA.records
    .map(
      (item) => `
        <tr>
          <td>${item.date}</td>
          <td>${item.grade}</td>
          <td>${item.variety}</td>
          <td class="num">${formatNumber(item.quantity)}</td>
          <td class="num">${formatNumber(item.unitPrice)}</td>
          <td class="num">${formatNumber(item.amount)}</td>
        </tr>`,
    )
    .join('')
}

renderGrades()
renderRecords()
