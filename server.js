'use strict';
// Local / Docker entry point. (On Netlify the same logic runs via netlify/functions/*.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const scheduler = require('./lib/scheduler');
const { handle } = require('./lib/app');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/decide/') || p === '/healthz') {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 1e6) return res.destroy(); }
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const r = await handle({ method: req.method, path: p, headers: req.headers, rawBody: raw, origin: req.headers.host ? `${proto}://${req.headers.host}` : undefined });
    res.writeHead(r.code, { 'Content-Type': r.type, 'Cache-Control': 'no-store', ...(r.headers || {}) });
    return res.end(r.body);
  }
  // static (auth-protected too when ADMIN_PASSWORD is set)
  const pw = process.env.ADMIN_PASSWORD;
  if (pw) {
    const h = req.headers.authorization || '';
    const given = h.startsWith('Basic ') ? Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':') : null;
    if (given !== pw) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Step Tracker"' }); return res.end('Authentication required'); }
  }
  const full = path.normalize(path.join(PUBLIC, p === '/' ? '/index.html' : p));
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
});

if (require.main === module) {
  store.load().then(() => {
    server.listen(PORT, () => {
      console.log(`Step tracker running on http://localhost:${PORT}`);
      if (process.env.NODE_ENV === 'production') {
        if (!process.env.ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set — the dashboard is open to anyone with the URL.');
        if (!process.env.BASE_URL) console.warn('WARNING: BASE_URL is not set — decision links will use the address the dashboard was last opened from.');
      }
      scheduler.start();
    });
  });
}
module.exports = server;
