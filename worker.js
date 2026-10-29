export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      // Use steamtoolsapp.com as the upstream target
      const targetUrl = "https://steamtoolsapp.com" + path + url.search;

      try {
        const apiResponse = await fetch(targetUrl, {
          method: request.method,
          headers: {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://steamtoolsapp.com/"
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
