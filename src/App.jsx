import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  INVENTORY_COLUMNS, ACCOUNT_COLUMNS, MODES, DATA_DIR, FILE_EXT,
  THEMES, DEFAULT_SETTINGS
} from './lib/constants'
import * as store from './lib/storage'
import {
  computeInventoryRow, recalcAccount, num, round2, fmt,
  aggregateInventory, aggregateAccount
} from './lib/calc'
import * as XLSX from 'xlsx'

/* ============================ 工具 ============================ */
function getColumns(mode) {
  return mode === '进销存' ? INVENTORY_COLUMNS : ACCOUNT_COLUMNS
}
function readonlySet(mode) {
  return mode === '进销存'
    ? new Set(['seq', 'init_amount', 'out_amount', 'remain_qty', 'remain_amount'])
    : new Set(['balance'])
}
function numericSet(mode) {
  return mode === '进销存'
    ? new Set(['init_qty', 'init_price', 'out_qty', 'out_price', 'remain_price'])
    : new Set(['income', 'expense'])
}

function blankRow(mode) {
  const cols = getColumns(mode)
  const row = {}
  for (const c of cols) row[c.key] = ''
  if (mode === '进销存') {
    row.init_qty = 0; row.init_price = 0; row.out_qty = 0
    row.out_price = 0; row.remain_price = 0
  } else {
    row.date = new Date().toISOString().slice(0, 10)
    row.income = 0; row.expense = 0
  }
  return row
}

function processRows(mode, rows) {
  if (mode === '进销存') return rows.map(computeInventoryRow)
  return recalcAccount(rows.map(r => ({ ...r })))
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

/* ============================ 全局 Toast ============================ */
let toastTimer = null
function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(onDone, 1800)
    return () => clearTimeout(toastTimer)
  }, [msg, onDone])
  if (!msg) return null
  return <div className="toast">{msg}</div>
}

/* ============================ 底部 Sheet ============================ */
function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

/* ============================ 表格屏 ============================ */
function TableScreen({ mode, settings }) {
  const [files, setFiles] = useState([])
  const [current, setCurrent] = useState('')
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | {row, idx}
  const [fileSheet, setFileSheet] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState(todayStr())
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  const cols = getColumns(mode)
  const ro = readonlySet(mode)
  const nu = numericSet(mode)
  const dir = DATA_DIR[mode]

  const refreshFiles = useCallback(async () => {
    const list = await store.listFiles(dir)
    const jsons = list.filter(f => f.endsWith('.json') && !f.endsWith('.bak'))
    jsons.sort((a, b) => (a < b ? 1 : -1))
    setFiles(jsons)
    return jsons
  }, [dir])

  const openFile = useCallback(async (name) => {
    if (!name) return
    setBusy(true)
    try {
      const data = await store.readJson(`${dir}/${name}`)
      setRows(processRows(mode, Array.isArray(data) ? data : []))
      setCurrent(name)
      await store.writeSession(`${dir}/${name}`)
    } catch (e) {
      setToast('打开失败：' + e.message)
    } finally {
      setBusy(false)
    }
  }, [dir, mode])

  useEffect(() => {
    (async () => {
      const jsons = await refreshFiles()
      if (jsons.length) {
        const sess = await store.readSession()
        const want = sess && sess.last_file ? sess.last_file.split('/').pop() : ''
        if (want && jsons.includes(want)) await openFile(want)
        else await openFile(jsons[0])
      } else {
        await openFile(todayStr() + '.json')
      }
    })()
  }, [mode]) // eslint-disable-line

  const save = useCallback(async (newRows) => {
    if (!current) return
    await store.backup(`${dir}/${current}`)
    await store.writeJson(`${dir}/${current}`, newRows)
  }, [dir, current])

  const onAdd = () => setEditing({ row: blankRow(mode), idx: -1 })
  const onEdit = (idx) => setEditing({ row: { ...rows[idx] }, idx })
  const onDelete = async (idx) => {
    const nr = rows.filter((_, i) => i !== idx)
    setRows(nr); await save(nr); setToast('已删除一行')
  }

  const commitEdit = async (row) => {
    let nr
    if (editing.idx < 0) nr = [...rows, row]
    else { nr = rows.slice(); nr[editing.idx] = row }
    nr = processRows(mode, nr)
    setRows(nr); await save(nr); setEditing(null); setToast('已保存')
  }

  const doNewFile = () => {
    setNewName(todayStr()); setNewOpen(true)
  }
  const commitNew = async () => {
    const fname = (newName.trim() || todayStr()) + '.json'
    if (files.includes(fname)) { setToast('已存在，直接打开'); setNewOpen(false); await openFile(fname); return }
    await store.writeJson(`${dir}/${fname}`, [])
    await refreshFiles()
    setNewOpen(false)
    await openFile(fname)
  }

  const doImport = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = XLSX.read(text, { type: 'string' })
      const sheet = parsed.Sheets[parsed.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      // 按中文列名映射
      const nameMap = {}
      for (const c of cols) nameMap[c.name] = c.key
      const mapped = json.map(r => {
        const row = {}
        for (const c of cols) {
          const src = nameMap[c.name]
          let v = r[c.name]
          if (v == null) v = ''
          row[c.key] = typeof v === 'number' ? v : String(v)
        }
        return row
      })
      const nr = processRows(mode, mapped)
      setRows(nr); await save(nr); setToast(`已导入 ${nr.length} 行`)
    } catch (err) {
      setToast('导入失败：' + err.message)
    }
    e.target.value = ''
  }

  const doExport = () => {
    if (!rows.length) { setToast('没有数据'); return }
    const data = rows.map(r => {
      const o = {}
      for (const c of cols) o[c.name] = fmt(r[c.key])
      return o
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mode)
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (current || mode) + '.xlsx'
    a.click()
    setToast('已导出 Excel')
  }

  const filtered = rows.filter(r =>
    !search || cols.some(c => String(r[c.key] ?? '').includes(search))
  )

  return (
    <div className="content">
      <div className="searchbar">
        <input placeholder="搜索…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn small ghost" onClick={() => setFileSheet(true)}>
          {current ? current.replace('.json', '') : '档案'}
        </button>
      </div>

      <div className="btn-row">
        <button className="btn small" onClick={onAdd}>+ 新增</button>
        <button className="btn small ghost" onClick={() => document.getElementById('imp').click()}>导入CSV</button>
        <button className="btn small ghost" onClick={doExport}>导出Excel</button>
        <input id="imp" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={doImport} />
      </div>

      {busy && <div className="empty">加载中…</div>}
      {!busy && filtered.length === 0 && (
        <div className="empty">暂无数据，点“+ 新增”或“导入CSV”</div>
      )}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>{cols.map(c => <th key={c.key}>{c.name}</th>)}<th>操作</th></tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} onClick={() => onEdit(i)}>
                  {cols.map(c => (
                    <td key={c.key} className={ro.has(c.key) ? 'ro' : ''}>
                      {fmt(r[c.key])}
                    </td>
                  ))}
                  <td>
                    <button className="btn small danger"
                      onClick={ev => { ev.stopPropagation(); onDelete(i) }}>删</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="fab" onClick={onAdd}>+</button>

      {fileSheet && (
        <Sheet title="选择档案" onClose={() => setFileSheet(false)}>
          <div className="card-list">
            {files.map(f => (
              <div className="card" key={f} onClick={async () => { setFileSheet(false); await openFile(f) }}>
                <div className="title">{f.replace('.json', '')}</div>
                <div className="chev">›</div>
              </div>
            ))}
            {files.length === 0 && <div className="empty">还没有档案</div>}
          </div>
          <div className="btn-row">
            <button className="btn block" onClick={doNewFile}>+ 新建档案</button>
          </div>
        </Sheet>
      )}

      {newOpen && (
        <Sheet title="新建档案" onClose={() => setNewOpen(false)}>
          <div className="field">
            <label>档案名称（默认今天日期）</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={todayStr()} />
          </div>
          <div className="btn-row">
            <button className="btn block" onClick={commitNew}>创建并打开</button>
            <button className="btn block ghost" onClick={() => setNewOpen(false)}>取消</button>
          </div>
        </Sheet>
      )}

      {editing && (
        <Sheet title={editing.idx < 0 ? '新增记录' : '编辑记录'} onClose={() => setEditing(null)}>
          <EditForm cols={cols} ro={ro} nu={nu} row={editing.row} onCancel={() => setEditing(null)} onSave={commitEdit} />
        </Sheet>
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

function EditForm({ cols, ro, nu, row, onCancel, onSave }) {
  const [val, setVal] = useState(row)
  const set = (k, v) => setVal(s => ({ ...s, [k]: v }))
  return (
    <div>
      {cols.filter(c => c.key !== 'seq').map(c => (
        <div className="field" key={c.key}>
          <label>{c.name}{ro.has(c.key) ? '（自动）' : ''}</label>
          {c.key === 'remark' || c.key === 'description' ? (
            <textarea value={val[c.key] ?? ''} onChange={e => set(c.key, e.target.value)} />
          ) : (
            <input
              type={nu.has(c.key) ? 'number' : 'text'}
              inputMode={nu.has(c.key) ? 'decimal' : 'text'}
              value={val[c.key] ?? ''}
              readOnly={ro.has(c.key)}
              onChange={e => set(c.key, e.target.value)}
            />
          )}
        </div>
      ))}
      <div className="btn-row">
        <button className="btn block" onClick={() => onSave(val)}>保存</button>
        <button className="btn block ghost" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

/* ============================ 记事本屏 ============================ */
function NotepadScreen() {
  const [files, setFiles] = useState([])
  const [current, setCurrent] = useState('')
  const [text, setText] = useState('')
  const [toast, setToast] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState(todayStr())
  const saveTimer = useRef(null)

  const dir = DATA_DIR['记事本']

  const refresh = useCallback(async () => {
    const list = await store.listFiles(dir)
    const txts = list.filter(f => f.endsWith('.txt')).sort((a, b) => (a < b ? 1 : -1))
    setFiles(txts)
    return txts
  }, [dir])

  useEffect(() => {
    (async () => {
      const txts = await refresh()
      if (txts.length) await open(txts[0])
      else await open(todayStr() + '.txt')
    })()
  }, []) // eslint-disable-line

  const open = async (name) => {
    setCurrent(name)
    try { setText(await store.readText(`${dir}/${name}`)) }
    catch { setText('') }
  }

  const onChange = (v) => {
    setText(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await store.writeText(`${dir}/${current}`, v)
      setToast('已自动保存')
    }, 800)
  }

  const doNew = () => {
    setNewName(todayStr()); setNewOpen(true)
  }
  const commitNew = async () => {
    const fname = (newName.trim() || todayStr()) + '.txt'
    if (files.includes(fname)) { setToast('已存在'); setNewOpen(false); await open(fname); return }
    await store.writeText(`${dir}/${fname}`, '')
    await refresh(); setNewOpen(false); await open(fname)
  }

  const doExport = async () => {
    if (!current) return
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = current
    a.click()
    setToast('已导出')
  }

  return (
    <div className="content">
      <div className="notepad-toolbar">
        <input value={current.replace('.txt', '')} readOnly />
        <button className="btn small ghost" onClick={doNew}>+ 新建</button>
        <button className="btn small ghost" onClick={doExport}>导出</button>
        <button className="btn small ghost" onClick={async () => { const t = await refresh(); if (t.length) await open(t[0]) }}>列表</button>
      </div>
      {files.length > 1 && (
        <div className="card-list" style={{ marginBottom: 10 }}>
          {files.map(f => (
            <div className="card" key={f} onClick={() => open(f)}>
              <div className="title">{f.replace('.txt', '')}</div>
            </div>
          ))}
        </div>
      )}
      <textarea className="notepad-area" value={text} onChange={e => onChange(e.target.value)} placeholder="在这里记录…（自动保存）" />

      {newOpen && (
        <Sheet title="新建记事本" onClose={() => setNewOpen(false)}>
          <div className="field">
            <label>名称（默认今天日期）</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={todayStr()} />
          </div>
          <div className="btn-row">
            <button className="btn block" onClick={commitNew}>创建并打开</button>
            <button className="btn block ghost" onClick={() => setNewOpen(false)}>取消</button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

/* ============================ 汇总屏 ============================ */
function SummaryScreen() {
  const [mode, setMode] = useState('进销存')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState('')
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState('')

  const run = async () => {
    const dir = DATA_DIR[mode]
    const list = await store.listFiles(dir)
    const pat = /^(\d{4})-(\d{2})-\d{2}\.json$/
    const matched = list.filter(f => {
      if (!f.endsWith('.json') || f.endsWith('.bak')) return false
      const m = pat.exec(f)
      if (!m) return false
      const [_, fy, fm] = m
      if (year && fy !== year) return false
      if (month && fm !== month.padStart(2, '0')) return false
      return true
    })
    if (!matched.length) { setResult([]); setToast('无符合条件的数据'); return }
    const allRows = []
    for (const f of matched) {
      try {
        const rows = await store.readJson(`${dir}/${f}`)
        if (Array.isArray(rows)) allRows.push(rows)
      } catch {}
    }
    const agg = mode === '进销存' ? aggregateInventory(allRows) : aggregateAccount(allRows)
    setResult(agg)
  }

  const exportX = () => {
    if (!result || !result.length) { setToast('无数据'); return }
    const cols = mode === '进销存'
      ? ['name', 'spec', 'unit', 'init_qty', 'init_amount', 'out_qty', 'out_amount', 'remain_qty', 'remain_amount']
      : ['category', 'income', 'expense']
    const data = result.map(r => {
      const o = {}
      for (const c of cols) o[c] = fmt(r[c])
      return o
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mode + '汇总')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `汇总_${mode}_${year}${month ? '_' + month : ''}.xlsx`
    a.click()
    setToast('已导出汇总')
  }

  const hasResult = result && result.length
  return (
    <div className="content">
      <div className="field">
        <label>类型</label>
        <select value={mode} onChange={e => setMode(e.target.value)}>
          <option>进销存</option>
          <option>记账</option>
        </select>
      </div>
      <div className="field">
        <label>年份（留空=全部）</label>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="如 2025" />
      </div>
      <div className="field">
        <label>月份 1-12（留空=全年）</label>
        <input value={month} onChange={e => setMonth(e.target.value)} placeholder="如 7" />
      </div>
      <div className="btn-row">
        <button className="btn block" onClick={run}>开始统计</button>
        <button className="btn block ghost" onClick={exportX}>导出Excel</button>
      </div>

      {hasResult && mode === '进销存' && result.map(r => (
        <div className="sum-card" key={r.name}>
          <div className="row"><span>{r.name} {r.spec ? '(' + r.spec + ')' : ''} {r.unit}</span></div>
          <div className="row"><span>原库存</span><span>{fmt(r.init_qty)} / ¥{fmt(r.init_amount)}</span></div>
          <div className="row"><span>出库</span><span>{fmt(r.out_qty)} / ¥{fmt(r.out_amount)}</span></div>
          <div className="row total"><span>现库存</span><span>{fmt(r.remain_qty)} / ¥{fmt(r.remain_amount)}</span></div>
        </div>
      ))}
      {hasResult && mode === '记账' && result.map(r => (
        <div className="sum-card" key={r.category}>
          <div className="row"><span>{r.category}</span></div>
          <div className="row"><span>收入</span><span>¥{fmt(r.income)}</span></div>
          <div className="row total"><span>支出</span><span>¥{fmt(r.expense)}</span></div>
        </div>
      ))}
      {result && result.length === 0 && <div className="empty">无符合条件的数据</div>}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

/* ============================ 设置屏 ============================ */
function SettingsScreen({ settings, setSettings, onResetData }) {
  const [toast, setToast] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const applyTheme = (t) => {
    const ns = { ...settings, theme: t }
    setSettings(ns); store.writeSettings(ns)
  }
  const setInterval = (mins) => {
    const ns = { ...settings, backup_interval_min: Number(mins) || 5 }
    setSettings(ns); store.writeSettings(ns); setToast('备份间隔已设置')
  }
  return (
    <div className="content">
      <div className="field">
        <label>主题</label>
        <div className="btn-row">
          {Object.keys(THEMES).map(t => (
            <button key={t} className={'btn small ' + (settings.theme === t ? '' : 'ghost')}
              onClick={() => applyTheme(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>自动备份间隔（分钟）</label>
        <input type="number" defaultValue={settings.backup_interval_min}
          onChange={e => setInterval(e.target.value)} />
      </div>
      <div className="field">
        <label>关于</label>
        <div className="sum-card">
          <div className="row"><span>进销存管家</span><span>v1.0</span></div>
          <div className="row"><span>说明</span></div>
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>
            进销存 / 记账 / 记事本 移动版。数据保存在本机“文档”目录，不会上传。支持 CSV 导入、Excel 导出、按月汇总、自动备份、崩溃恢复。
          </div>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn block ghost danger" onClick={() => setConfirmReset(true)}>清空当前缓存（谨慎）</button>
      </div>

      {confirmReset && (
        <Sheet title="确认清空" onClose={() => setConfirmReset(false)}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            将删除本机所有进销存 / 记账 / 记事本数据，且不可恢复。确定继续？
          </div>
          <div className="btn-row">
            <button className="btn block danger" onClick={() => { setConfirmReset(false); onResetData() }}>确定清空</button>
            <button className="btn block ghost" onClick={() => setConfirmReset(false)}>取消</button>
          </div>
        </Sheet>
      )}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

/* ============================ 主应用 ============================ */
const TABS = [
  { key: '进销存', ic: '📦', label: '进销存' },
  { key: '记账', ic: '💰', label: '记账' },
  { key: '记事本', ic: '📝', label: '记事本' },
  { key: '汇总', ic: '📊', label: '汇总' },
  { key: '设置', ic: '⚙️', label: '设置' }
]

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [tab, setTab] = useState('进销存')

  useEffect(() => {
    store.ensureDirs()
    store.readSettings(DEFAULT_SETTINGS).then(s => {
      setSettings(s)
      document.body.setAttribute('data-theme', s.theme || '亮色')
    })
  }, [])

  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme || '亮色')
  }, [settings.theme])

  const resetData = async () => {
    for (const d of ['inventory_data', 'account_data', 'notepad_data', 'notes']) {
      const fs = await store.listFiles(d)
      for (const f of fs) await store.remove(`${d}/${f}`)
    }
    await store.clearSession()
    window.location.reload()
  }

  return (
    <div className="app">
      <div className="header">
        <h1>进销存管家</h1>
        <span className="sub">{tab}</span>
      </div>

      {tab === '进销存' && <TableScreen mode="进销存" settings={settings} />}
      {tab === '记账' && <TableScreen mode="记账" settings={settings} />}
      {tab === '记事本' && <NotepadScreen />}
      {tab === '汇总' && <SummaryScreen />}
      {tab === '设置' && <SettingsScreen settings={settings} setSettings={setSettings} onResetData={resetData} />}

      <div className="tabbar">
        {TABS.map(t => (
          <div key={t.key} className={'tab ' + (tab === t.key ? 'active' : '')} onClick={() => setTab(t.key)}>
            <span className="ic">{t.ic}</span>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
