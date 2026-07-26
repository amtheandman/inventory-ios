/* =========================================================================
   进销存管理 (移动版)  —  逻辑层
   忠实还原桌面版 InventoryManagementsystem.py v5.3 的计算与存储逻辑，
   并为手机触摸操作重新设计交互。
   ========================================================================= */
(function () {
  "use strict";

  // ----------------------------- 配置 -----------------------------
  const SETTINGS_FILE = "settings.json";
  const SESSION_FILE = "session.json";

  const COLUMNS = {
    "进销存": [
      ["seq", "序号", 46], ["name", "品名", 110], ["spec", "规格", 80], ["unit", "单位", 56],
      ["init_qty", "原库存数量", 92], ["init_price", "原库存单价", 88], ["init_amount", "原库存金额", 92],
      ["out_qty", "出库数量", 84], ["out_price", "出库单价", 84], ["out_amount", "出库金额", 92],
      ["remain_qty", "现库存数量", 92], ["remain_price", "现库存单价", 88], ["remain_amount", "现库存金额", 92],
      ["remark", "备注", 100]
    ],
    "记账": [
      ["date", "日期", 96], ["description", "摘要", 160], ["income", "收入", 92],
      ["expense", "支出", 92], ["balance", "余额", 96], ["category", "分类", 96], ["remark", "备注", 100]
    ]
  };

  const NUMERIC = {
    "进销存": new Set(["init_qty", "init_price", "out_qty", "out_price", "remain_price"]),
    "记账": new Set(["income", "expense", "balance"])
  };
  const READONLY = {
    "进销存": new Set(["seq", "init_amount", "out_amount", "remain_qty", "remain_amount"]),
    "记账": new Set(["balance"])
  };
  const AMOUNT_COLS = { "进销存": new Set(["init_amount", "out_amount", "remain_amount"]) };

  function dataDirOf(mode) {
    if (mode === "进销存") return "inventory_data";
    if (mode === "记账") return "account_data";
    return "notepad_data";
  }
  function extOf(mode) { return mode === "记事本" ? ".txt" : ".json"; }

  // ----------------------------- 存储层（桥接到原生文件 IO） -----------------------------
  const Storage = (function () {
    const LS = "invfs::";
    function bridge() { return (typeof window.AndroidBridge !== "undefined" && window.AndroidBridge) ? window.AndroidBridge : null; }
    function toBool(v) { return v === true || v === "true"; }
    return {
      readFile(path) {
        const b = bridge();
        if (b) { const r = b.readFile(path); return (r === undefined || r === null) ? null : String(r); }
        const v = localStorage.getItem(LS + path); return v === null ? null : v;
      },
      writeFile(path, content) {
        const b = bridge();
        if (b) return toBool(b.writeFile(path, content));
        try { localStorage.setItem(LS + path, content); return true; } catch (e) { return false; }
      },
      deleteFile(path) {
        const b = bridge();
        if (b) return toBool(b.deleteFile(path));
        localStorage.removeItem(LS + path); return true;
      },
      exists(path) {
        const b = bridge();
        if (b) return toBool(b.exists(path));
        return localStorage.getItem(LS + path) !== null;
      },
      listFiles(dir) {
        const b = bridge();
        if (b) { try { return JSON.parse(b.listFiles(dir) || "[]") || []; } catch (e) { return []; } }
        const out = [], p = LS + dir + "/";
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(p) === 0) out.push(k.substring(p.length));
        }
        return out;
      }
    };
  })();

  // ----------------------------- 状态 -----------------------------
  const state = {
    mode: "进销存",
    settings: null,
    currentFile: null,     // 相对路径
    backupFile: null,
    rows: [],              // 表格数据
    noteText: "",
    selecting: false,
    selected: new Set(),
    editIdx: -1,
    sumData: null
  };

  // ----------------------------- 工具 -----------------------------
  function $(id) { return document.getElementById(id); }
  function round2(x) { return Math.round((parseFloat(x) || 0) * 100) / 100; }
  function todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function fmtNum(val) {
    if (val === "" || val === null || val === undefined) return "";
    const n = parseFloat(val);
    if (isNaN(n)) return String(val);
    if (n === Math.floor(n)) return String(Math.floor(n));
    let s = n.toFixed(2);
    s = s.replace(/\.?0+$/, "");
    return s;
  }

  function toast(msg) {
    const b = (typeof window.AndroidBridge !== "undefined") ? window.AndroidBridge : null;
    if (b && b.toast) { b.toast(msg); return; }
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 1600);
  }

  function confirmDialog(title, msg) {
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "sheet-mask";
      mask.innerHTML =
        '<div class="sheet"><div class="sheet-head"><span>' + title + '</span></div>' +
        '<div class="sheet-form"><div style="padding:6px 2px;color:var(--text)">' + msg + '</div></div>' +
        '<div class="sheet-foot row"><button class="tbtn" data-r="0">取消</button><button class="tbtn danger" data-r="1">确定</button></div></div>';
      document.body.appendChild(mask);
      function cleanup(v) { if (mask.parentNode) mask.parentNode.removeChild(mask); resolve(v); }
      mask.addEventListener("click", (e) => {
        if (e.target === mask) return cleanup(false);
        const btn = e.target.closest("[data-r]");
        if (btn) cleanup(btn.getAttribute("data-r") === "1");
      });
    });
  }

  function inputDialog(title, defVal) {
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "sheet-mask";
      mask.innerHTML =
        '<div class="sheet"><div class="sheet-head"><span>' + title + '</span></div>' +
        '<div class="sheet-form"><label class="field"><span></span><input id="__inp" type="text" value="' + String(defVal || "").replace(/"/g, "&quot;") + '"></label></div>' +
        '<div class="sheet-foot row"><button class="tbtn" data-r="0">取消</button><button class="tbtn primary" data-r="1">确定</button></div></div>';
      document.body.appendChild(mask);
      const inp = mask.querySelector("#__inp");
      setTimeout(() => inp.focus(), 50);
      function cleanup(v) { if (mask.parentNode) mask.parentNode.removeChild(mask); resolve(v); }
      mask.addEventListener("click", (e) => {
        if (e.target === mask) return cleanup(null);
        const b = e.target.closest("[data-r]");
        if (b) cleanup(b.getAttribute("data-r") === "1" ? inp.value.trim() : null);
      });
    });
  }

  // ----------------------------- 设置 / 会话 -----------------------------
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(Storage.readFile(SETTINGS_FILE) || "{}") || {}; } catch (e) {}
    const def = { theme: "亮色", backup_interval_min: 5, font_size: 10, mode: "进销存", last_files: {}, normal_exit: true };
    state.settings = Object.assign(def, s);
    if (!state.settings.last_files) state.settings.last_files = {};
    return state.settings;
  }
  function saveSettings() { Storage.writeFile(SETTINGS_FILE, JSON.stringify(state.settings, null, 2)); }
  function saveSession() {
    if (state.currentFile) Storage.writeFile(SESSION_FILE, JSON.stringify({ last_file: state.currentFile }));
  }

  function applyTheme() {
    const t = state.settings.theme === "暗色" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    $("themeToggle").textContent = t === "dark" ? "☀️" : "🌙";
  }

  // ----------------------------- 文件操作 -----------------------------
  function filePath(name) { return dataDirOf(state.mode) + "/" + name + extOf(state.mode); }
  function notePath(name) { return "notes/" + state.mode + "_" + name + ".txt"; }

  function openFile(name) {
    const fp = filePath(name);
    if (state.mode === "记事本") {
      const content = Storage.readFile(fp) || "";
      state.noteText = content; state.currentFile = fp; state.backupFile = fp + ".bak";
      $("noteText").value = content;
      updateLineNumbers(); updateNoteStatus();
      setNoteArchiveName(name);
      saveSession();
      return;
    }
    let rows = [];
    try { rows = JSON.parse(Storage.readFile(fp) || "[]") || []; } catch (e) { rows = []; }
    state.rows = rows; state.currentFile = fp; state.backupFile = fp + ".bak";
    renderTable(); setArchiveName(name); saveSession();
  }

  function newFile(name) {
    name = (name || todayStr()).trim() || todayStr();
    const fp = filePath(name);
    state.currentFile = fp; state.backupFile = fp + ".bak";
    if (state.mode === "记事本") {
      state.noteText = ""; Storage.writeFile(fp, "");
      $("noteText").value = ""; updateLineNumbers(); updateNoteStatus(); setNoteArchiveName(name);
    } else {
      state.rows = []; Storage.writeFile(fp, "[]"); renderTable(); setArchiveName(name);
    }
    saveSession();
    toast("已创建: " + name + extOf(state.mode));
  }

  function saveCurrentFile() {
    if (!state.currentFile) return;
    if (state.mode === "记事本") {
      const content = $("noteText").value;
      Storage.writeFile(state.currentFile, content.replace(/\n+$/, ""));
      return;
    }
    for (let i = 0; i < state.rows.length; i++) state.rows[i].seq = i + 1;
    Storage.writeFile(state.currentFile, JSON.stringify(state.rows, null, 2));
  }

  function backupCurrentFile() {
    if (!state.currentFile || !state.backupFile) return;
    const content = Storage.readFile(state.currentFile);
    if (content == null) return;
    Storage.writeFile(state.backupFile, content);
  }

  function listArchives(filter) {
    const ext = extOf(state.mode);
    let files = Storage.listFiles(dataDirOf(state.mode))
      .filter(f => f.endsWith(ext) && !f.endsWith(".bak"))
      .map(f => f.slice(0, -ext.length));
    files.sort((a, b) => (a < b ? 1 : -1));
    if (filter) files = files.filter(f => f.toLowerCase().indexOf(filter.toLowerCase()) >= 0);
    return files;
  }

  async function deleteArchives(names) {
    if (!await confirmDialog("删除确认", "将删除选中的 " + names.length + " 个档案，且无法恢复。确定？")) return;
    for (const name of names) {
      const fp = filePath(name);
      Storage.deleteFile(fp); Storage.deleteFile(fp + ".bak");
      Storage.deleteFile(notePath(name));
      if (state.currentFile === fp) { state.currentFile = null; if (state.mode === "记事本") { $("noteText").value = ""; updateLineNumbers(); } else { state.rows = []; renderTable(); } }
    }
    refreshArchiveList();
    if (!state.currentFile) openFile(todayStr());
    toast("已删除 " + names.length + " 个");
  }

  async function renameArchive(oldName) {
    const nv = $("renameInput").value.trim();
    if (!nv || nv === oldName) return closeSheet("sheetRename");
    const oldPath = filePath(oldName), newPath = filePath(nv);
    if (Storage.exists(newPath)) { toast("目标已存在"); return; }
    if (Storage.exists(oldPath)) { Storage.writeFile(newPath, Storage.readFile(oldPath)); Storage.deleteFile(oldPath); }
    if (Storage.exists(oldPath + ".bak")) { Storage.writeFile(newPath + ".bak", Storage.readFile(oldPath + ".bak")); Storage.deleteFile(oldPath + ".bak"); }
    const on = notePath(oldName), nn = notePath(nv);
    if (Storage.exists(on)) { Storage.writeFile(nn, Storage.readFile(on)); Storage.deleteFile(on); }
    if (state.currentFile === oldPath) { state.currentFile = newPath; state.backupFile = newPath + ".bak"; setArchiveName(nv); if (state.mode === "记事本") setNoteArchiveName(nv); }
    refreshArchiveList(); saveSession(); closeSheet("sheetRename"); toast("已重命名");
  }

  // ----------------------------- 计算 -----------------------------
  function computeRow(row) {
    if (state.mode === "进销存") {
      const iq = parseFloat(row.init_qty) || 0, ip = parseFloat(row.init_price) || 0;
      const oq = parseFloat(row.out_qty) || 0, op = parseFloat(row.out_price) || 0;
      row.init_amount = round2(iq * ip);
      row.out_amount = round2(oq * op);
      row.remain_qty = round2(iq - oq);
      let rp;
      if (row.remain_price !== "" && row.remain_price != null) rp = parseFloat(row.remain_price) || 0;
      else rp = ip;
      row.remain_price = rp;
      row.remain_amount = round2(round2(iq - oq) * rp);
    }
  }

  function recomputeBalance() {
    let prev = 0;
    for (const row of state.rows) {
      const inc = parseFloat(row.income) || 0, exp = parseFloat(row.expense) || 0;
      prev = prev + inc - exp;
      row.balance = round2(prev);
    }
  }

  // ----------------------------- 渲染：表格 -----------------------------
  function renderTable() {
    if (state.mode === "记账") recomputeBalance();
    const cols = COLUMNS[state.mode];
    const head = $("headRow"); head.innerHTML = "";
    cols.forEach((c, i) => {
      const th = document.createElement("th");
      th.textContent = c[1]; th.style.minWidth = c[2] + "px";
      if (i === 0) th.className = "col-seq";
      head.appendChild(th);
    });
    if (state.selecting) { const th = document.createElement("th"); th.textContent = ""; head.appendChild(th); }

    const body = $("bodyRows"); body.innerHTML = "";
    $("emptyHint").style.display = state.rows.length ? "none" : "block";

    state.rows.forEach((row, idx) => {
      computeRow(row);
      const tr = document.createElement("tr");
      cols.forEach((c, i) => {
        const td = document.createElement("td");
        const v = row[c[0]];
        td.textContent = NUMERIC[state.mode].has(c[0]) ? fmtNum(v) : (v == null ? "" : String(v));
        if (i === 0) td.className = "col-seq";
        if (NUMERIC[state.mode].has(c[0])) td.classList.add("num");
        if (READONLY[state.mode].has(c[0])) td.classList.add("readonly");
        if (AMOUNT_COLS[state.mode] && AMOUNT_COLS[state.mode].has(c[0])) td.classList.add("ro-amount");
        tr.appendChild(td);
      });
      if (state.selecting) {
        const td = document.createElement("td");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.className = "row-check";
        if (state.selected.has(idx)) cb.checked = true;
        cb.addEventListener("change", () => { if (cb.checked) state.selected.add(idx); else state.selected.delete(idx); updateSelCount(); });
        cb.addEventListener("click", (e) => e.stopPropagation());
        td.appendChild(cb); tr.appendChild(td);
      }
      tr.addEventListener("click", () => { if (state.selecting) { const cb = tr.querySelector(".row-check"); cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); } else openEdit(idx); });
      body.appendChild(tr);
    });
  }

  function setArchiveName(name) { $("archiveName").textContent = name; }
  function setNoteArchiveName(name) { $("noteArchiveName").textContent = name; }

  // ----------------------------- 行编辑弹层 -----------------------------
  function openEdit(idx) {
    state.editIdx = idx;
    const row = state.rows[idx] || blankRow();
    const cols = COLUMNS[state.mode];
    const box = $("editFields"); box.innerHTML = "";
    $("sheetEditTitle").textContent = idx < 0 ? "添加行" : "编辑行";

    cols.forEach(c => {
      const key = c[0];
      const wrap = document.createElement("div"); wrap.className = "edit-field";
      const label = document.createElement("label"); label.textContent = c[1]; wrap.appendChild(label);
      const inp = document.createElement("input");
      if (READONLY[state.mode].has(key)) {
        inp.value = NUMERIC[state.mode].has(key) ? fmtNum(row[key]) : (row[key] == null ? "" : row[key]);
        inp.readOnly = true; inp.classList.add("computed");
      } else {
        inp.value = (row[key] == null ? "" : row[key]);
        if (NUMERIC[state.mode].has(key)) { inp.type = "number"; inp.inputMode = "decimal"; inp.step = "any"; }
        inp.dataset.key = key;
      }
      wrap.appendChild(inp); box.appendChild(wrap);
    });

    $("editDeleteBtn").style.display = idx < 0 ? "none" : "";
    showSheet("sheetEdit");
  }

  function blankRow() {
    const row = {};
    COLUMNS[state.mode].forEach(c => row[c[0]] = "");
    if (state.mode === "进销存") { row.init_price = "0"; row.out_price = "0"; row.remain_price = "0"; }
    else row.date = todayStr();
    return row;
  }

  function saveEdit() {
    const fields = $("editFields").querySelectorAll("input[data-key]");
    const row = state.editIdx >= 0 ? state.rows[state.editIdx] : blankRow();
    for (const inp of fields) {
      const key = inp.dataset.key;
      if (NUMERIC[state.mode].has(key) && inp.value.trim() !== "" && isNaN(parseFloat(inp.value))) {
        toast("「" + inp.previousElementSibling.textContent + "」必须为数字"); return;
      }
      row[key] = inp.value;
    }
    if (state.editIdx >= 0) { state.rows[state.editIdx] = row; }
    else { state.rows.push(row); }
    computeRow(row);
    if (state.mode === "记账") recomputeBalance();
    renderTable(); saveCurrentFile(); backupCurrentFile();
    closeSheet("sheetEdit"); toast("已保存");
  }

  function deleteEditRow() {
    if (state.editIdx < 0) return;
    state.rows.splice(state.editIdx, 1);
    if (state.mode === "记账") recomputeBalance();
    renderTable(); saveCurrentFile(); backupCurrentFile();
    closeSheet("sheetEdit"); toast("已删除该行");
  }

  // ----------------------------- 选择模式 -----------------------------
  function toggleSelect() {
    state.selecting = !state.selecting;
    if (!state.selecting) state.selected.clear();
    $("selBar").classList.toggle("hidden", !state.selecting);
    $("selectBtn").classList.toggle("primary", state.selecting);
    renderTable(); updateSelCount();
  }
  function updateSelCount() { $("selCount").textContent = "已选 " + state.selected.size + " 项"; }
  async function deleteSelected() {
    if (state.selected.size === 0) return;
    if (!await confirmDialog("删除确认", "确定删除选中的 " + state.selected.size + " 行吗？")) return;
    const idxs = Array.from(state.selected).sort((a, b) => b - a);
    for (const i of idxs) state.rows.splice(i, 1);
    state.selected.clear();
    if (state.mode === "记账") recomputeBalance();
    state.selecting = false; $("selBar").classList.add("hidden"); $("selectBtn").classList.remove("primary");
    renderTable(); saveCurrentFile(); backupCurrentFile(); toast("已删除");
  }

  // ----------------------------- 档案弹层 -----------------------------
  function refreshArchiveList() {
    const filter = $("archiveSearch").value.trim();
    const list = $("archiveList"); list.innerHTML = "";
    const names = listArchives(filter);
    if (names.length === 0) { list.innerHTML = '<div class="empty-hint" style="position:static">没有档案</div>'; return; }
    names.forEach(name => {
      const item = document.createElement("div"); item.className = "arch-item";
      const nm = document.createElement("div"); nm.className = "name"; nm.textContent = name; nm.addEventListener("click", () => { openFile(name); closeSheet("sheetArchive"); });
      const acts = document.createElement("div"); acts.className = "acts";
      const bNote = mkMini("说明", () => openNote(name));
      const bRen = mkMini("重命名", () => { $("renameInput").value = name; state._renameTarget = name; showSheet("sheetRename"); });
      const bDel = mkMini("删除", () => deleteArchives([name]));
      acts.appendChild(bNote); acts.appendChild(bRen); acts.appendChild(bDel);
      item.appendChild(nm); item.appendChild(acts); list.appendChild(item);
    });
  }
  function mkMini(label, fn) { const b = document.createElement("button"); b.className = "mini"; b.textContent = label; b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); return b; }

  function openNote(name) {
    state._noteTarget = name;
    const content = Storage.readFile(notePath(name)) || "";
    $("noteContent").value = content;
    $("noteSheetTitle").textContent = "说明 - " + name;
    showSheet("sheetNote");
  }
  function saveNote() {
    const name = state._noteTarget; if (!name) return;
    Storage.writeFile(notePath(name), $("noteContent").value);
    closeSheet("sheetNote"); toast("说明已保存");
  }

  // ----------------------------- 导入 / 导出 -----------------------------
  function importCSV() {
    if (state.mode === "记事本") { toast("记事本不支持导入"); return; }
    const b = (typeof window.AndroidBridge !== "undefined") ? window.AndroidBridge : null;
    if (b && b.pickFile) { b.pickFile(); return; } // 原生层会回调 window.__onPickFile(json)
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".csv,text/csv";
    inp.addEventListener("change", () => {
      const f = inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => doImport(reader.result);
      reader.readAsText(f, "utf-8");
    });
    inp.click();
  }

  function doImport(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length < 2) { toast("没有可导入的数据"); return; }
    const cols = COLUMNS[state.mode];
    const head = lines[0].split(",").map(s => s.trim().toLowerCase());
    const map = {};
    cols.forEach(c => { map[c[1].toLowerCase()] = c[0]; map[c[0].toLowerCase()] = c[0]; });
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",");
      const row = {};
      head.forEach((h, j) => { const key = map[h]; if (key && cells[j] != null) row[key] = cells[j].trim(); });
      if (Object.keys(row).length) { state.rows.push(row); imported++; }
    }
    if (!imported) { toast("CSV 列未匹配"); return; }
    renderTable(); saveCurrentFile(); backupCurrentFile(); toast("成功导入 " + imported + " 行");
  }

  // 原生层选完文件后回调
  window.__onPickFile = function (jsonStr) {
    try { const obj = JSON.parse(jsonStr); doImport(obj.content || ""); }
    catch (e) { toast("读取失败"); }
  };

  function exportCSV() {
    if (state.mode === "记事本") { toast("记事本不支持导出"); return; }
    if (!state.rows.length) { toast("没有数据可导出"); return; }
    const cols = COLUMNS[state.mode];
    const head = cols.map(c => c[1]).join(",");
    const lines = [head];
    state.rows.forEach(row => { lines.push(cols.map(c => csvCell(row[c[0]])).join(",")); });
    const csv = "﻿" + lines.join("\n");
    const name = (state.currentFile ? state.currentFile.split("/").pop().replace(/\.json$/, "") : "导出") + ".csv";
    const b = (typeof window.AndroidBridge !== "undefined") ? window.AndroidBridge : null;
    if (b && b.shareFile) {
      const path = dataDirOf(state.mode) + "/" + name;
      Storage.writeFile(path, csv);
      b.shareFile(path);
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
  function csvCell(v) { v = (v == null ? "" : String(v)); if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"'; return v; }

  // ----------------------------- 汇总 -----------------------------
  function runSummary() {
    const y = $("sumYear").value.trim(), m = $("sumMonth").value.trim();
    const ext = ".json";
    let files = Storage.listFiles(dataDirOf(state.mode)).filter(f => f.endsWith(ext) && !f.endsWith(".bak"));
    if (y || m) {
      const re = /^(\d{4})-(\d{2})-\d{2}\.json$/;
      files = files.filter(f => { const mt = re.exec(f); if (!mt) return false; if (y && mt[1] !== y) return false; if (m && mt[2] !== String(m).padStart(2, "0")) return false; return true; });
    }
    if (!files.length) { toast("没有符合条件的数据"); return; }
    const agg = {};
    files.forEach(f => {
      let rows = []; try { rows = JSON.parse(Storage.readFile(dataDirOf(state.mode) + "/" + f) || "[]") || []; } catch (e) {}
      rows.forEach(row => {
        if (state.mode === "进销存") {
          const key = row.name || ""; if (!key) return;
          if (!agg[key]) agg[key] = { name: key, spec: row.spec || "", unit: row.unit || "", init_qty: 0, init_amount: 0, out_qty: 0, out_amount: 0, remain_qty: 0, remain_amount: 0 };
          ["init_qty", "init_amount", "out_qty", "out_amount", "remain_qty", "remain_amount"].forEach(c => agg[key][c] += parseFloat(row[c]) || 0);
        } else {
          const cat = row.category || "未分类";
          if (!agg[cat]) agg[cat] = { category: cat, income: 0, expense: 0 };
          agg[cat].income += parseFloat(row.income) || 0;
          agg[cat].expense += parseFloat(row.expense) || 0;
        }
      });
    });
    const data = Object.values(agg);
    let cols;
    if (state.mode === "进销存") cols = [["name", "品名"], ["spec", "规格"], ["unit", "单位"], ["init_qty", "原库存"], ["init_amount", "原库存金额"], ["out_qty", "出库"], ["out_amount", "出库金额"], ["remain_qty", "现库存"], ["remain_amount", "现库存金额"]];
    else cols = [["category", "分类"], ["income", "收入"], ["expense", "支出"]];
    const thead = $("sumTable").querySelector("thead"); const tbody = $("sumTable").querySelector("tbody");
    thead.innerHTML = "<tr>" + cols.map(c => "<th>" + c[1] + "</th>").join("") + "</tr>";
    tbody.innerHTML = data.map(r => "<tr>" + cols.map(c => "<td>" + (NUMERIC[state.mode].has(c[0]) ? fmtNum(r[c[0]]) : (r[c[0]] == null ? "" : r[c[0]])) + "</td>").join("") + "</tr>").join("");
    state.sumData = { cols, data };
    $("sumResult").classList.remove("hidden");
  }
  function exportSummary() {
    if (!state.sumData) return;
    const { cols, data } = state.sumData;
    const lines = [cols.map(c => c[1]).join(",")];
    data.forEach(r => lines.push(cols.map(c => csvCell(r[c[0]])).join(",")));
    const csv = "﻿" + lines.join("\n");
    const b = (typeof window.AndroidBridge !== "undefined") ? window.AndroidBridge : null;
    const name = "汇总_" + state.mode + "_" + todayStr() + ".csv";
    if (b && b.shareFile) { const path = dataDirOf(state.mode) + "/" + name; Storage.writeFile(path, csv); b.shareFile(path); return; }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }

  // ----------------------------- 记事本 -----------------------------
  function updateLineNumbers() {
    const ta = $("noteText"); const lines = ta.value.split("\n").length;
    let s = ""; for (let i = 1; i <= lines; i++) s += i + "\n";
    const ln = $("lineNumbers"); ln.textContent = s; ln.scrollTop = ta.scrollTop;
  }
  function updateNoteStatus() { const n = $("noteText").value.split("\n").length; $("noteStatus").textContent = n + " 行"; }
  function onNoteInput() { updateLineNumbers(); updateNoteStatus(); debounceSave(); }

  function noteFindNext() {
    const ta = $("noteText"); const target = $("nfFind").value; if (!target) return;
    const from = ta.selectionStart || 0;
    let idx = ta.value.indexOf(target, from);
    if (idx < 0) idx = ta.value.indexOf(target, 0);
    if (idx < 0) { toast("未找到"); return; }
    ta.setSelectionRange(idx, idx + target.length); ta.focus();
  }
  function noteReplace() {
    const ta = $("noteText"); const target = $("nfFind").value, rep = $("nfReplace").value; if (!target) return;
    if (ta.selectionStart !== ta.selectionEnd && ta.value.substring(ta.selectionStart, ta.selectionEnd) === target) {
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + rep + ta.value.slice(ta.selectionEnd);
      ta.setSelectionRange(s + rep.length, s + rep.length);
    }
    noteFindNext();
  }

  // ----------------------------- 自动保存 / 备份 -----------------------------
  let saveTimer = null;
  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (state.mode === "记事本") saveCurrentFile(); }, 500);
  }
  let backupTimer = null;
  function scheduleBackup() {
    clearTimeout(backupTimer);
    const ms = (state.settings.backup_interval_min || 5) * 60 * 1000;
    backupTimer = setTimeout(() => { backupCurrentFile(); scheduleBackup(); }, ms);
  }

  // ----------------------------- 模式切换 -----------------------------
  function switchMode(mode) {
    if (state.mode === "记事本" && state.currentFile) saveCurrentFile();
    state.mode = mode;
    state.settings.mode = mode; saveSettings();
    document.querySelectorAll(".bottomnav button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    const isNote = mode === "记事本";
    $("tableScreen").classList.toggle("hidden", isNote);
    $("noteScreen").classList.toggle("hidden", !isNote);
    $("fab").textContent = isNote ? "📄" : "＋";
    state.selecting = false; state.selected.clear(); $("selBar").classList.add("hidden");
    const last = state.settings.last_files[mode];
    if (last && Storage.exists(last)) { openFile(last.split("/").pop().replace(extOf(mode), "")); }
    else { openFile(todayStr()); }
  }

  // ----------------------------- 弹层工具 -----------------------------
  function showSheet(id) { $(id).classList.remove("hidden"); }
  function closeSheet(id) { $(id).classList.add("hidden"); }

  // ----------------------------- 事件绑定 -----------------------------
  function bindEvents() {
    document.querySelectorAll(".bottomnav button").forEach(b => b.addEventListener("click", () => switchMode(b.dataset.mode)));
    $("themeToggle").addEventListener("click", () => { state.settings.theme = state.settings.theme === "暗色" ? "亮色" : "暗色"; saveSettings(); applyTheme(); });
    $("archiveBtn").addEventListener("click", () => { refreshArchiveList(); showSheet("sheetArchive"); });
    $("noteArchiveBtn").addEventListener("click", () => { refreshArchiveList(); showSheet("sheetArchive"); });
    $("archiveSearch").addEventListener("input", refreshArchiveList);
    $("archiveNewBtn").addEventListener("click", async () => { closeSheet("sheetArchive"); const n = await inputDialog("新建档案名称（默认今天）", todayStr()); if (n !== null) newFile(n || todayStr()); });
    $("addRowBtn").addEventListener("click", () => openEdit(-1));
    $("selectBtn").addEventListener("click", toggleSelect);
    $("selDeleteBtn").addEventListener("click", deleteSelected);
    $("selCancelBtn").addEventListener("click", toggleSelect);
    $("importBtn").addEventListener("click", importCSV);
    $("exportBtn").addEventListener("click", exportCSV);
    $("summaryBtn").addEventListener("click", () => { $("sumResult").classList.add("hidden"); showSheet("sheetSummary"); });
    $("findBtn").addEventListener("click", doFind);
    $("findInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doFind(); });
    $("editSaveBtn").addEventListener("click", saveEdit);
    $("editDeleteBtn").addEventListener("click", deleteEditRow);
    $("sumRunBtn").addEventListener("click", runSummary);
    $("sumExportBtn").addEventListener("click", exportSummary);
    $("noteFindBtn").addEventListener("click", () => showSheet("sheetNoteFind"));
    $("nfFindBtn").addEventListener("click", noteFindNext);
    $("nfReplaceBtn").addEventListener("click", noteReplace);
    $("noteSaveBtn").addEventListener("click", saveNote);
    $("renameOkBtn").addEventListener("click", () => renameArchive(state._renameTarget));
    $("noteText").addEventListener("input", onNoteInput);
    $("noteText").addEventListener("scroll", () => { $("lineNumbers").scrollTop = $("noteText").scrollTop; });
    $("fab").addEventListener("click", async () => {
      if (state.mode === "记事本") { const n = await inputDialog("新建记事本（默认今天）", todayStr()); if (n !== null) newFile(n || todayStr()); }
      else openEdit(-1);
    });
    document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeSheet(b.dataset.close)));
    document.querySelectorAll(".sheet-mask").forEach(m => m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));
  }

  function doFind() {
    const kw = $("findInput").value.trim().toLowerCase(); if (!kw) return;
    if (state.mode === "记事本") { $("nfFind").value = kw; showSheet("sheetNoteFind"); return; }
    const body = $("bodyRows"); const rows = body.children;
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].children;
      for (let j = 1; j < cells.length; j++) {
        if (cells[j].textContent.toLowerCase().indexOf(kw) >= 0) {
          rows[i].scrollIntoView({ block: "center" });
          toast("已定位：" + cells[j].textContent);
          return;
        }
      }
    }
    toast("未找到「" + kw + "」");
  }

  // ----------------------------- 初始化 -----------------------------
  function init() {
    loadSettings();
    applyTheme();
    bindEvents();
    switchMode(state.settings.mode || "进销存");
    scheduleBackup();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
