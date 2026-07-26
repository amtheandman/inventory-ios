// 与原 Python 应用一致的计算逻辑

export function num(v) {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

export function computeInventoryRow(row) {
  const init_q = num(row.init_qty)
  const init_p = num(row.init_price)
  const out_q = num(row.out_qty)
  const out_p = num(row.out_price)
  row.init_amount = round2(init_q * init_p)
  row.out_amount = round2(out_q * out_p)
  const remain_q = round2(init_q - out_q)
  row.remain_qty = remain_q
  const remain_p = row.remain_price !== '' && row.remain_price != null ? num(row.remain_price) : init_p
  row.remain_price = remain_p
  row.remain_amount = round2(remain_q * remain_p)
  return row
}

export function recalcAccount(rows) {
  let prev = 0
  for (const row of rows) {
    const income = num(row.income)
    const expense = num(row.expense)
    prev = prev + income - expense
    row.balance = round2(prev)
  }
  return rows
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function fmt(val) {
  if (val === '' || val == null) return ''
  const n = parseFloat(val)
  if (isNaN(n)) return String(val)
  if (n === Math.trunc(n)) return String(n)
  let s = n.toFixed(2)
  return s.replace(/\.?0+$/, '')
}

// 汇总统计：进销存按品名聚合
export function aggregateInventory(filesData) {
  const agg = {}
  for (const rows of filesData) {
    for (const row of rows) {
      const key = row.name || ''
      if (!key) continue
      if (!agg[key]) {
        agg[key] = {
          name: key,
          spec: row.spec || '',
          unit: row.unit || '',
          init_qty: 0, init_amount: 0,
          out_qty: 0, out_amount: 0,
          remain_qty: 0, remain_amount: 0
        }
      }
      const a = agg[key]
      a.init_qty += num(row.init_qty)
      a.init_amount += num(row.init_amount)
      a.out_qty += num(row.out_qty)
      a.out_amount += num(row.out_amount)
      a.remain_qty += num(row.remain_qty)
      a.remain_amount += num(row.remain_amount)
    }
  }
  return Object.values(agg)
}

// 汇总统计：记账按分类聚合
export function aggregateAccount(filesData) {
  const agg = {}
  for (const rows of filesData) {
    for (const row of rows) {
      const cat = row.category || '未分类'
      if (!agg[cat]) agg[cat] = { category: cat, income: 0, expense: 0 }
      agg[cat].income += num(row.income)
      agg[cat].expense += num(row.expense)
    }
  }
  return Object.values(agg)
}
