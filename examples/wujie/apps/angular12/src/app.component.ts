/**
 * angular 子应用（对齐 wujie examples/angular12 的全部演示页面）：
 *   home / dialog / location / communication
 *
 * 接入方式：@taixu/adapter-angular（defineCordisAngularApp）——
 * - Angular 路线硬约束：standalone components + AOT（@NgModule + JIT 不可行）
 * - @angular/core 经 deps 共享依赖仲裁获取（singleton + strict，禁止双实例 DI 树）
 * - Angular 错误经 ErrorHandler DI token 转发 monitor.capture
 *
 * 页面切换用 signal（Angular 17 控制流 @if/@for）；宿主消息经 bridge 下行。
 */
import 'zone.js'
import { Component, signal, VERSION } from '@angular/core'
import { bridge } from './bridge'

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <div>
      <nav class="txng-nav">
        @for (p of PAGES; track p[0]) {
          <button [class.on]="page() === p[0]" (click)="nav(p[0])">{{ p[1] }}</button>
        }
      </nav>
      <div class="txng-page">
        @switch (page()) {
          @case ('home') {
            <h2>angular 示例</h2>
            <p>当前 Angular 版本 <b>{{ ngVersion }}（standalone + AOT）</b>，taixu adapter-angular 接入（createApplication 独立 ApplicationRef）。</p>
            <p>官方示例 UI 库：ng-zorro-antd 版本 12（官方 angular12 示例所用）—— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。</p>
            <p>仓库地址：<a [href]="repo" target="_blank" rel="noreferrer">{{ repo }}</a></p>
            <p>页面目录：弹窗 / 路由 / 通信。</p>
          }
          @case ('dialog') {
            <h2>弹窗处理</h2>
            <p>弹窗无需子应用做任何处理就可使用（同文档渲染，无 shadowRoot/iframe 边界）。</p>
            <h3>1. 打开弹窗</h3>
            <button class="txng-btn" (click)="open.set(true)">Open Modal</button>
            <h3>2. 下拉选择器</h3>
            <select class="txng-select">
              <option value="" disabled selected>Select a person</option>
              <option>Jack</option>
              <option>Lucy</option>
              <option>Tom</option>
            </select>
            @if (open()) {
              <div class="txng-overlay" (click)="open.set(false)">
                <div class="txng-modal" (click)="$event.stopPropagation()">
                  <h3>Basic Modal</h3>
                  <p>弹窗内容（渲染在子应用容器内，同文档无边界）</p>
                  <div style="text-align: right; margin-top: 14px">
                    <button class="txng-btn" (click)="open.set(false)">OK</button>
                  </div>
                </div>
              </div>
            }
          }
          @case ('location') {
            <h2>location 处理</h2>
            <h3>1. 获取 window.location.host 的值</h3>
            <blockquote><b>{{ host }}</b></blockquote>
            <p>taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。</p>
            <h3>2. 修改 window.location.href</h3>
            <button class="txng-btn warn" (click)="jump()">跳转 taixu 仓库</button>
          }
          @case ('communication') {
            <h2>通信处理</h2>
            <h3>1. 宿主导航能力（= props.jump）</h3>
            <button class="txng-btn" (click)="bridge.notify('home'); bridge.jump('react16')">点击跳转 react16</button>
            <h3>2. 调用宿主全局方法</h3>
            <button class="txng-btn" (click)="window.alert('子应用直接调用 window.alert')">显示 alert</button>
            <h3>3. bus 去中心化事件</h3>
            <button class="txng-btn" (click)="bridge.click()">显示 alert（bus）</button>
          }
        }
      </div>
    </div>
  `,
})
export class AppComponent {
  bridge = bridge
  window = window
  host = window.location.host
  /** 仓库地址（官方各子应用首页都有「仓库地址」入口，此处指向 taixu 仓库） */
  repo = 'https://github.com/YvYuYv/taixu'
  ngVersion = VERSION.full
  PAGES: Array<[string, string]> = [
    ['home', '首页'],
    ['dialog', '弹窗'],
    ['location', '路由'],
    ['communication', '通信'],
  ]
  page = signal('home')
  open = signal(false)

  ngOnInit() {
    // 宿主下行消息 -> signal（bridge 由 main.ts 装配）
    bridge.setPage = (p: string) => this.page.set(p)
  }

  nav(p: string) {
    this.page.set(p)
    bridge.notify?.(p)
  }

  jump() {
    window.location.href = 'https://github.com/taixu-micro'
  }
}
