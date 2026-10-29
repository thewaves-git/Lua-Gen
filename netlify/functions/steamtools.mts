// Only these two fixed upstream operations are exposed; this is not an open proxy.
export default async function handler(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const search = path === '/api/search';
  if (!search && path !== '/api/generate') return Response.json({ message: 'Not found.' }, { status: 404 });
  const method = search ? 'GET' : 'POST';
  if (request.method !== method) {
    return Response.json({ message: 'Method not allowed.' }, { status: 405, headers: { Allow: method } });
  }
  const upstream = new URL(`https://steamtoolsapp.com/api/${search ? 'search' : 'generate'}`);
  let body: string | undefined;
  if (search) {
    const query = new URL(request.url).searchParams.get('query')?.trim();
    if (!query || query.length > 100) {
      return Response.json({ message: 'Enter an App ID or game name of up to 100 characters.' }, { status: 400 });
    }
    upstream.searchParams.set('query', query);
  } else {
    let input;
    try { input = await request.json(); } catch {
      return Response.json({ message: 'Invalid JSON request.' }, { status: 400 });
    }
    if (!input || typeof input.appId !== 'string' || !/^[1-9]\d{0,9}$/.test(input.appId)) {
      return Response.json({ message: 'Enter a valid positive Steam App ID (up to 10 digits).' }, { status: 400 });
    }
    body = JSON.stringify({ appId: input.appId, branch: 'public' });
  }
  try {
    const response = await fetch(upstream, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
      signal: AbortSignal.timeout(25000),
    });
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (response.headers.has('Retry-After')) headers['Retry-After'] = response.headers.get('Retry-After')!;
    if (!response.ok) {
      const message = response.status === 429
        ? 'SteamTools is rate limiting requests. Wait a few seconds and try again.'
        : response.status === 404 ? 'SteamTools could not find files for this App ID.'
        : response.status === 400 ? 'SteamTools rejected this App ID or search query.'
        : 'SteamTools is temporarily unavailable. Please try again later.';
      return Response.json({ message }, { status: response.status >= 500 ? 502 : response.status, headers });
    }
    const payload = await response.json();
    if (!payload || typeof payload.code !== 'number' || (payload.code === 0 && !payload.data)) {
      return Response.json({ message: 'SteamTools returned an unexpected response. Please try again later.' }, { status: 502, headers });
    }
    if (!search && payload.code === 0) {
      const appId = JSON.parse(body!).appId;
      const base = `https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/${appId}/`;
      const luaUrl = `${base}${appId}.lua`;
      const lua = await fetch(luaUrl, { signal: AbortSignal.timeout(10000) });
      if (!lua.ok) {
        return Response.json({ message: lua.status === 404 ? 'No Lua script is available in ManifestHub for this App ID.' : 'Unable to retrieve the Lua script from GitHub. Please try again.' }, { status: lua.status === 404 ? 404 : 502, headers });
      }
      const luaText = await lua.text();
      if (!luaText.trim() || /^\s*</.test(luaText)) {
        return Response.json({ message: 'GitHub returned an invalid Lua file.' }, { status: 502, headers });
      }
      payload.data.luaUrl = luaUrl;
      // The branch contains depot-specific filenames, so discover rather than invent them.
      payload.data.manifests = [];
      try {
        const listing = await fetch(`https://api.github.com/repos/steamtoolsapp/ManifestHub/git/trees/${appId}?recursive=1`, {
          headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000),
        });
        if (listing.ok) {
          const tree = await listing.json();
          if (Array.isArray(tree.tree)) {
            payload.data.manifests = tree.tree
              .filter((file: { type: string; path: string }) => file.type === 'blob' && typeof file.path === 'string' && file.path.endsWith('.manifest'))
              .map((file: { path: string }) => ({ name: file.path, url: base + file.path.split('/').map(encodeURIComponent).join('/') }));
          }
        }
      } catch { /* Lua and the public download package remain usable if listing fails. */ }
    }
    return Response.json(payload, { headers });
  } catch (error) {
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return Response.json({ message: timedOut ? 'SteamTools took too long to respond. Please try again.' : 'Unable to reach SteamTools. Please try again later.' }, { status: timedOut ? 504 : 502 });
  }
}

export const config = { path: ['/api/search', '/api/generate'] };
