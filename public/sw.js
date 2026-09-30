// Plex Wrapped service worker: makes the app installable and shows a friendly page when offline.
// Nothing is cached, so reports and app updates always come straight from the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Offline</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
    background: #09090b; color: #fafafa; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  p { color: #8b8b96; margin: 0 0 24px; }
  button { background: #1ae6ce; color: #09090b; border: 0; border-radius: 10px; padding: 12px 24px; font-size: 1rem; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>You're offline</h1>
  <p>Connect to the internet to see your stats.</p>
  <button onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    )
  );
});
