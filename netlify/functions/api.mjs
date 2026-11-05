// All dynamic routes: dashboard API, one-click decision links, health check.
import app from '../../lib/app.js';

export default async (request) => {
  const url = new URL(request.url);
  const rawBody = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
  const r = await app.handle({ method: request.method, path: url.pathname, headers: Object.fromEntries(request.headers), rawBody, origin: url.origin });
  return new Response(r.body, { status: r.code, headers: { 'Content-Type': r.type, 'Cache-Control': 'no-store', ...(r.headers || {}) } });
};

export const config = { path: ['/api/*', '/decide/*', '/healthz'] };
