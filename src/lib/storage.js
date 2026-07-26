import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const D = Directory.Documents
export const isNative = Capacitor.isNativePlatform()

const ROOT_DIRS = ['inventory_data', 'account_data', 'notepad_data', 'notes', 'exports']

export async function ensureDirs() {
  for (const d of ROOT_DIRS) {
    try {
      await Filesystem.mkdir({ path: d, directory: D, recursive: true })
    } catch (e) {
      /* 已存在 or 忽略 */
    }
  }
}

export async function exists(path) {
  try {
    await Filesystem.stat({ path, directory: D })
    return true
  } catch (e) {
    return false
  }
}

export async function listFiles(dir) {
  try {
    const r = await Filesystem.readdir({ path: dir, directory: D })
    return r.files.map((f) => f.name)
  } catch (e) {
    return []
  }
}

export async function readText(path) {
  const r = await Filesystem.readFile({ path, directory: D })
  return r.data
}

export async function writeText(path, text) {
  await Filesystem.writeFile({ path, data: text, directory: D, recursive: true })
}

export async function readJson(path) {
  const t = await readText(path)
  return JSON.parse(t)
}

export async function writeJson(path, obj) {
  await writeText(path, JSON.stringify(obj, null, 2))
}

export async function backup(path) {
  try {
    await Filesystem.copy({ from: path, to: path + '.bak', directory: D })
  } catch (e) {
    /* ignore */
  }
}

export async function remove(path) {
  try {
    await Filesystem.deleteFile({ path, directory: D })
  } catch (e) {
    /* ignore */
  }
}

export async function readSettings(defaults) {
  try {
    const t = await readText('settings.json')
    return { ...defaults, ...JSON.parse(t) }
  } catch (e) {
    return { ...defaults }
  }
}

export async function writeSettings(s) {
  await writeText('settings.json', JSON.stringify(s, null, 2))
}

export async function readSession() {
  try {
    const t = await readText('session.json')
    return JSON.parse(t)
  } catch (e) {
    return null
  }
}

export async function writeSession(lastFile) {
  if (!lastFile) return
  await writeText('session.json', JSON.stringify({ last_file: lastFile }))
}

export async function clearSession() {
  await remove('session.json')
}
