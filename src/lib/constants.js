// 列定义（与原 Python 应用 1:1 对应）
export const INVENTORY_COLUMNS = [
  { key: 'seq', name: '序号', w: 48, readonly: true },
  { key: 'name', name: '品名', w: 110 },
  { key: 'spec', name: '规格', w: 80 },
  { key: 'unit', name: '单位', w: 56 },
  { key: 'init_qty', name: '原库存数量', w: 92, numeric: true },
  { key: 'init_price', name: '原库存单价', w: 88, numeric: true },
  { key: 'init_amount', name: '原库存金额', w: 92, readonly: true },
  { key: 'out_qty', name: '出库数量', w: 84, numeric: true },
  { key: 'out_price', name: '出库单价', w: 84, numeric: true },
  { key: 'out_amount', name: '出库金额', w: 88, readonly: true },
  { key: 'remain_qty', name: '现库存数量', w: 92, readonly: true },
  { key: 'remain_price', name: '现库存单价', w: 88, numeric: true },
  { key: 'remain_amount', name: '现库存金额', w: 92, readonly: true },
  { key: 'remark', name: '备注', w: 110 }
]

export const ACCOUNT_COLUMNS = [
  { key: 'date', name: '日期', w: 100 },
  { key: 'description', name: '摘要', w: 150 },
  { key: 'income', name: '收入', w: 90, numeric: true },
  { key: 'expense', name: '支出', w: 90, numeric: true },
  { key: 'balance', name: '余额', w: 90, readonly: true },
  { key: 'category', name: '分类', w: 90 },
  { key: 'remark', name: '备注', w: 110 }
]

export const MODES = ['进销存', '记账', '记事本']

export const DATA_DIR = {
  进销存: 'inventory_data',
  记账: 'account_data',
  记事本: 'notepad_data'
}

export const FILE_EXT = {
  进销存: '.json',
  记账: '.json',
  记事本: '.txt'
}

// 主题（仅保留手机上观感最好的亮/暗/灰，对应原 PC 版的常用主题）
export const THEMES = {
  亮色: {
    bg: '#f7f8fa', card: '#ffffff', fg: '#1c1c1e', sub: '#8e8e93',
    primary: '#0a84ff', primaryFg: '#ffffff', border: '#e5e5ea',
    sel: '#cce5ff', danger: '#ff3b30', inputBg: '#ffffff'
  },
  暗色: {
    bg: '#000000', card: '#1c1c1e', fg: '#f2f2f7', sub: '#98989f',
    primary: '#0a84ff', primaryFg: '#ffffff', border: '#38383a',
    sel: '#1c3a5e', danger: '#ff453a', inputBg: '#2c2c2e'
  },
  灰色: {
    bg: '#e9e9ec', card: '#f5f5f7', fg: '#1c1c1e', sub: '#6b6b70',
    primary: '#5a5a5f', primaryFg: '#ffffff', border: '#cfcfd4',
    sel: '#d2d2d7', danger: '#d23b32', inputBg: '#ffffff'
  }
}

export const DEFAULT_SETTINGS = {
  theme: '亮色',
  backup_interval_min: 5,
  font_size: 15,
  mode: '进销存',
  last_file: ''
}
