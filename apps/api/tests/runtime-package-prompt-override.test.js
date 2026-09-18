const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

async function createRuntimeFixture(t, workspaceId) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), `caishen-package-prompts-${workspaceId}-`));
  const imageBytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#4477aa' } }).png().toBuffer();
  const captured = { imageBodies: [], analysisBodies: [] };
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/images/edits') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        captured.imageBodies.push(Buffer.concat(chunks).toString('utf8'));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ b64_json: imageBytes.toString('base64') }] }));
      });
      return;
    }
    if (req.url === '/v1/chat/completions') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        captured.analysisBodies.push(Buffer.concat(chunks).toString('utf8'));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                category: 'test',
                product_type: 'test',
                material: '',
                color: '',
                dimensions: '',
                selling_points: []
              })
            }
          }]
        }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  });

  const previousEnv = {
    dataDir: process.env.CAISHEN_DATA_DIR,
    workspaceId: process.env.CAISHEN_WORKSPACE_ID,
    baseUrl: process.env.CAISHEN_API_BASE_URL,
    apiKey: process.env.CAISHEN_API_KEY,
    imageKey: process.env.CAISHEN_IMAGE_API_KEY,
    responseFormat: process.env.CAISHEN_IMAGE_RESPONSE_FORMAT
  };
  process.env.CAISHEN_DATA_DIR = path.join(temp, 'data');
  process.env.CAISHEN_WORKSPACE_ID = workspaceId;
  process.env.CAISHEN_API_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.CAISHEN_API_KEY = 'global-key';
  process.env.CAISHEN_IMAGE_API_KEY = 'global-key';
  process.env.CAISHEN_IMAGE_RESPONSE_FORMAT = 'b64_json';
  t.after(() => {
    if (previousEnv.dataDir === undefined) delete process.env.CAISHEN_DATA_DIR;
    else process.env.CAISHEN_DATA_DIR = previousEnv.dataDir;
    if (previousEnv.workspaceId === undefined) delete process.env.CAISHEN_WORKSPACE_ID;
    else process.env.CAISHEN_WORKSPACE_ID = previousEnv.workspaceId;
    if (previousEnv.baseUrl === undefined) delete process.env.CAISHEN_API_BASE_URL;
    else process.env.CAISHEN_API_BASE_URL = previousEnv.baseUrl;
    if (previousEnv.apiKey === undefined) delete process.env.CAISHEN_API_KEY;
    else process.env.CAISHEN_API_KEY = previousEnv.apiKey;
    if (previousEnv.imageKey === undefined) delete process.env.CAISHEN_IMAGE_API_KEY;
    else process.env.CAISHEN_IMAGE_API_KEY = previousEnv.imageKey;
    if (previousEnv.responseFormat === undefined) delete process.env.CAISHEN_IMAGE_RESPONSE_FORMAT;
    else process.env.CAISHEN_IMAGE_RESPONSE_FORMAT = previousEnv.responseFormat;
  });

  const runtimePath = require.resolve('../src/runtime');
  delete require.cache[runtimePath];
  const runtime = require('../src/runtime');
  t.after(() => delete require.cache[runtimePath]);
  await runtime.initializeRuntime();
  await runtime.saveConfig({ outputPath: path.join(temp, 'output') });
  await runtime.saveApiSettings({
    activeRelayId: 'primary',
    relays: [{
      id: 'primary', name: 'Primary relay', description: 'Test relay', enabled: true,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      imageApiKey: 'global-key', imageModel: 'gpt-image-2',
      imagePriceMinMinor: 1, imagePriceMaxMinor: 1
    }]
  });
  const sourcePath = path.join(temp, 'source.png');
  await fs.writeFile(sourcePath, imageBytes);
  const secondSourcePath = path.join(temp, 'second-source.png');
  await fs.writeFile(secondSourcePath, imageBytes);
  return { runtime, captured, sourcePath, secondSourcePath };
}

test('relay generation keeps the user image prompt and bills repeated requests independently', { concurrency: false }, async (t) => {
  const { runtime, captured, sourcePath } = await createRuntimeFixture(t, 'standard-package-prompts');
  await runtime.billing.saveRules({
    enabled: true
  });
  await runtime.billing.adjustBalance('standard-package-prompts', 'primary', 1000000);

  await runtime.generateFree({ sourcePath, prompt: 'ORIGINAL USER IMAGE PROMPT' });
  await runtime.generateFree({ sourcePath, prompt: 'ORIGINAL USER IMAGE PROMPT' });
  assert.match(captured.imageBodies[0], /ORIGINAL USER IMAGE PROMPT/);
  assert.equal(captured.imageBodies.length, 2);
  const transactions = await runtime.billing.listTransactions('standard-package-prompts', 20);
  assert.equal(transactions.filter(entry => entry.kind === 'image').length, 2);
  assert.ok(transactions.filter(entry => entry.kind === 'image').every(entry => entry.relayId === 'primary' && entry.unitPriceMinor === 1));
});

test('relay generation does not replace the user image prompt', { concurrency: false }, async (t) => {
  const { runtime, captured, sourcePath } = await createRuntimeFixture(t, 'flagship-package-prompts');

  await runtime.generateFree({ sourcePath, prompt: 'ORIGINAL USER IMAGE PROMPT' });
  assert.match(captured.imageBodies[0], /ORIGINAL USER IMAGE PROMPT/);
});

test('free generation sends multiple reference images in their selected order', { concurrency: false }, async (t) => {
  const { runtime, captured, sourcePath, secondSourcePath } = await createRuntimeFixture(t, 'multi-reference-free-generation');
  await runtime.generateFree({ sourcePaths: [sourcePath, secondSourcePath], prompt: 'COMBINE BOTH REFERENCES' });
  assert.equal(captured.imageBodies.length, 1);
  assert.match(captured.imageBodies[0], /COMBINE BOTH REFERENCES/);
  assert.match(captured.imageBodies[0], /name="image\[\]"; filename="source\.(?:jpg|png)"/);
  assert.match(captured.imageBodies[0], /name="image\[\]"; filename="second-source\.(?:jpg|png)"/);
  assert.ok(captured.imageBodies[0].indexOf('filename="source.') < captured.imageBodies[0].indexOf('filename="second-source.'));
});

test('free generation review task can regenerate from review page', { concurrency: false }, async (t) => {
  const { runtime, captured, sourcePath } = await createRuntimeFixture(t, 'free-review-regeneration');
  await runtime.billing.saveRules({ enabled: true });
  await runtime.billing.adjustBalance('free-review-regeneration', 'primary', 1000000);
  const result = await runtime.generateFree({ sourcePath, prompt: 'FREE REVIEW ORIGINAL PROMPT' });
  await runtime.regenerateSingleTemplate({
    folder: result.folder,
    relativePath: '自由生图.png',
    extraInstruction: 'MAKE IT BRIGHTER'
  });
  assert.equal(captured.imageBodies.length, 2);
  assert.match(captured.imageBodies[1], /FREE REVIEW ORIGINAL PROMPT/);
  assert.match(captured.imageBodies[1], /MAKE IT BRIGHTER/);
  const transactions = await runtime.billing.listTransactions('free-review-regeneration', 20);
  assert.equal(transactions.filter(entry => entry.kind === 'image').length, 2);
});

test('taobao main image batch creates five separately downloadable images', { concurrency: false }, async (t) => {
  const { runtime, captured, sourcePath } = await createRuntimeFixture(t, 'taobao-five-main-images');
  await runtime.billing.saveRules({ enabled: true });
  await runtime.billing.adjustBalance('taobao-five-main-images', 'primary', 1000000);
  const progress = [];
  const prompts = ['员工提示词一', '员工提示词二', '员工提示词三', '员工提示词四', '员工提示词五'];
  const result = await runtime.generateTaobaoMainImages({ sourcePath, prompts }, {
    reportProgress: item => progress.push(item)
  });
  assert.equal(captured.imageBodies.length, 5);
  assert.equal(result.successful, 5);
  assert.equal(result.failed, 0);
  assert.equal(result.results.length, 5);
  assert.ok(result.results.every(item => item.status === 'completed' && item.outputPath && item.url));
  assert.deepEqual(prompts.map(prompt => captured.imageBodies.some(body => body.includes(prompt))), [true, true, true, true, true]);
  assert.ok(captured.imageBodies.every(body => body.includes('必须准确保持产品')));
  assert.ok(progress.some(item => item.current === 5 && item.total === 5));
  const transactions = await runtime.billing.listTransactions('taobao-five-main-images', 20);
  assert.equal(transactions.filter(entry => entry.kind === 'image').length, 5);
});

test('taobao main image batch accepts multiple product images', { concurrency: false }, async (t) => {
  const { runtime, captured, sourcePath, secondSourcePath } = await createRuntimeFixture(t, 'taobao-multi-product-images');
  const prompts = ['开放提示一', '开放提示二', '开放提示三', '开放提示四', '开放提示五'];
  const result = await runtime.generateTaobaoMainImages({ sourcePaths: [sourcePath, secondSourcePath], prompts });
  assert.equal(captured.imageBodies.length, 10);
  assert.equal(result.groups.length, 2);
  assert.equal(result.results.length, 10);
  assert.equal(result.successful, 10);
  assert.ok(result.groups.every(group => group.successful === 5 && group.folder));
  assert.ok(captured.imageBodies.some(body => body.includes('开放提示一')));
});
