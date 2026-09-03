/**
 * postmessage 三级链路验证（本地 7700，hosts/main-vue/#/postmessage）：
 *   官方七条消息路径 + 菜单结构 + 导航隐藏 + 离开回收 + /vue3 回归。
 */
import { chromium } from 'playwright-core'

const results = []
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto('http://127.0.0.1:7700/hosts/main-vue/#/postmessage')
await page.waitForTimeout(2000)

// ---- 菜单结构 ----
const subLinks = await page.$$eval('.txh-submenu a', (as) => as.map((a) => a.textContent.trim()))
ok('vue2/vue3 子菜单无 postmessage 节点', !subLinks.includes('postmessage'), JSON.stringify(subLinks))
const navLinks = await page.$$eval('.txh-nav > a', (as) => as.map((a) => a.textContent.trim()))
ok('一级菜单保留 postmessage', navLinks.includes('postmessage'), JSON.stringify(navLinks))

// ---- 三级渲染 ----
try {
  await page.waitForSelector('text=vue2-子应用', { timeout: 8000 })
  ok('vue2 postmessage 页渲染（标题 vue2-子应用）', true)
} catch {
  ok('vue2 postmessage 页渲染（标题 vue2-子应用）', false)
}
try {
  await page.waitForSelector('#pm-nest-vue3 >> text=vue3-iframe', { timeout: 8000 })
  ok('嵌套 vue3 渲染（标题 vue3-iframe）', true)
} catch {
  ok('嵌套 vue3 渲染（标题 vue3-iframe）', false)
}
ok('vue2 导航在 postmessage 页隐藏', (await page.$('.txv2-nav')) === null)
ok('vue3 导航在 postmessage 页隐藏', (await page.$('.txv3-nav')) === null)

const btn = (name) => page.getByRole('button', { name, exact: true })
const mainText = async () => (await page.locator('.txh-postmessage .main-content div').first().innerText()).trim()
const v2Text = async () => (await page.locator('.txv2-pm-main > div').first().innerText()).trim()
const v3Text = async () => (await page.locator('#pm-nest-vue3').innerText()).trim()

// ---- 七条官方消息路径 ----
await btn('发送消息给vue2子应用').click()
await page.waitForTimeout(400)
ok('① 主应用→vue2', (await v2Text()).includes("hello, i'm main app"), await v2Text())

await btn('发送消息给vue2子应用的iframe').click()
await page.waitForTimeout(400)
ok('② 主应用→嵌套vue3（官方：发给iframe）', (await v3Text()).includes("hello, i'm main app"))

await btn('发消息给主应用').click()
await page.waitForTimeout(400)
ok('③ vue2→主应用', (await mainText()).includes("hello, i'm sub app"), await mainText())

await btn('发消息给iframe').click()
await page.waitForTimeout(400)
ok('④ vue2→嵌套vue3', (await v3Text()).includes("hello, i'm sub app"))

await btn('发送消息给主应用').click()
await page.waitForTimeout(400)
ok('⑤ vue3→主应用', (await mainText()).includes("hello, i'm sub app's iframe"), await mainText())

await btn('发送消息给vue2子应用(借助主应用)').click()
await page.waitForTimeout(400)
ok('⑥ vue3 借助主应用→vue2', (await v2Text()).includes("hello, i'm sub app's iframe"), await v2Text())

await btn('发送消息给自己(借助主应用)').click()
await page.waitForTimeout(400)
ok('⑦ vue3 借助主应用→自己', (await v3Text()).includes("hello, i'm sub app's iframe"))

// ---- 离开回收 + /vue3 回归 ----
await page.click('.txh-nav > a[href="#/home"]')
await page.waitForTimeout(800)
const nestGone = await page.evaluate(() => document.getElementById('pm-nest-vue3') === null)
ok('离开 postmessage 后嵌套实例回收', nestGone)

await page.click('.txh-nav > a[href="#/vue3"]')
await page.waitForTimeout(1200)
const v3Home = await page.evaluate(() => document.body.innerText.includes('vue3 示例'))
ok('/vue3 主槽位回归正常', v3Home)

ok('无运行时错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

console.log(results.join('\n'))
await browser.close()
