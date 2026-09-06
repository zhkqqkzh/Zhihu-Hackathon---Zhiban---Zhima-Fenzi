// 常驻入口（§六）：页面右侧极窄竖条，贴边半透明。
// 首访一次性引导「选中任意概念，试试问知伴」；用过后自动弱化；可永久关闭。
// 为什么必须有：预扫描是懒触发的，新用户看不到入口就永远问不出第一个。

import { shadowRoot, el, toast } from './ui.js';
import * as store from './store.js';
import { openSidebar } from './sidebar.js';

const CSS = `
:host { all: initial; }
.zb-entry {
  position: fixed; right: 0; top: 40%; z-index: 99990;
  writing-mode: vertical-rl; letter-spacing: 4px;
  background: rgba(5,109,232,.88); color: #fff; border: 0;
  padding: 14px 7px; border-radius: 8px 0 0 8px; cursor: pointer;
  font-size: 13px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: opacity .3s, background .2s;
}
.zb-entry.used { opacity: .35; }
.zb-entry.used:hover { opacity: .9; }
.zb-entry-tip {
  position: fixed; right: 34px; top: 40%; z-index: 99990;
  background: #fff; border: 1px solid #e7e7e7; border-radius: 10px;
  padding: 10px 14px; width: 220px; font-size: 13px; line-height: 1.7;
  box-shadow: 0 6px 24px rgba(18,18,18,.12);
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.zb-entry-tip b { color: #056de8; }
.zb-entry-close { display: block; margin-top: 6px; font-size: 12px; color: #8590a6; background: none; border: 0; cursor: pointer; padding: 0; }
`;

export function initEntry() {
  render();
}

async function render() {
  const meta = await store.getMeta();
  if (meta.entryClosed) return;
  const rootEl = document.getElementById('zb-entry');
  rootEl.replaceChildren();
  const { host, root } = shadowRoot('div', CSS);

  const btn = el('button', { class: `zb-entry${meta.entryUsed ? ' used' : ''}`, text: '知伴 · 问看山' });
  btn.addEventListener('click', async () => {
    await store.saveMeta({ entryUsed: true });
    render();
    openSidebar();
  });
  root.appendChild(btn);

  if (!meta.entryUsed && !meta.tipDismissed) {
    const tip = el('div', { class: 'zb-entry-tip' }, [
      el('div', { html: '我是看山。读到这里卡住的话，<b>选中任意不懂的概念</b>，划一下，我就在这篇回答的语境里给你讲明白。' }),
      el('button', { class: 'zb-entry-close', text: '知道了', onclick: async () => { await store.saveMeta({ tipDismissed: true }); render(); } }),
      el('button', { class: 'zb-entry-close', text: '永久关闭入口', onclick: async () => {
        await store.saveMeta({ entryClosed: true });
        render();
        toast('入口已关闭。刷新后不会再出现，侧栏历史数据不受影响。');
      } }),
    ]);
    root.appendChild(tip);
  }

  rootEl.appendChild(host);
}
