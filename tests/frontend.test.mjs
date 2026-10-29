import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup(responses) {
  class Element {
    children = []; textContent = ''; value = ''; disabled = false;
    classes = new Set(['hidden']);
    classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
    listeners = {};
    get childElementCount() { return this.children.length; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    removeAttribute(name) { delete this[name]; }
    focus() {}
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element() },
    URL, AbortSignal,
    fetch: async (path, options) => {
      calls.push({ path, options });
      return Response.json(responses.shift());
    },
  });
  vm.runInContext(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), context);
  return { get, calls, context };
}

test('numeric search retrieves real downloads and individual GitHub manifests', async () => {
  const { get, calls, context } = setup([
    { code: 0, data: { results: [{ id: '400', name: 'Portal' }] } },
    { code: 0, data: { gameName: 'Portal', luaUrl: '/api/files/400/lua', keyVdfUrl: '/api/files/400/key', downloadUrl: '/api/files/400/zip', manifests: [{ name: '402_123.manifest', url: 'https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/400/402_123.manifest' }], instructions: ['1. Install files.'] } },
  ]);
  get('appIdInput').value = '400';
  await vm.runInContext('searchGames()', context);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).appId, '400');
  assert.equal(get('downloadLinks').childElementCount, 4);
  assert.equal(get('availability').textContent, '');
  assert.equal(get('downloadLinks').children[0].children[0].children[0].href, 'https://steamtoolsapp.com/api/files/400/lua');
  assert.equal(get('outputStatus').textContent, 'DOWNLOADS READY');
});

test('name searches require explicit selection and escape game names as text', async () => {
  const { get, calls, context } = setup([
    { code: 0, data: { results: [{ id: '400', name: '<b>Portal</b>' }, { id: '620', name: 'Portal 2' }] } },
    { code: 0, data: { gameName: 'Portal 2', luaUrl: 'https://steamtoolsapp.com/api/files/620/lua' } },
  ]);
  get('appIdInput').value = 'Portal';
  await vm.runInContext('searchGames()', context);
  assert.equal(calls.length, 1);
  assert.equal(get('gameChoices').children[0].textContent, '<b>Portal</b>');
  await get('gameChoices').children[1].listeners.click();
  assert.equal(JSON.parse(calls[1].options.body).appId, '620');
});

test('no download links or empty searches display errors without fake files', async () => {
  const { get, context } = setup([
    { code: 0, data: { results: [{ id: '400', name: 'Portal' }] } },
    { code: 0, data: { gameName: 'Portal', luaUrl: 'javascript:alert(1)' } },
    { code: 0, data: { results: [] } },
  ]);
  get('appIdInput').value = '400';
  await vm.runInContext('searchGames()', context);
  assert.equal(get('downloadLinks').childElementCount, 0);
  assert.match(get('errorMsg').textContent, /no downloadable files/);
  get('appIdInput').value = 'missing';
  await vm.runInContext('searchGames()', context);
  assert.match(get('errorMsg').textContent, /No games found/);
  assert.equal(get('generateBtn').disabled, false);
});
