# 进销存管家（iOS 移动版）

把你原来的桌面进销存软件（Python / Tkinter）**1:1 还原**成的 iPhone App，支持 **iOS 14.0 及以上**，可通过 **TrollStore** 直接安装，无需越狱、无需上架 App Store。

整个项目都在 **E 盘**（`E:\InventoryApp`），不占用 C / D 盘。

---

## 一、现在就能在手机上试用（无需 Mac）

App 已构建为可安装的 **PWA（网页应用）**，iPhone 用 Safari 打开预览地址后，点「分享 → 添加到主屏幕」即可像原生 App 一样使用。

- 进销存 / 记账 / 记事本 全部可用
- 数据保存在本机（手机“文件”App 的 App 文档目录 / 浏览器本地存储）
- CSV 导入、Excel 导出、按月汇总、自动备份、主题切换一应俱全

> 预览地址见下方「启动预览」一节。

---

## 二、拿到真正的 .ipa（两种办法，都不需要你买开发者账号）

### 办法 A：用 GitHub Actions 自动出 IPA（推荐，无需 Mac）

1. 在 GitHub 新建一个**公开**仓库。
2. 把 `E:\InventoryApp` 整个目录推上去（`.gitignore` 已配好，不会传 node_modules / Pods）。
3. 进入仓库 **Actions → “构建 iOS IPA（TrollStore）” → Run workflow**。
4. 跑完后到 **Artifacts** 下载 `进销存管家-IPA`，里面是 `进销存管家.ipa`。

> GitHub 公共仓库的 macOS 构建分钟免费。CI 产出的是**无签名 IPA**，TrollStore 安装时会自动重新签名，所以完全不需要 Apple 证书。

### 办法 B：在 Mac 上自己构建

```bash
cd E:/InventoryApp
./build-ipa.sh          # 无签名构建，适合 TrollStore
# 或：SIGN_IDENTITY="iPhone Developer: 你的名字" ./build-ipa.sh
```

产物在 `E:\InventoryApp\build\进销存管家.ipa`。

---

## 三、用 TrollStore 安装到 iPhone

1. 手机已安装 **TrollStore**（iOS 14.0–17.0 支持，越狱或非越狱均可）。
2. 把 `进销存管家.ipa` 传到 iPhone（AirDrop / 文件 App / 网盘）。
3. 用 **TrollStore** 打开该 IPA → **Install**。安装后即为永久应用，不受 7 天限制。

---

## 四、与原 Python 软件的对应关系

| 原软件功能 | 移动版位置 |
|---|---|
| 进销存表格（按日期存档） | 「进销存」Tab，档案按日期命名 |
| 记账表格（余额自动累计） | 「记账」Tab |
| 记事本（自动保存） | 「记事本」Tab |
| CSV 导入 | 表格页「导入CSV」 |
| Excel 导出 | 表格页「导出Excel」 |
| 汇总统计（按年/月聚合） | 「汇总」Tab |
| 主题 / 备份间隔 | 「设置」Tab |
| 自动备份 / 崩溃恢复 | 每次保存先写 `.bak`，启动恢复上次档案 |

计算逻辑与原软件完全一致（原库存金额、出库金额、现库存数量/金额、记账余额等公式 1:1 移植）。

---

## 五、数据与存储

- 数据保存在本机，**不会上传任何服务器**。
- 文件按原软件的目录结构存放：`inventory_data/`、`account_data/`、`notepad_data/`、`notes/`、`settings.json`。
- 即使新建很多档案/项目，数据以 JSON 文本为主，占用极小；**单个 App 文档目录通常在几 MB ~ 几十 MB**，远低于 700MB。
- 原始 Python 源码与数据已完整备份在 `E:\InventoryApp\original`，**不会丢失**。

---

## 六、项目结构

```
E:\InventoryApp
├─ src/                 # React 前端（App.jsx 为主）
├─ ios/                 # 生成的 Xcode 工程（用 Xcode / CI 编译出 IPA）
├─ public/              # PWA 图标与 manifest
├─ scripts/gen-icons.mjs# 由 systemtest.png 生成全套图标
├─ build-ipa.sh         # Mac 本地构建脚本
├─ .github/workflows/   # GitHub Actions 自动出 IPA
├─ 进销存管理.apk       # （备用）已生成的安卓版，可装安卓机试用
└─ original/            # 原始 Python 软件备份
```

---

## 七、技术栈

- React 18 + Vite 5
- Capacitor 5（iOS 14+）
- @capacitor/filesystem（本机文件存储）、@capacitor/preferences、xlsx（Excel 导入导出）
