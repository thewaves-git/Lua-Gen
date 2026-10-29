const element = (id) => document.getElementById(id);
let busy = false;

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://steamtoolsapp.com');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
async function api(path, options) {
  // Ensure the path always starts with /api/ if it doesn't already
  const cleanPath = path.startsWith('/') ? path : `/api/${path}`
  const response = await fetch(cleanPath, { ...options, signal: AbortSignal.timeout(45000) });
  let payload;
    throw new Error('The server returned an unexpected response. Please try again later.');
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(response.status === 429
      ? 'SteamTools is rate limiting requests. Wait a few seconds and try again.'
      : payload.message || 'SteamTools could not complete this request. Please try again.');
  }
  return payload.data;
}

function clearResults() {
  for (const id of ['filesResult', 'gamePreview', 'searchResults', 'errorMsg']) element(id).classList.add('hidden');
  for (const id of ['downloadLinks', 'instructions', 'gameChoices']) element(id).replaceChildren();
  element('availability').textContent = '';
}

async function run(message, operation) {
  if (busy) return;
  busy = true;
  element('generateBtn').disabled = true;
  element('appIdInput').disabled = true;
  element('outputStatus').textContent = 'WORKING';
  element('outputExamples').classList.add('hidden');
  element('loadingState').textContent = message;
  element('loadingState').classList.remove('hidden');
  element('errorMsg').classList.add('hidden');
  element('searchResults').classList.add('hidden');
  try { await operation(); } catch (error) {
    clearResults();
    element('errorMsg').textContent = ['TimeoutError', 'AbortError'].includes(error.name)
      ? 'The request took too long. Please try again.' : error.message || 'Unable to connect. Please try again.';
    element('errorMsg').classList.remove('hidden');
    element('outputStatus').textContent = 'TRY AGAIN';
    element('outputExamples').classList.remove('hidden');
  } finally {
    busy = false;
    element('generateBtn').disabled = false;
    element('appIdInput').disabled = false;
    element('loadingState').classList.add('hidden');
  }
}

async function generate(appId) {
  element('loadingState').textContent = 'Retrieving download links from SteamTools…';
  const data = await api('/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, branch: 'public' }),
  });
  if (!data || typeof data.gameName !== 'string') throw new Error('SteamTools returned incomplete game details. Please try again.');
  const files = [
    ['luaUrl', 'Lua script (.lua)'], ['keyVdfUrl', 'key.vdf'],
    ['manifestUrl', 'Manifest (.manifest)'], ['downloadUrl', 'ZIP package'],
  ];
  const missing = [];
  for (const [field, label] of files) {
    const href = safeUrl(data[field]);
    if (!href) { missing.push(label); continue; }
    const card = document.createElement('div');
    card.className = 'code-card';
    const body = document.createElement('div');
    body.className = 'code-body';
    const link = document.createElement('a');
    link.className = 'download';
    link.textContent = `Download ${label} ↓`;
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    body.append(link);
    card.append(body);
    element('downloadLinks').append(card);
  }
  if (Array.isArray(data.manifests)) {
    for (const manifest of data.manifests) {
      const href = safeUrl(manifest.url);
      if (!href || typeof manifest.name !== 'string') continue;
      const link = document.createElement('a');
      link.className = 'download';
      link.textContent = `Download ${manifest.name} ↓`;
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const card = document.createElement('div');
      card.className = 'code-card';
      card.append(link);
      element('downloadLinks').append(card);
    }
    if (data.manifests.length) {
      const missingManifest = missing.indexOf('Manifest (.manifest)');
      if (missingManifest !== -1) missing.splice(missingManifest, 1);
    }
  }
  if (!element('downloadLinks').childElementCount) throw new Error('SteamTools returned no downloadable files for this game. Please try another game or retry later.');
  element('gameName').textContent = data.gameName;
  element('gameAppId').textContent = `App ID: ${appId}`;
  const cover = element('gameCover');
  const image = safeUrl(data.gameImage);
  cover.hidden = !image;
  cover.removeAttribute('src');
  cover.onerror = () => { cover.hidden = true; };
  if (image) cover.src = image;
  element('availability').textContent = missing.length ? `Not supplied by SteamTools: ${missing.join(', ')}.` : '';
  if (Array.isArray(data.instructions)) {
    for (const instruction of data.instructions) {
      if (typeof instruction !== 'string') continue;
      const li = document.createElement('li');
      li.textContent = instruction.replace(/^\d+[.)]\s*/, '');
      element('instructions').append(li);
    }
  }
  element('gamePreview').classList.remove('hidden');
  element('filesResult').classList.remove('hidden');
  element('outputStatus').textContent = 'DOWNLOADS READY';
}

async function searchGames() {
  if (busy) return;
  clearResults();
  const query = element('appIdInput').value.trim();
  await run('Searching the Steam catalog…', async () => {
    if (!query || query.length > 100) throw new Error('Enter an App ID or game name of up to 100 characters.');
    if (/^\d+$/.test(query) && !/^[1-9]\d{0,9}$/.test(query)) throw new Error('App IDs must be positive numbers of up to 10 digits.');
    const data = await api(`/api/search?query=${encodeURIComponent(query)}`);
    if (!data || !Array.isArray(data.results)) throw new Error('SteamTools returned an unexpected search response.');
    const results = data.results.filter(game => game && /^[1-9]\d{0,9}$/.test(String(game.id)) && typeof game.name === 'string');
    if (!results.length) throw new Error('No games found. Try a different name or App ID.');
    if (/^\d+$/.test(query)) {
      const match = results.find(game => String(game.id) === query);
      if (!match) throw new Error('No game found for this App ID.');
      await generate(String(match.id));
      return;
    }
    for (const game of results) {
      const button = document.createElement('button');
      button.className = 'game-choice';
      button.textContent = game.name;
      const id = document.createElement('small');
      id.textContent = `App ID: ${game.id} · Get downloads ↗`;
      button.append(id);
      button.addEventListener('click', () => run('Retrieving download links…', () => generate(String(game.id))));
      element('gameChoices').append(button);
    }
    element('searchResults').classList.remove('hidden');
    element('outputStatus').textContent = 'CHOOSE A GAME';
  });
}

element('generateBtn').addEventListener('click', searchGames);
element('appIdInput').addEventListener('keydown', event => { if (event.key === 'Enter') searchGames(); });
element('resetBtn').addEventListener('click', () => {
  clearResults();
  element('appIdInput').value = '';
  element('outputExamples').classList.remove('hidden');
  element('outputStatus').textContent = 'FREE GENERATIONS';
  element('appIdInput').focus();
});
