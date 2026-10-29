export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      // Forward the exact path and query string to steamtools.games
      const targetUrl = "https://steamtools.games" + path + url.search;

      try {
        const apiResponse = await fetch(targetUrl, {
          method: request.method,
          headers: {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://steamtools.games/"
          },
          body: request.method !== "GET" && request.method !== "HEAD" ? await request.text() : null
        });

        const data = await apiResponse.text();

        return new Response(data, {
          status: apiResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to connect to SteamTools API" }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    try {
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
    } catch (e) {}

    return new Response("Not Found", { status: 404 });
  }
};
