import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/steamtools.mts';

const request = (path, body) => new Request(`https://example.com/api/${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

test('validates requests before contacting upstream', async () => {
  assert.equal((await handler(request('search'))).status, 400);
  assert.equal((await handler(request('generate', { appId: 'abc' }))).status, 400);
  assert.equal((await handler(request('generate', null))).status, 400);
  assert.equal((await handler(request('generate'))).status, 405);
  assert.equal((await handler(request('unknown'))).status, 404);
});

test('proxies encoded search and canonical generation; preserves actual links', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      url = new URL(url);
      if (url.hostname === 'raw.githubusercontent.com') {
        assert.equal(url.href, 'https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/400/400.lua');
        return new Response('addappid(400)');
      }
      if (url.hostname === 'api.github.com') {
        return Response.json({ tree: [{ type: 'blob', path: '402_123.manifest' }, { type: 'blob', path: '400.lua' }] });
      }
      assert.equal(url.origin, 'https://steamtoolsapp.com');
      if (options.method === 'GET') {
        assert.equal(url.searchParams.get('query'), 'Portal & friends');
        return Response.json({ code: 0, data: { results: [] } });
      }
      assert.deepEqual(JSON.parse(options.body), { appId: '400', branch: 'public' });
      return Response.json({ code: 0, data: { luaUrl: 'https://steamtoolsapp.com/api/files/400/lua' } });
    };
    assert.equal((await handler(request('search?query=Portal%20%26%20friends'))).status, 200);
    const response = await handler(request('generate', { appId: '400', branch: 'untrusted' }));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = (await response.json()).data;
    assert.equal(data.luaUrl, 'https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/400/400.lua');
    assert.deepEqual(data.manifests, [{ name: '402_123.manifest', url: 'https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/400/402_123.manifest' }]);
  } finally { globalThis.fetch = original; }
});

test('handles rate limits, upstream outages, invalid JSON, and timeouts', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 429, headers: { 'Retry-After': '2' } });
    const limited = await handler(request('search?query=Portal'));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '2');
    globalThis.fetch = async () => new Response('upstream details', { status: 500 });
    assert.equal((await handler(request('generate', { appId: '400' }))).status, 502);
    globalThis.fetch = async () => new Response('<html>unavailable</html>');
    assert.equal((await handler(request('search?query=Portal'))).status, 502);
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    assert.equal((await handler(request('search?query=Portal'))).status, 504);
  } finally { globalThis.fetch = original; }
});


test('missing GitHub Lua is an error; unavailable manifest listing preserves Lua', async () => {
  const original = globalThis.fetch;
  try {
    let missing = true;
    globalThis.fetch = async url => {
      const host = new URL(url).hostname;
      if (host === 'steamtoolsapp.com') return Response.json({ code: 0, data: { gameName: 'Portal' } });
      if (host === 'raw.githubusercontent.com') return new Response(missing ? 'Not Found' : 'addappid(400)', { status: missing ? 404 : 200 });
      return new Response('', { status: 429 });
    };
    assert.equal((await handler(request('generate', { appId: '400' }))).status, 404);
    missing = false;
    const response = await handler(request('generate', { appId: '400' }));
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.luaUrl, 'https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/400/400.lua');
    assert.deepEqual(data.manifests, []);
  } finally { globalThis.fetch = original; }
});
