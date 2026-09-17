const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const webRoot = path.join(__dirname, '../../web');

test('自由生图与一键生成主图使用任务卡片并进入人工筛图', async () => {
  const [html, renderer, bridge] = await Promise.all([
    fs.readFile(path.join(webRoot, 'index.html'), 'utf8'),
    fs.readFile(path.join(webRoot, 'src/renderer.js'), 'utf8'),
    fs.readFile(path.join(webRoot, 'src/api-bridge.js'), 'utf8')
  ]);
  assert.match(html, /data-page="free"[^>]*>自由生图/);
  assert.match(html, /data-page="taobao-main"[^>]*>一键生成主图/);
  assert.match(html, /id="page-taobao-main"/);
  assert.doesNotMatch(html, /data-free-mode=/);
  assert.doesNotMatch(html, /id="freeResult"/);
  assert.doesNotMatch(html, /id="taobaoResults"/);
  assert.match(html, /id="freeTaskList"/);
  assert.match(html, /id="taobaoTaskList"/);
  assert.match(html, /id="taobaoGenerateButton"/);
  assert.match(html, /id="taobaoPromptList"/);
  assert.match(renderer, /freeTasks/);
  assert.match(renderer, /taobaoTasks/);
  assert.match(renderer, /data-free-task-remove/);
  assert.match(renderer, /data-taobao-task-remove/);
  assert.match(renderer, /generateTaobaoMainImages/);
  assert.match(renderer, /TAOBAO_PROMPT_DEFAULTS/);
  assert.match(renderer, /data-taobao-prompt/);
  assert.match(renderer, /prompts\s*\n?\s*}/);
  assert.match(renderer, /persistTaobaoPrompts/);
  assert.match(renderer, /setPage\('review'\)/);
  assert.match(bridge, /chooseImages:[\s\S]*\/api\/upload\/images/);
  assert.match(bridge, /Math\.min\(30/);
  assert.match(bridge, /generateTaobaoMainImages:[\s\S]*runJob\('generateTaobaoMainImages'/);
});
