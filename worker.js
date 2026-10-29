export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if the path is an API endpoint
    if (path.startsWith("/api/")) {
      const isSearch = path === "/api/search";
      const isGenerate = path === "/api/generate";

      if (!isSearch && !isGenerate) {
        return new Response(JSON.stringify({ message: "Not found." }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Build upstream URL to steamtools.games
      const targetUrl = new URL("https://steamtools.games" + path);
      url.searchParams.forEach((val, key) => targetUrl.searchParams.set(key, val));

      let bodyData = null;
      if (request.method === "POST") {
        bodyData = await request.text();
      }

      try {
        const apiResponse = await fetch(targetUrl.toString(), {
          method: request.method,
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://steamtools.games/"
          },
          body: bodyData
        });

        const text = await apiResponse.text();
        
        return new Response(text, {
          status: apiResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ message: "Failed to connect to SteamTools API." }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // Serve static frontend assets if bound
    try {
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
    } catch (e) {}

    return new Response("Not Found", { status: 404 });
  }
};
