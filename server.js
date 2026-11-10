// Number Heroes (Matheria) Online Server: Accounts, SQLite Persistence, Cloud Saves, Leaderboards, 1-4 Player Real-Time Co-Op Boss Fights.
// Run:  npm start     (then open http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MatheriaDB = require('./db/database');

const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!(process.env.VERCEL || process.env.NOW_REGION);
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = process.env.DATA_DIR || (IS_VERCEL ? '/tmp/data' : BUNDLED_DATA_DIR);
const DB_FILE = path.join(DATA_DIR, 'matheria.db');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.txt');
const PUBLIC_DIR = path.join(__dirname, 'public');

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {}

// On Vercel, copy bundled seed files to writeable /tmp/data if not already present
if (IS_VERCEL) {
  try {
    const bundledUsers = path.join(BUNDLED_DATA_DIR, 'users.json');
    if (!fs.existsSync(USERS_FILE) && fs.existsSync(bundledUsers)) {
      fs.copyFileSync(bundledUsers, USERS_FILE);
    }
  } catch (e) {}
}

// Initialize SQLite Database
const db = new MatheriaDB(DB_FILE);

// Auto-migrate from users.json if database is newly initialized
if (fs.existsSync(USERS_FILE)) {
  try {
    db.migrateFromJson(USERS_FILE);
  } catch (err) {
    console.error('Migration warning:', err.message);
  }
}

// Secret for HMAC tokens
let SECRET = process.env.SECRET;
if (!SECRET) {
  try {
    SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
  } catch (e) {
    SECRET = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(SECRET_FILE, SECRET); } catch (err) {}
  }
}

// ---------- auth helpers ----------
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
function hashPw(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

function makeToken(name) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const body = name + '.' + exp;
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return body + '.' + sig;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [name, exp, sig] = parts;
  const good = crypto.createHmac('sha256', SECRET).update(name + '.' + exp).digest('hex');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Date.now() > Number(exp)) return null;
  return db.getUser(name.toLowerCase());
}

// ---------- HTTP helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

function readBody(req, limit = 200000) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) {}
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function getClientIp(req) {
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

// ---------- online status tracker ----------
const lastSeen = new Map();
const socketsOpen = new Map();
const ONLINE_MS = Number(process.env.ONLINE_MS) || 45000;

function touch(u) {
  if (u && u.username) {
    const key = u.username.toLowerCase();
    lastSeen.set(key, Date.now());
    db.touchUser(key);
  }
  return u;
}

function isOnline(key) {
  if (!key) return false;
  const k = key.toLowerCase();
  if ((socketsOpen.get(k) || 0) > 0) return true;
  return Date.now() - (lastSeen.get(k) || 0) < ONLINE_MS;
}

function authUser(req) {
  const h = req.headers['authorization'] || '';
  return touch(verifyToken(h.replace(/^Bearer\s+/i, '')));
}

// Rate limiting
const hits = new Map();
function limited(ip, max = 30) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

// ---------- HTTP Request Handler ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  // CORS for local testing and decoupled frontend deployment (e.g. Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // ---------- AUTH: REGISTER ----------
    if (url.pathname === '/api/register' && req.method === 'POST') {
      if (limited(getClientIp(req))) return send(res, 429, { error: 'Too many attempts, please wait a minute.' });
      const { username, password } = await readBody(req);
      if (!NAME_RE.test(username || '')) return send(res, 400, { error: 'Name must be 3-16 letters, numbers, or _' });
      if (typeof password !== 'string' || password.length < 4) return send(res, 400, { error: 'Password must be at least 4 characters' });

      const key = username.toLowerCase();
      if (db.getUser(key)) return send(res, 409, { error: 'That name is already taken' });

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPw(password, salt);
      const user = db.createUser({
        username: key,
        name: username,
        salt,
        hash,
        save: null,
        gold: 0,
        level: 1,
        rebirths: 0,
        plusUntil: 0
      });

      return send(res, 200, { token: makeToken(key), username: user.name, save: null });
    }

    // ---------- AUTH: LOGIN ----------
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (limited(getClientIp(req))) return send(res, 429, { error: 'Too many attempts, please wait a minute.' });
      const { username, password } = await readBody(req);
      const u = db.getUser(String(username || '').toLowerCase());
      if (!u || typeof password !== 'string') return send(res, 401, { error: 'Wrong name or password' });

      const a = Buffer.from(hashPw(password, u.salt)), b = Buffer.from(u.hash);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, { error: 'Wrong name or password' });

      touch(u);
      return send(res, 200, { token: makeToken(u.username), username: u.name, save: u.save });
    }

    // ---------- CLOUD SAVE ----------
    if (url.pathname === '/api/save') {
      const u = authUser(req);
      if (!u) return send(res, 401, { error: 'Please log in again' });

      if (req.method === 'GET') return send(res, 200, { save: u.save });

      if (req.method === 'PUT') {
        const { save } = await readBody(req);
        if (!save || typeof save !== 'object') return send(res, 400, { error: 'Bad save format' });

        const gold = Math.max(0, Math.floor(Number(save.coins) || 0));
        const level = Math.max(1, Math.floor(Number(save.level) || 1));
        const rebirths = Math.max(0, Math.floor(Number(save.resetCount) || 0));
        const plusUntil = Math.max(0, Math.floor(Number(save.plusUntil) || 0));

        db.updateSave(u.username, {
          save,
          gold,
          level,
          rebirths,
          plusUntil,
          updated: Date.now()
        });
        return send(res, 200, { ok: true });
      }
    }

    // ---------- PUBLIC PLAYER PROFILE ----------
    if (url.pathname.startsWith('/api/player/') && req.method === 'GET') {
      let nm = '';
      try { nm = decodeURIComponent(url.pathname.slice('/api/player/'.length)); } catch (e) {}
      const p = db.getUser(nm.toLowerCase());
      if (!p) return send(res, 404, { error: 'Player not found' });

      const sv = p.save || {};
      const n = v => Math.max(0, Math.floor(Number(v) || 0));
      const friendsData = db.getFriendsData(p.username);

      return send(res, 200, {
        name: p.name,
        avatar: p.avatar || null,
        joined: p.joined || null,
        lastSeen: p.updated || null,
        grade: n(sv.grade),
        hero: typeof sv.hero === 'string' ? sv.hero : 'Addy',
        weapon: typeof sv.equippedWeapon === 'string' ? sv.equippedWeapon : null,
        level: p.level || 1,
        gold: p.gold || 0,
        rebirths: p.rebirths || 0,
        hpLevel: n(sv.hpLevel),
        dmgLevel: n(sv.dmgLevel),
        monsterWins: n(sv.monsterWins),
        bossWins: n(sv.bossWins),
        correctCount: n(sv.correctCount),
        wrongCount: n(sv.wrongCount),
        friends: (friendsData.friends || []).length,
        plus: (p.plusUntil || 0) > Date.now(),
        online: isOnline(nm.toLowerCase()),
        avatarGif: (p.plusUntil || 0) > Date.now() ? (p.avatarGif || null) : null,
        banner: {
          color: (p.banner && p.banner.color) || '#3a3a8a',
          img: (p.plusUntil || 0) > Date.now() ? ((p.banner && p.banner.img) || null) : null
        }
      });
    }

    // ---------- PROFILE MEDIA: GIF / BANNER (Matheria Plus) ----------
    if (url.pathname === '/api/profile-media' && req.method === 'PUT') {
      const u = authUser(req);
      if (!u) return send(res, 401, { error: 'Please log in again' });

      const { avatarGif, banner } = await readBody(req, 2000000);
      const plus = (u.plusUntil || 0) > Date.now();
      let cleanAvatarGif = null;

      if (avatarGif !== null && avatarGif !== undefined) {
        if (!plus) return send(res, 403, { error: 'Matheria PLUS is required for GIF profile pictures' });
        if (typeof avatarGif !== 'string' || avatarGif.length > 650000 || !/^data:image\/gif;base64,[A-Za-z0-9+/=]+$/.test(avatarGif)) {
          return send(res, 400, { error: 'Bad GIF format' });
        }
        cleanAvatarGif = avatarGif;
      }

      let bannerColor = '#3a3a8a';
      let bannerImg = null;
      if (banner && typeof banner === 'object') {
        if (/^#[0-9a-fA-F]{6}$/.test(banner.color || '')) bannerColor = banner.color;
        if (banner.img) {
          if (!plus) return send(res, 403, { error: 'Matheria PLUS is required for banner images' });
          if (typeof banner.img !== 'string' || banner.img.length > 1000000 || !/^data:image\/(gif|jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(banner.img)) {
            return send(res, 400, { error: 'Bad banner image format' });
          }
          bannerImg = banner.img;
        }
      }

      db.updateProfileMedia(u.username, {
        avatarGif: cleanAvatarGif,
        bannerColor,
        bannerImg
      });
      return send(res, 200, { ok: true });
    }

    // ---------- PROFILE AVATAR (Standard JPG) ----------
    if (url.pathname === '/api/avatar' && req.method === 'PUT') {
      const u = authUser(req);
      if (!u) return send(res, 401, { error: 'Please log in again' });

      const { avatar } = await readBody(req);
      if (avatar === null) {
        db.updateAvatar(u.username, null);
        return send(res, 200, { ok: true });
      }
      if (typeof avatar !== 'string' || avatar.length > 40000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(avatar)) {
        return send(res, 400, { error: 'Bad image format, please upload standard JPEG under 40KB' });
      }

      db.updateAvatar(u.username, avatar);
      return send(res, 200, { ok: true });
    }

    // ---------- HEARTBEAT ----------
    if (url.pathname === '/api/ping' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return send(res, 401, { error: 'Please log in again' });
      return send(res, 200, { ok: true, serverTime: Date.now() });
    }

    // ---------- MESSAGING ----------
    if (url.pathname.startsWith('/api/messages')) {
      const me = authUser(req);
      if (!me) return send(res, 401, { error: 'Please log in again' });

      if (url.pathname === '/api/messages/unread' && req.method === 'GET') {
        return send(res, 200, { count: db.getTotalUnread(me.username) });
      }

      if (url.pathname === '/api/messages' && req.method === 'GET') {
        const summary = db.getConversationsSummary(me.username, isOnline);
        return send(res, 200, summary);
      }

      if (url.pathname.startsWith('/api/messages/with/') && req.method === 'GET') {
        let nm = '';
        try { nm = decodeURIComponent(url.pathname.slice('/api/messages/with/'.length)); } catch (e) {}
        const other = db.getUser(nm.toLowerCase());
        if (!other) return send(res, 404, { error: 'Player not found' });

        const messages = db.getConversationWith(me.username, other.username, 100);
        return send(res, 200, {
          name: other.name,
          online: isOnline(other.username),
          avatar: other.avatar || null,
          plus: (other.plusUntil || 0) > Date.now(),
          friend: db.areFriends(me.username, other.username),
          messages
        });
      }

      if (url.pathname === '/api/messages/send' && req.method === 'POST') {
        if (limited('msg:' + me.username, 30)) return send(res, 429, { error: 'Slow down a little!' });
        const { to, text } = await readBody(req);
        const other = db.getUser(String(to || '').toLowerCase());
        if (!other) return send(res, 404, { error: 'Player not found' });
        if (!db.areFriends(me.username, other.username)) return send(res, 403, { error: 'You can only message your friends' });

        const clean = String(text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 300);
        if (!clean) return send(res, 400, { error: 'Type a message first' });

        const t = db.sendMessage(me.username, other.username, clean);
        return send(res, 200, { ok: true, t });
      }

      return send(res, 404, { error: 'Not found' });
    }

    // ---------- FRIENDS ----------
    if (url.pathname.startsWith('/api/friends')) {
      const me = authUser(req);
      if (!me) return send(res, 401, { error: 'Please log in again' });

      if (url.pathname === '/api/friends' && req.method === 'GET') {
        const data = db.getFriendsData(me.username, isOnline);
        return send(res, 200, data);
      }

      if (req.method === 'POST') {
        const { name } = await readBody(req);
        const key = String(name || '').trim().toLowerCase();
        const other = db.getUser(key);
        const action = url.pathname.slice('/api/friends/'.length);

        if (action === 'request') {
          if (!key) return send(res, 400, { error: 'Type a player name' });
          if (key === me.username.toLowerCase()) return send(res, 400, { error: 'You cannot add yourself' });
          if (!other) return send(res, 404, { error: 'No player with that exact name' });
          if (db.areFriends(me.username, key)) return send(res, 409, { error: other.name + ' is already your friend' });

          const result = db.sendFriendRequest(me.username, key);
          if (result.accepted) {
            return send(res, 200, { ok: true, message: 'You and ' + other.name + ' are now friends!' });
          }
          return send(res, 200, { ok: true, message: 'Friend request sent to ' + other.name });
        }

        if (!other) return send(res, 404, { error: 'Player not found' });

        if (action === 'accept') {
          const ok = db.acceptFriendRequest(me.username, key);
          if (!ok) return send(res, 400, { error: 'No request from that player' });
          return send(res, 200, { ok: true, message: 'You are now friends with ' + other.name });
        }
        if (action === 'decline') {
          db.declineFriendRequest(me.username, key);
          return send(res, 200, { ok: true, message: 'Request declined' });
        }
        if (action === 'cancel') {
          db.cancelFriendRequest(me.username, key);
          return send(res, 200, { ok: true, message: 'Request cancelled' });
        }
        if (action === 'remove') {
          db.removeFriend(me.username, key);
          return send(res, 200, { ok: true, message: 'Friend removed' });
        }
      }

      return send(res, 404, { error: 'Not found' });
    }

    // ---------- LEADERBOARD ----------
    if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
      const rows = db.getLeaderboard(50).map(r => ({
        ...r,
        online: isOnline(r.name.toLowerCase())
      }));
      return send(res, 200, { rows });
    }

    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'API route not found' });

    // ---------- STATIC FILES (PUBLIC) ----------
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = path.normalize(path.join(PUBLIC_DIR, file));
    if (!full.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(full, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
        'Cache-Control': full.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'
      });
      res.end(buf);
    });
  } catch (e) {
    console.error('Server error:', e);
    send(res, 500, { error: e.message || 'Internal server error' });
  }
});

// ---------- REAL-TIME CO-OP MULTIPLAYER (WebSockets) ----------
// Supports 1-4 players per room, synchronized boss health, cooperative attacks, timing bars, and live pearl dodge QTE.
const rooms = new Map();
const MAX_PLAYERS = 4;
const HEROES = ['Addy', 'Subtra', 'Max', 'Divina', 'Lastly'];
const BOSS_HP_PER_PLAYER = { Easy: 60000, Normal: 150000, Hard: 600000 };
const WIN_GOLD = { Easy: 2000, Normal: 5000, Hard: 15000 };
const Q_SECONDS = { Easy: 30, Normal: 20, Hard: 10 };
const EQUIP = {
  weapons: {
    SWORD: 30, HORNET_STAFF: 60, MASTER_SWORD: 90, FROST_STAFF: 120, STARDUST_STAFF: 150,
    VOID_SWORD: 180, PIRATE_STAFF: 200, BONE_BREAKER: 200, CRYSTAL_STAFF: 220, KAIDO_WHIP: 250,
    TERRAPRISMA: 700, POTION: 20, POTION_ONE: 30, SKELETON_STAFF: 400, SOUL_SCYTHE: 1500,
    LEAD_BROADSWORD: 190, TERRARIAN_SABER: 6700, TERRARIAN_SPEAR: 10, BRAND_OF_INFERNO: 450,
    CRYSTAL: 0, STARDUST: 0, VOLCANO: 67000, DEVOUR_PRIDE: 9000000
  },
  heroes: { Addy: 20, Subtra: 35, Max: 60, Divina: 100, Lastly: 400 },
  pets: {
    WYVERN_PUP: 13000, LYRIST: 23000, BEET_COOKIE: 8000, AMNESIAC: 4000, LIL_MAID: 19000,
    EXOTIC_MYNA: 2000, TORTLE_SAGE: 1000, TANUKI_GIRL: 500, MINI_PRIMORDIALS: 90000,
    CLOTH_GEIST: 50000, LIFE_SPIRIT: 0
  }
};
const EQ_NAME = /^[A-Z_]{1,30}$/;
const cleanEq = v => (typeof v === 'string' && EQ_NAME.test(v)) ? v : null;

const PEARL_EVERY_MS = Number(process.env.PEARL_EVERY_MS) || 9000;
const PEARL_COUNTDOWN_MS = 3000;
const PEARL_GRACE_MS = 1000;
const CLICK_SLACK_MS = 400;
const PEARL_DMG_PCT = 0.15;
const WRONG_DMG_PCT = 0.08;
const ATTACK_WAIT_MS = 6000;

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(c));
  return c;
}

// Math question generator (Grades 1-9)
function genQuestion(grade, mode, force) {
  grade = Math.min(9, Math.max(1, Math.floor(Number(grade)) || 3));
  const SC = ({ Easy: 0.6, Normal: 1, Hard: 1.6 })[mode] || 1;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const sc = n => Math.max(3, Math.round(n * SC));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const f = n => (n < 0 ? '(' + n + ')' : '' + n);

  const T = {
    add(max) { const a = rnd(1, sc(max)), b = rnd(1, sc(max)); return { text: `${a} + ${b} = ?`, answer: a + b, explain: `Add: ${a} + ${b} = ${a + b}.` }; },
    sub(max) { const a = rnd(2, sc(max)), b = rnd(1, a - 1); return { text: `${a} - ${b} = ?`, answer: a - b, explain: `Subtract: ${a} - ${b} = ${a - b}.` }; },
    missing(max) { const a = rnd(1, sc(max)), b = rnd(1, sc(max)); return { text: `${a} + ? = ${a + b}`, answer: b, explain: `${a + b} - ${a} = ${b}.` }; },
    mul(ma, mb) { const a = rnd(2, sc(ma)), b = rnd(2, sc(mb)); return { text: `${a} × ${b} = ?`, answer: a * b, explain: `${a} × ${b} = ${a * b}.` }; },
    mul2() { const a = rnd(11, 11 + sc(30)), b = rnd(2, 9), t = Math.floor(a / 10) * 10, o = a % 10;
      return { text: `${a} × ${b} = ?`, answer: a * b, explain: `(${t} × ${b}) + (${o} × ${b}) = ${a * b}.` }; },
    div(mq, md) { const d = rnd(2, Math.max(3, sc(md))), q = rnd(1, sc(mq)), n = d * q; return { text: `${n} ÷ ${d} = ?`, answer: q, explain: `${d} × ${q} = ${n}, so ${n} ÷ ${d} = ${q}.` }; },
    sqrt(mr) { const r = rnd(2, sc(mr)); return { text: `√${r * r} = ?`, answer: r, explain: `√${r * r} = ${r}.` }; },
    xsq() { const r = rnd(2, sc(12)); return { text: `x² = ${r * r}, x = ? (positive)`, answer: r, explain: `x = ${r}.` }; },
    pow() { const a = rnd(2, 5), e = (a === 2 && SC > 1) ? rnd(2, 5) : rnd(2, 3), ans = Math.pow(a, e);
      return { text: `${a}^${e} = ?`, answer: ans, explain: `${a}^${e} = ${ans}.` }; },
    eq1() { const k = rnd(0, 3);
      if (k === 0) { const x = rnd(1, sc(15)), a = rnd(1, sc(15)); return { text: `x + ${a} = ${x + a}, x = ?`, answer: x, explain: `x = ${x + a} - ${a} = ${x}.` }; }
      if (k === 1) { const r = rnd(1, sc(15)), a = rnd(1, sc(15)); return { text: `x - ${a} = ${r}, x = ?`, answer: r + a, explain: `x = ${r} + ${a} = ${r + a}.` }; }
      if (k === 2) { const c = rnd(2, sc(9)), x = rnd(1, sc(12)); return { text: `${c}x = ${c * x}, x = ?`, answer: x, explain: `x = ${c * x} ÷ ${c} = ${x}.` }; }
      const d = rnd(2, sc(6)), r = rnd(1, sc(12)); return { text: `x ÷ ${d} = ${r}, x = ?`, answer: d * r, explain: `x = ${r} × ${d} = ${d * r}.` }; },
    eq2() { const c = rnd(2, sc(9)), x = rnd(1, sc(12)), b = rnd(1, sc(20));
      if (Math.random() < 0.5) return { text: `${c}x + ${b} = ${c * x + b}, x = ?`, answer: x, explain: `${c}x = ${c * x}, x = ${x}.` };
      return { text: `${c}x - ${b} = ${c * x - b}, x = ?`, answer: x, explain: `${c}x = ${c * x}, x = ${x}.` }; },
    eqNeg() { const c = rnd(2, sc(9)), x = rnd(1, sc(12)), b = rnd(1, sc(20)), r = -c * x + b;
      return { text: `-${c}x + ${b} = ${r}, x = ?`, answer: x, explain: `-${c}x = ${r - b}, x = ${x}.` }; },
    eqBoth() { const c = rnd(1, sc(6)), a = c + rnd(1, 4), x = rnd(1, sc(12)), b = rnd(1, sc(15)), d = b + (a - c) * x;
      return { text: `${a}x + ${b} = ${c}x + ${d}, x = ?`, answer: x, explain: `${a - c}x = ${d - b}, x = ${x}.` }; },
    eqBracket() { const k = rnd(2, sc(8)), x = rnd(1, sc(12)), b = rnd(1, sc(10));
      return { text: `${k}(x + ${b}) = ${k * (x + b)}, x = ?`, answer: x, explain: `x + ${b} = ${x + b}, x = ${x}.` }; },
    order(brackets) { const a = rnd(2, sc(10)), b = rnd(2, sc(9)), c = rnd(2, sc(9)), k = rnd(0, brackets ? 2 : 1);
      if (k === 0) return { text: `${a} + ${b} × ${c} = ?`, answer: a + b * c, explain: `Multiply first: ${b} × ${c} = ${b * c}. Result = ${a + b * c}.` };
      if (k === 1) { const e = rnd(1, a * b - 1); return { text: `${a} × ${b} - ${e} = ?`, answer: a * b - e, explain: `Multiply first: ${a} × ${b} = ${a * b}. Result = ${a * b - e}.` }; }
      return { text: `(${a} + ${b}) × ${c} = ?`, answer: (a + b) * c, explain: `Brackets first: (${a + b}) × ${c} = ${(a + b) * c}.` }; },
    fracSame() { const d = rnd(4, Math.max(5, sc(10))), a = rnd(1, d - 2), sub = Math.random() < 0.4;
      if (sub) { const b = rnd(1, a); return { text: `${a}/${d} - ${b}/${d} = ?/${d}`, answer: a - b, explain: `Subtract tops: ${a} - ${b} = ${a - b}.` }; }
      const b = rnd(1, d - a); return { text: `${a}/${d} + ${b}/${d} = ?/${d}`, answer: a + b, explain: `Add tops: ${a} + ${b} = ${a + b}.` }; },
    fracDiff() { const d1 = pick([2, 3, 4, 5]), k = pick([2, 3]), D = d1 * k, a = rnd(1, d1 - 1), b = rnd(1, D - 1), ans = a * k + b;
      return { text: `${a}/${d1} + ${b}/${D} = ?/${D}`, answer: ans, explain: `Equal denominators: ${ans}/${D}.` }; },
    percent() { const p = pick([10, 20, 25, 50]), unit = ({ 10: 10, 20: 5, 25: 4, 50: 2 })[p], n = unit * rnd(1, sc(25)), ans = n * p / 100;
      return { text: `${p}% of ${n} = ?`, answer: ans, explain: `${n} × ${p} ÷ 100 = ${ans}.` }; },
    neg() { const k = rnd(0, 2);
      if (k === 2) { const a = rnd(-9, 9) || 4, b = rnd(-9, 9) || -3; return { text: `${f(a)} × ${f(b)} = ?`, answer: a * b, explain: `Result: ${a * b}.` }; }
      const a = rnd(-sc(15), sc(15)), b = (rnd(1, sc(15))) * (Math.random() < 0.5 ? -1 : 1);
      if (k === 0) return { text: `${f(a)} + ${f(b)} = ?`, answer: a + b, explain: `Result: ${a + b}.` };
      return { text: `${f(a)} - ${f(b)} = ?`, answer: a - b, explain: `Result: ${a - b}.` }; }
  };

  if (force === 'div') return grade <= 2 ? T.div(5, 5) : grade <= 3 ? T.div(10, 9) : grade <= 5 ? T.div(12, 10) : T.div(15, 12);

  const pools = {
    1: [() => T.add(10), () => T.sub(10), () => T.missing(10)],
    2: [() => T.add(50), () => T.sub(50), () => T.missing(20), () => T.mul(5, 5)],
    3: [() => T.add(200), () => T.sub(200), () => T.mul(10, 10), () => T.div(10, 9), () => T.missing(50)],
    4: [() => T.add(1000), () => T.sub(1000), () => T.mul2(), () => T.mul(12, 12), () => T.div(12, 10), () => T.fracSame()],
    5: [() => T.add(5000), () => T.sub(5000), () => T.mul(12, 15), () => T.div(15, 12), () => T.order(false), () => T.eq1(), () => T.fracSame()],
    6: [() => T.order(true), () => T.eq1(), () => T.sqrt(10), () => T.fracDiff(), () => T.percent(), () => T.mul(15, 15)],
    7: [() => T.neg(), () => T.eq2(), () => T.percent(), () => T.pow(), () => T.order(true), () => T.sqrt(15)],
    8: [() => T.eq2(), () => T.eqBoth(), () => T.sqrt(20), () => T.pow(), () => T.neg(), () => T.percent()],
    9: [() => T.eqBoth(), () => T.eqBracket(), () => T.eqNeg(), () => T.xsq(), () => T.sqrt(25), () => T.pow(), () => T.neg()]
  };

  return pick(pools[grade])();
}

function makeQuestion(difficulty, grade, hero) {
  const q = genQuestion(grade, difficulty, hero === 'Divina' ? 'div' : null);
  return { text: q.text, answer: q.answer, explain: q.explain };
}

const ROLES = ['front', 'back', 'mid', 'support'];

function roomState(room) {
  return {
    type: 'state',
    code: room.code,
    status: room.status,
    difficulty: room.difficulty,
    host: room.host,
    boss: { hp: room.bossHp, max: room.bossMax },
    players: room.players.map((p, i) => ({
      name: p.name,
      hero: p.hero,
      role: ROLES[i] || 'support',
      weapon: p.weapon,
      pet: p.pet,
      pet2: p.pet2,
      plus: p.plus,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.hp > 0,
      damage: p.damageDone
    }))
  };
}

function broadcast(room, msg) {
  const s = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  });
}

function pushState(room) {
  broadcast(room, roomState(room));
}

function sendTo(p, msg) {
  if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}

function newQuestion(room, p) {
  const secs = Q_SECONDS[room.difficulty] || 20;
  p.q = makeQuestion(room.difficulty, p.grade, p.hero);
  p.awaiting = false;
  p.qDeadline = Date.now() + secs * 1000;
  sendTo(p, { type: 'question', text: p.q.text, seconds: secs });
}

function hurt(p, pct) {
  const dmg = Math.max(3, Math.floor(p.maxHp * pct));
  p.hp = Math.max(0, p.hp - dmg);
  // Life Spirit pet second chance
  if (p.hp <= 0 && p.spirit && !p.spiritUsed && p.room) {
    p.spiritUsed = true;
    p.hp = Math.max(1, Math.floor(p.maxHp / 2));
    broadcast(p.room, { type: 'log', text: `${p.name}'s Life Spirit saved them! Revived with half HP.` });
  }
  return dmg;
}

function allDown(room) {
  return !room.players.some(p => p.hp > 0);
}

function endFight(room, won) {
  room.status = won ? 'won' : 'lost';
  clearInterval(room.timer);
  room.pearl = null;
  const gold = won ? WIN_GOLD[room.difficulty] || 0 : 0;
  broadcast(room, { type: 'end', won, gold });
  pushState(room);
}

function doAttack(room, p, mult) {
  const dmg = Math.floor(p.power * mult);
  room.bossHp = Math.max(0, room.bossHp - dmg);
  p.damageDone += dmg;
  p.awaiting = false;
  broadcast(room, { type: 'hit', name: p.name, dmg, mult });
  broadcast(room, { type: 'log', text: `${p.name} attacked for ${dmg.toLocaleString()} damage!` });
  if (room.bossHp <= 0) return endFight(room, true);
  if (p.hp > 0) newQuestion(room, p);
  pushState(room);
}

function tick(room) {
  if (room.status !== 'fighting') return;
  const now = Date.now();

  for (const p of room.players) {
    if (p.hp <= 0) continue;
    if (p.awaiting) {
      if (now > p.attackDeadline) {
        doAttack(room, p, 0.5);
        if (room.status !== 'fighting') return;
      }
    } else if (p.q && now > p.qDeadline) {
      const dmg = hurt(p, WRONG_DMG_PCT);
      sendTo(p, { type: 'timeout', answer: p.q.answer, explain: p.q.explain });
      broadcast(room, { type: 'log', text: `${p.name} ran out of time (-${dmg} HP).` });
      if (allDown(room)) return endFight(room, false);
      if (p.hp > 0) newQuestion(room, p);
      pushState(room);
    }
  }

  // Boss throws pearl QTE
  if (now >= room.nextPearl) {
    room.pearlId++;
    room.pearl = { id: room.pearlId, deadline: now + PEARL_COUNTDOWN_MS + PEARL_GRACE_MS, clicked: new Set() };
    room.nextPearl = now + PEARL_EVERY_MS;
    broadcast(room, { type: 'pearl', id: room.pearl.id, countdown: PEARL_COUNTDOWN_MS, grace: PEARL_GRACE_MS });
  }

  // Check who successfully dodged
  if (room.pearl && now >= room.pearl.deadline + CLICK_SLACK_MS) {
    const results = {};
    for (const p of room.players) {
      if (p.hp <= 0) continue;
      const ok = room.pearl.clicked.has(p.name);
      results[p.name] = ok;
      if (!ok) {
        const dmg = hurt(p, PEARL_DMG_PCT);
        broadcast(room, { type: 'log', text: `${p.name} failed to dodge the pearl (-${dmg} HP)!` });
      }
    }
    const id = room.pearl.id;
    room.pearl = null;
    broadcast(room, { type: 'pearlResult', id, results });
    if (allDown(room)) return endFight(room, false);
    pushState(room);
  }
}

function startFight(room) {
  room.status = 'fighting';
  room.bossMax = (BOSS_HP_PER_PLAYER[room.difficulty] || 150000) * room.players.length;
  room.bossHp = room.bossMax;
  room.pearl = null;
  room.pearlId = 0;
  room.nextPearl = Date.now() + PEARL_EVERY_MS;
  room.players.forEach(p => {
    p.hp = p.maxHp;
    p.damageDone = 0;
    p.spiritUsed = false;
    newQuestion(room, p);
  });
  pushState(room);
  clearInterval(room.timer);
  room.timer = setInterval(() => tick(room), 200);
}

function removePlayer(room, ws) {
  const i = room.players.findIndex(p => p.ws === ws);
  if (i === -1) return;
  const [p] = room.players.splice(i, 1);
  if (!room.players.length) {
    clearInterval(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.host === p.name) room.host = room.players[0].name;
  broadcast(room, { type: 'log', text: `${p.name} left the room.` });
  if (room.status === 'fighting' && allDown(room)) return endFight(room, false);
  pushState(room);
}

function joinRoom(room, ws, m) {
  const hero = HEROES.includes(m.hero) ? m.hero : 'Addy';
  const weapon = cleanEq(m.weapon) && EQUIP.weapons[m.weapon] !== undefined ? m.weapon : null;
  const pet = cleanEq(m.pet) && EQUIP.pets[m.pet] !== undefined ? m.pet : null;
  const pet2 = cleanEq(m.pet2) && EQUIP.pets[m.pet2] !== undefined ? m.pet2 : null;
  const dmgLevel = Math.min(1000, Math.max(0, Math.floor(Number(m.dmgLevel)) || 0));
  const hpLevel = Math.min(1000, Math.max(0, Math.floor(Number(m.hpLevel)) || 0));
  const plus = !!m.plus;
  const mult = plus ? 5 : 1;

  // Maximum calculated ceiling (client anti-cheat validation)
  const ceiling = ((EQUIP.heroes[hero] || 10) + dmgLevel * 5 + (weapon ? EQUIP.weapons[weapon] : 0) + (pet ? EQUIP.pets[pet] : 0)) * mult;
  const power = Math.min(ceiling, Math.max(1, Math.floor(Number(m.power) || 10)));
  const maxHp = Math.min((100 + hpLevel * 20) * mult, Math.max(50, Math.floor(Number(m.maxHp) || 100)));
  const grade = Math.min(9, Math.max(1, Math.floor(Number(m.grade)) || 3));

  const p = {
    ws,
    name: ws.user.name,
    hero,
    grade,
    weapon,
    pet,
    pet2,
    plus,
    spirit: pet === 'LIFE_SPIRIT' || pet2 === 'LIFE_SPIRIT',
    spiritUsed: false,
    room,
    hp: maxHp,
    maxHp,
    power,
    damageDone: 0,
    q: null,
    awaiting: false
  };

  room.players.push(p);
  ws.room = room;
  broadcast(room, { type: 'log', text: `${ws.user.name} joined the room.` });
  pushState(room);
}

// ---- Lightweight RFC 6455 WebSocket Implementation with Ping/Pong Heartbeat ----
class MiniWS {
  constructor(socket) {
    this.socket = socket;
    this.readyState = 1; // 1 = OPEN
    this.handlers = {};
    this.buf = Buffer.alloc(0);
    this.lastPing = Date.now();

    socket.on('data', d => this._data(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }

  on(ev, fn) { this.handlers[ev] = fn; }

  _closed() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    if (this.handlers.close) this.handlers.close();
  }

  _frame(opcode, payload) {
    const len = payload.length;
    const head = len < 126
      ? Buffer.from([0x80 | opcode, len])
      : Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]);
    return Buffer.concat([head, payload]);
  }

  send(text) {
    if (this.readyState === 1) {
      try {
        this.socket.write(this._frame(1, Buffer.from(text)));
      } catch (e) {}
    }
  }

  ping() {
    if (this.readyState === 1) {
      try {
        this.socket.write(this._frame(9, Buffer.alloc(0)));
      } catch (e) {}
    }
  }

  close() {
    if (this.readyState !== 1) return;
    this.readyState = 2;
    try {
      this.socket.write(this._frame(8, Buffer.alloc(0)));
    } catch (e) {}
    this.socket.end();
  }

  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > 16384) return this.socket.destroy();

    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const opcode = b0 & 15, masked = !!(b1 & 128);
      let len = b1 & 127, off = 2;

      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        return this.socket.destroy();
      }

      if (!masked || len > 4096 || !(b0 & 128)) return this.socket.destroy();
      if (this.buf.length < off + 4 + len) return;

      const mask = this.buf.slice(off, off + 4);
      const payload = Buffer.from(this.buf.slice(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.slice(off + 4 + len);

      if (opcode === 1) {
        // Text frame
        if (this.handlers.message) this.handlers.message(payload.toString('utf8'));
      } else if (opcode === 8) {
        // Close frame
        this.close();
        return;
      } else if (opcode === 9) {
        // Ping frame -> respond with Pong (opcode 10)
        try { this.socket.write(this._frame(10, payload)); } catch (e) {}
      } else if (opcode === 10) {
        // Pong frame
        this.lastPing = Date.now();
      }
    }
  }
}

const wss = {
  handlers: {},
  on(ev, fn) { this.handlers[ev] = fn; }
};

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  wss.handlers.connection(new MiniWS(socket), req);
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const u = verifyToken(url.searchParams.get('token'));
  if (!u) {
    ws.send(JSON.stringify({ type: 'error', text: 'Please log in first.' }));
    return ws.close();
  }

  ws.user = u;
  ws.room = null;
  const ukey = u.username.toLowerCase();
  socketsOpen.set(ukey, (socketsOpen.get(ukey) || 0) + 1);

  // Heartbeat ping interval
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
    else clearInterval(pingInterval);
  }, 25000);

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const room = ws.room;

    if (m.type === 'create' && !room) {
      const diff = ['Easy', 'Normal', 'Hard'].includes(m.difficulty) ? m.difficulty : 'Normal';
      const r = {
        code: makeCode(),
        status: 'lobby',
        difficulty: diff,
        host: u.name,
        players: [],
        bossHp: 0,
        bossMax: 0,
        timer: null,
        pearl: null,
        pearlId: 0,
        nextPearl: 0
      };
      rooms.set(r.code, r);
      joinRoom(r, ws, m);
    } else if (m.type === 'join' && !room) {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return ws.send(JSON.stringify({ type: 'error', text: 'Room not found.' }));
      if (r.status !== 'lobby') return ws.send(JSON.stringify({ type: 'error', text: 'That fight has already started.' }));
      if (r.players.length >= MAX_PLAYERS) return ws.send(JSON.stringify({ type: 'error', text: `Room is full (${MAX_PLAYERS} players max).` }));
      if (r.players.some(p => p.name === u.name)) return ws.send(JSON.stringify({ type: 'error', text: 'You are already in that room.' }));
      joinRoom(r, ws, m);
    } else if (m.type === 'start' && room && room.status === 'lobby' && room.host === u.name) {
      startFight(room);
    } else if (m.type === 'answer' && room && room.status === 'fighting') {
      const p = room.players.find(x => x.ws === ws);
      if (!p || p.hp <= 0 || !p.q || p.awaiting) return;
      if (Number(m.value) === p.q.answer) {
        p.awaiting = true;
        p.attackDeadline = Date.now() + ATTACK_WAIT_MS;
        sendTo(p, { type: 'correct' });
      } else {
        const dmg = hurt(p, WRONG_DMG_PCT);
        sendTo(p, { type: 'wrong', answer: p.q.answer, explain: p.q.explain });
        broadcast(room, { type: 'log', text: `${p.name} answered incorrectly (-${dmg} HP).` });
        if (allDown(room)) return endFight(room, false);
        if (p.hp > 0) newQuestion(room, p);
        pushState(room);
      }
    } else if (m.type === 'attack' && room && room.status === 'fighting') {
      const p = room.players.find(x => x.ws === ws);
      if (!p || p.hp <= 0 || !p.awaiting) return;
      const mult = [0.5, 1, 2].includes(Number(m.mult)) ? Number(m.mult) : 1;
      doAttack(room, p, mult);
    } else if (m.type === 'pearlClick' && room && room.status === 'fighting' && room.pearl) {
      const p = room.players.find(x => x.ws === ws);
      if (!p || p.hp <= 0) return;
      if (Number(m.id) === room.pearl.id && Date.now() <= room.pearl.deadline + CLICK_SLACK_MS) {
        room.pearl.clicked.add(p.name);
      }
    } else if (m.type === 'chat' && room) {
      const text = String(m.text || '').trim().slice(0, 150);
      if (text) {
        broadcast(room, { type: 'chat', name: u.name, text });
      }
    } else if (m.type === 'leave' && room) {
      removePlayer(room, ws);
      ws.room = null;
      ws.send(JSON.stringify({ type: 'left' }));
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    socketsOpen.set(ukey, Math.max(0, (socketsOpen.get(ukey) || 1) - 1));
    touch(u);
    if (ws.room) removePlayer(ws.room, ws);
  });
});

// Export server for serverless runtimes (Vercel)
module.exports = server;

// Start the server if running directly
if (!IS_VERCEL) {
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🎮 Matheria MVP Server running on http://localhost:${PORT}`);
    console.log(`💾 SQLite Database connected: ${DB_FILE}`);
    console.log(`⚡ WebSocket Multiplayer active on /ws`);
    console.log(`===============================================`);
  });
}
