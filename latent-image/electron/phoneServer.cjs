// Local-network HTTP server for the Android companion app.
// The phone pairs with a QR code containing { url, token }. Every request
// must carry the token; nothing is reachable from outside the LAN.
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = 47820;
const MAX_BODY = 120 * 1024 * 1024;

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  // private ranges first
  const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}

function loadToken(dir) {
  const f = path.join(dir, 'phone-token.txt');
  try {
    const t = fs.readFileSync(f, 'utf8').trim();
    if (/^[A-Z0-9]{8}$/.test(t)) return t;
  } catch {
    /* new token */
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = '';
  for (const b of crypto.randomBytes(8)) t += alphabet[b % alphabet.length];
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, t);
  } catch {
    /* keep in memory */
  }
  return t;
}

function startPhoneServer({ userDataDir, getWindow, ipcMain }) {
  const token = loadToken(userDataDir);
  let collection = null;
  let port = PORT;
  const pending = new Map();

  ipcMain.on('link-collection', (_e, json) => {
    collection = json;
  });
  ipcMain.on('phone-roll-done', (_e, { id, ok, message }) => {
    const p = pending.get(id);
    if (p) {
      pending.delete(id);
      p({ ok, message });
    }
  });
  ipcMain.handle('link-info', () => ({ token, port, addresses: lanAddresses(), url: `http://${lanAddresses()[0] || '127.0.0.1'}:${port}` }));

  const send = (res, code, obj) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, x-latent-token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url || '/', 'http://x');
    if (url.pathname === '/api/ping') return send(res, 200, { ok: true, app: 'Latent Image', v: 1 });
    if (req.headers['x-latent-token'] !== token) return send(res, 401, { ok: false, message: 'Wrong pairing code. Scan the QR code again.' });
    const win = getWindow();
    win?.webContents.send('phone-seen', { at: Date.now(), ip: req.socket.remoteAddress });
    if (req.method === 'GET' && url.pathname === '/api/collection') {
      if (!collection) return send(res, 503, { ok: false, message: 'Open Latent Image on the PC and load your career first.' });
      return send(res, 200, collection);
    }
    if (req.method === 'POST' && url.pathname === '/api/roll') {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          send(res, 413, { ok: false, message: 'Roll too large.' });
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        let roll;
        try {
          roll = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(res, 400, { ok: false, message: 'Bad roll data.' });
        }
        if (!roll || typeof roll.id !== 'string' || !Array.isArray(roll.shots)) return send(res, 400, { ok: false, message: 'Bad roll data.' });
        if (!win) return send(res, 503, { ok: false, message: 'The game window is closed.' });
        const timer = setTimeout(() => {
          if (pending.delete(roll.id)) send(res, 504, { ok: false, message: 'The PC took too long to unload the roll.' });
        }, 180000);
        pending.set(roll.id, (r) => {
          clearTimeout(timer);
          send(res, r.ok ? 200 : 409, r);
        });
        win.webContents.send('phone-roll', roll);
      });
      return;
    }
    send(res, 404, { ok: false, message: 'Not found' });
  });
  const listen = (p, tries) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE' && tries > 0) listen(p + 1, tries - 1);
      else console.error('phone server failed', e);
    });
    server.listen(p, '0.0.0.0', () => {
      port = p;
      console.log(`[phone] link server on port ${p}`);
    });
  };
  listen(PORT, 5);
  return server;
}

module.exports = { startPhoneServer };
