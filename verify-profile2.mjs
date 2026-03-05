/**
 * RCAS Profile 2 交互式验证脚本
 * 使用方法： node verify-profile2.mjs
 * 前置条件：
 *   1. 后端已启动
 *   2. quick-mos 已连接后端
 *   3. rcas-test.json 已放入 quick-mos/input/runningorders/
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── 配置（根据实际路径修改 RUNDOWN_FILE）────────────────────────────────────
const BACKEND_HTTP = 'http://127.0.0.1:3000'
const RUNDOWN_FILE = path.join(__dirname, '.gcloudignore/reference/sofie-mos-connection/packages/quick-mos/input/runningorders/rcas-test.json')
const WAIT_MS      = 5000
const RO_ID        = 'input_runningorders_rcas_test_json'

// ─── 颜色 ─────────────────────────────────────────────────────────────────────
const c = { reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', bold:'\x1b[1m', dim:'\x1b[2m' }
const ok  = (s) => `${c.green}✅ ${s}${c.reset}`
const err = (s) => `${c.red}❌ ${s}${c.reset}`
const tip = (s) => `${c.cyan}ℹ  ${s}${c.reset}`
const hdr = (s) => `\n${c.bold}${c.yellow}${s}${c.reset}`

// ─── 工具函数 ──────────────────────────────────────────────────────────────────
function str(v) {
    if (!v) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v._mosString128 !== undefined) return String(v._mosString128)
    return String(v)
}

function storyIds(ro) { return (ro?.Stories ?? []).map(s => str(s.ID)) }
function wait(ms) { return new Promise(r => setTimeout(r, ms)) }
function readFile() { return fs.readFileSync(RUNDOWN_FILE, 'utf8') }
function writeFile(content) { fs.writeFileSync(RUNDOWN_FILE, content, 'utf8') }

function writeRundown(slug, stories) {
    const runningOrder = {
        ID: 'RCAS-TEST-RO-001',
        Slug: slug,
        DefaultChannel: 'A',
        Stories: stories.map(s => ({
            ID: str(s.ID),
            Slug: str(s.Slug),
            Number: str(s.Number) || 'A1',
            Items: (s.Items ?? []).map(item => ({
                ID: str(item.ID),
                Slug: str(item.Slug),
                ObjectID: str(item.ObjectID),
                MOSID: 'quick.mos',
                ObjectSlug: str(item.ObjectSlug || item.Slug),
                Duration: item.Duration ?? item.EditorialDuration ?? 1000,
                TimeBase: item.TimeBase ?? 25,
            }))
        }))
    }
    writeFile(JSON.stringify({ runningOrder, fullStories: [] }, null, 2))
}

async function fetchRO(roId) {
    try {
        const res = await fetch(`${BACKEND_HTTP}/rundowns/${encodeURIComponent(roId)}`)
        if (!res.ok) return null
        return await res.json()
    } catch { return null }
}

async function fetchAllROs() {
    try {
        const res = await fetch(`${BACKEND_HTTP}/rundowns`)
        if (!res.ok) return []
        const data = await res.json()
        return data.rundowns ?? []
    } catch { return [] }
}

function printRO(ro) {
    if (!ro) { console.log(err('RO 不存在')); return }
    console.log(tip(`RO ID:   ${str(ro.ID)}`))
    console.log(tip(`RO Slug: ${str(ro.Slug)}`))
    console.log(tip(`Stories (${ro.Stories?.length ?? 0}):`))
    for (const s of ro.Stories ?? []) {
        console.log(`         ${c.dim}[${str(s.ID)}] ${str(s.Slug) || '(无Slug)'} — ${s.Items?.length ?? 0} 个 Item${c.reset}`)
        for (const item of s.Items ?? []) {
            console.log(`           ${c.dim}└─ Item[${str(item.ID)}] ${str(item.Slug) || ''}${c.reset}`)
        }
    }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
function pressEnter(prompt = '按回车继续...') {
    return new Promise(resolve => rl.question(`\n${c.dim}${prompt}${c.reset}`, resolve))
}

// ─── 步骤定义 ──────────────────────────────────────────────────────────────────
const steps = [

    {
        name: '初始状态检查',
        desc: '验证 rcas-test.json 已被 quick-mos 推送，后端持久化正常',
        run: async () => {
            const ro = await fetchRO(RO_ID)
            printRO(ro)
            if (!ro) { console.log(err('RO 不存在！请确认 quick-mos 已启动并连接后端')); return false }
            const ids = storyIds(ro)
            const ok1 = ids.includes('STORY-OPEN')
            const ok2 = ids.includes('STORY-POLITICS')
            const ok3 = ids.includes('STORY-ECONOMY')
            const ok4 = ids.includes('STORY-SPORTS')
            console.log(ok1 ? ok('STORY-OPEN 存在')    : err('STORY-OPEN 缺失'))
            console.log(ok2 ? ok('STORY-POLITICS 存在') : err('STORY-POLITICS 缺失'))
            console.log(ok3 ? ok('STORY-ECONOMY 存在')  : err('STORY-ECONOMY 缺失'))
            console.log(ok4 ? ok('STORY-SPORTS 存在')   : err('STORY-SPORTS 缺失'))
            const diskDir = path.join(__dirname, 'data/rundowns')
            const diskFiles = fs.existsSync(diskDir) ? fs.readdirSync(diskDir).filter(f => f.endsWith('.json')) : []
            console.log(diskFiles.length > 0
                ? ok(`持久化：${diskFiles.length} 个 RO 文件已写入 data/rundowns/`)
                : err('持久化：data/rundowns/ 里没有文件'))
            return ok1 && ok2 && ok3 && ok4
        },
    },

    {
        name: 'roMetadataReplace',
        desc: '修改 RO Slug，验证 Stories 顺序不变',
        run: async () => {
            const before = await fetchRO(RO_ID)
            const beforeIds = storyIds(before)
            const json = JSON.parse(readFile())
            json.runningOrder.Slug = '晚间新闻联播（已更新）'
            writeFile(JSON.stringify(json, null, 2))
            console.log(tip('已修改 Slug，等待推送...'))
            await wait(WAIT_MS)
            const after = await fetchRO(RO_ID)
            printRO(after)
            const slugOk    = str(after?.Slug).includes('已更新')
            const storiesOk = JSON.stringify(storyIds(after)) === JSON.stringify(beforeIds)
            console.log(slugOk    ? ok('Slug 已更新')      : err('Slug 未更新'))
            console.log(storiesOk ? ok('Stories 顺序不变') : err('Stories 发生了变化'))
            return slugOk && storiesOk
        },
    },

    {
        name: 'roInsertStories',
        desc: '在 STORY-POLITICS 之前插入新 Story',
        run: async () => {
            const json = JSON.parse(readFile())
            const polIdx = json.runningOrder.Stories.findIndex(s => s.ID === 'STORY-POLITICS')
            const newStory = {
                ID: 'STORY-NEW', Slug: '突发新闻', Number: 'A1B',
                Items: [{ ID: 'ITEM-NEW-01', Slug: '突发新闻:画面', ObjectID: 'OBJ-NEW-001',
                    MOSID: 'quick.mos', ObjectSlug: '突发事件现场画面', Duration: 1200, TimeBase: 25 }]
            }
            json.runningOrder.Stories.splice(polIdx === -1 ? 1 : polIdx, 0, newStory)
            writeFile(JSON.stringify(json, null, 2))
            console.log(tip('已插入 STORY-NEW（在 STORY-POLITICS 之前），等待推送...'))
            await wait(WAIT_MS)
            const ro = await fetchRO(RO_ID)
            printRO(ro)
            const ids = storyIds(ro)
            const newIdx      = ids.indexOf('STORY-NEW')
            const politicsIdx = ids.indexOf('STORY-POLITICS')
            const inserted = newIdx !== -1
            const order    = inserted && newIdx < politicsIdx
            console.log(inserted ? ok('STORY-NEW 已插入')               : err('STORY-NEW 不存在'))
            console.log(order    ? ok('STORY-NEW 在 STORY-POLITICS 之前') : err('顺序不对'))
            return inserted && order
        },
    },

    {
        name: 'roReplaceStories',
        desc: '替换 STORY-ECONOMY 的 Slug',
        run: async () => {
            const json = JSON.parse(readFile())
            const story = json.runningOrder.Stories.find(s => s.ID === 'STORY-ECONOMY')
            if (!story) { console.log(err('找不到 STORY-ECONOMY')); return false }
            story.Slug = '财经深度报道'
            writeFile(JSON.stringify(json, null, 2))
            console.log(tip('已将 STORY-ECONOMY Slug 改为「财经深度报道」，等待推送...'))
            await wait(WAIT_MS)
            const ro = await fetchRO(RO_ID)
            printRO(ro)
            const s = (ro?.Stories ?? []).find(s => str(s.ID) === 'STORY-ECONOMY')
            const replaced = str(s?.Slug).includes('财经深度报道')
            console.log(replaced ? ok('STORY-ECONOMY Slug 已替换') : err('替换失败'))
            return replaced
        },
    },

    {
        name: 'roMoveStories',
        desc: '将 STORY-SPORTS 移到最前面',
        run: async () => {
            const before = await fetchRO(RO_ID)
            const stories = [...(before?.Stories ?? [])]
            const idx = stories.findIndex(s => str(s.ID) === 'STORY-SPORTS')
            if (idx === -1) { console.log(err('找不到 STORY-SPORTS')); return false }
            const [sports] = stories.splice(idx, 1)
            stories.unshift(sports)
            writeRundown(str(before.Slug), stories)
            console.log(tip('已将 STORY-SPORTS 移到最前，等待推送...'))
            await wait(WAIT_MS)
            const ro = await fetchRO(RO_ID)
            printRO(ro)
            const ids = storyIds(ro)
            const sportsFirst = ids[0] === 'STORY-SPORTS'
            console.log(sportsFirst ? ok('STORY-SPORTS 已移到第一位') : err(`第一位是 ${ids[0]}`))
            return sportsFirst
        },
    },

    {
        name: 'roSwapStories',
        desc: '交换 STORY-OPEN 和 STORY-POLITICS 的位置',
        run: async () => {
            const before = await fetchRO(RO_ID)
            const stories = [...(before?.Stories ?? [])]
            const openIdx     = stories.findIndex(s => str(s.ID) === 'STORY-OPEN')
            const politicsIdx = stories.findIndex(s => str(s.ID) === 'STORY-POLITICS')
            if (openIdx === -1 || politicsIdx === -1) {
                console.log(err('找不到 STORY-OPEN 或 STORY-POLITICS')); return false
            }
            ;[stories[openIdx], stories[politicsIdx]] = [stories[politicsIdx], stories[openIdx]]
            writeRundown(str(before.Slug), stories)
            console.log(tip('已交换 STORY-OPEN 和 STORY-POLITICS，等待推送...'))
            await wait(WAIT_MS)
            const after = await fetchRO(RO_ID)
            printRO(after)
            const afterIds = storyIds(after)
            const swapped = afterIds.indexOf('STORY-POLITICS') === openIdx &&
                            afterIds.indexOf('STORY-OPEN')     === politicsIdx
            console.log(swapped ? ok('Story 位置已互换') : err(`互换失败，当前顺序: ${afterIds.join(', ')}`))
            return swapped
        },
    },

    {
        name: 'roDeleteStories',
        desc: '删除 STORY-NEW',
        run: async () => {
            const before = await fetchRO(RO_ID)
            const stories = (before?.Stories ?? []).filter(s => str(s.ID) !== 'STORY-NEW')
            if (stories.length === (before?.Stories ?? []).length) {
                console.log(err('找不到 STORY-NEW')); return false
            }
            writeRundown(str(before.Slug), stories)
            console.log(tip('已删除 STORY-NEW，等待推送...'))
            await wait(WAIT_MS)
            const ro = await fetchRO(RO_ID)
            printRO(ro)
            const deleted = !storyIds(ro).includes('STORY-NEW')
            console.log(deleted ? ok('STORY-NEW 已删除') : err('STORY-NEW 仍然存在'))
            return deleted
        },
    },

    {
        name: 'roReplace',
        desc: '完整替换整个 RO（全新 Stories 结构）',
        run: async () => {
            const newJson = {
                runningOrder: {
                    ID: 'RCAS-TEST-RO-001',
                    Slug: '晚间新闻联播（已替换）',
                    DefaultChannel: 'B',
                    Stories: [
                        { ID: 'STORY-REPLACED-1', Slug: '替换后Story1', Number: 'B1', Items: [] },
                        { ID: 'STORY-REPLACED-2', Slug: '替换后Story2', Number: 'B2', Items: [] },
                    ]
                },
                fullStories: []
            }
            writeFile(JSON.stringify(newJson, null, 2))
            console.log(tip('已完整替换 RO，等待推送...'))
            await wait(WAIT_MS)
            const ro = await fetchRO(RO_ID)
            printRO(ro)
            const ids = storyIds(ro)
            const replaced = ids.includes('STORY-REPLACED-1') && ids.includes('STORY-REPLACED-2')
            const oldGone  = !ids.includes('STORY-OPEN') && !ids.includes('STORY-POLITICS')
            console.log(replaced ? ok('新 Stories 已存在') : err('新 Stories 不存在'))
            console.log(oldGone  ? ok('旧 Stories 已消失') : err('旧 Stories 仍然存在'))
            return replaced && oldGone
        },
    },

    {
        name: 'roDelete',
        desc: '删除整个 RO（删除文件）',
        run: async () => {
            fs.unlinkSync(RUNDOWN_FILE)
            console.log(tip('已删除 rundown 文件，等待 quick-mos 推送 roDelete...'))
            await wait(WAIT_MS * 2)
            const ro = await fetchRO(RO_ID)
            const allROs = await fetchAllROs()
            printRO(ro)
            const deleted = !ro
            console.log(deleted ? ok('RO 已从后端删除') : err('RO 仍然存在'))
            console.log(tip(`当前后端 RO 总数：${allROs.length}`))
            const diskDir = path.join(__dirname, 'data/rundowns')
            const diskFiles = fs.existsSync(diskDir) ? fs.readdirSync(diskDir).filter(f => f.endsWith('.json')) : []
            const diskCleaned = !diskFiles.some(f => f.includes('RCAS') || f.includes('rcas'))
            console.log(diskCleaned ? ok('持久化文件已清理') : err('持久化文件未清理'))
            return deleted
        },
    },
]

// ─── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
    console.log(hdr('═══════════════════════════════════════════'))
    console.log(hdr('   RCAS Profile 2 交互式验证脚本'))
    console.log(hdr('═══════════════════════════════════════════'))
    console.log(tip(`后端地址：${BACKEND_HTTP}`))
    console.log(tip(`Rundown 文件：${RUNDOWN_FILE}`))
    console.log(tip(`预期 RO ID：${RO_ID}`))

    try {
        const res = await fetch(`${BACKEND_HTTP}/rundowns`)
        if (!res.ok) throw new Error()
        console.log(ok('后端连通正常'))
    } catch {
        console.log(err('无法连接后端！请先启动后端'))
        rl.close(); process.exit(1)
    }

    if (!fs.existsSync(RUNDOWN_FILE)) {
        console.log(err(`找不到 rundown 文件：${RUNDOWN_FILE}`))
        rl.close(); process.exit(1)
    }

    let passed = 0, failed = 0

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        console.log(hdr(`─── 步骤 ${i}/${steps.length - 1}：${step.name} ${'─'.repeat(Math.max(0, 35 - step.name.length))}`))
        console.log(tip(step.desc))
        if (i > 0) await pressEnter(`按回车执行「${step.name}」→ `)
        let result = false
        try { result = await step.run() }
        catch (e) { console.log(err(`执行出错：${e.message}`)) }
        if (result) { passed++; console.log(ok(`步骤 ${i} 通过`)) }
        else        { failed++; console.log(err(`步骤 ${i} 失败`)); await pressEnter('继续下一步？(回车继续 / Ctrl+C 退出) ') }
    }

    console.log(hdr('═══════════════════════════════════════════'))
    console.log(ok(`通过：${passed}/${steps.length}`))
    if (failed > 0) console.log(err(`失败：${failed}/${steps.length}`))
    rl.close()
}

main().catch(e => { console.error(e); rl.close(); process.exit(1) })
