# Manifest Lab

A SteamTools download finder hosted on Netlify. Enter a Steam App ID or game name, select a matching game, and download the real files supplied by the public [SteamTools API](https://steamtoolsapp.com/api/search).

Search uses `GET /api/search?query=...`. Numeric App IDs proceed directly to `POST /api/generate` after a matching catalog result; name searches let the user choose the correct game. Generation sends `{ "appId": "400", "branch": "public" }`.

The Netlify Function proxies these two operations to `https://steamtoolsapp.com` so browser requests stay on the same origin. No API key, database, or build step is required. Deploy the repository root on Netlify; functions are in `netlify/functions`.

The backend fetches and verifies the Lua file at `https://raw.githubusercontent.com/steamtoolsapp/ManifestHub/{appId}/{appId}.lua` before exposing its download link. Individual depot manifests are discovered from the matching GitHub branch using the GitHub tree API. If that listing is unavailable, the Lua and public package links remain usable. Downloads also use the API's `luaUrl`, `keyVdfUrl`, `manifestUrl`, and `downloadUrl` links when present. Missing files are identified explicitly. The app does not fabricate scripts, hashes, manifest IDs, or metadata files. GitHub links use the requested App ID branch and actual repository filenames. SteamTools controls file availability and download contents. API failures, empty searches, timeouts, and rate limits appear inline.

Requests through the backend may share an upstream IP; retry after a short wait if rate limited.

For local development, run `netlify dev --port 8889` and open `http://localhost:8889`. A static-only host such as GitHub Pages cannot run the API proxy.

Run the API handler tests with `node --experimental-strip-types --test tests/*.test.mjs`.
