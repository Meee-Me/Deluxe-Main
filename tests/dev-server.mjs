// A local stand-in for the Worker, for trying Deluxe Main in a browser without
// Cloudflare: node tests/dev-server.mjs [port]. Data is kept in memory only.
// DRIVE_URL=http://localhost:8787 points it at a local Deluxe Drive;
// ALLOW_LOCALHOST=1 lets localhost pages sign in.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MainCore } from '../worker/core.js';
import { NodeSql } from './fakes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.argv[2] || 8790);
const driveBase = process.env.DRIVE_URL || '';
const main = new MainCore(new NodeSql(), { ALLOW_LOCALHOST: process.env.ALLOW_LOCALHOST || '1', APP_KEY_MAIL: process.env.APP_KEY_MAIL || '' }, {
  drive: driveBase ? (p, init) => fetch(driveBase + p, init) : null,
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cors = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Deluxe-App, X-Deluxe-Account', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await main.handle(request);
    res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...cors });
    return res.end(Buffer.from(await response.arrayBuffer()));
  }
  let file = path.join(root, url.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Deluxe Main dev server on http://localhost:${port}`));
