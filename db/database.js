// Matheria SQLite Database Layer using native Node.js DatabaseSync (node:sqlite)
// Zero external dependencies, ACID-compliant, persistent, high performance with WAL mode.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

class MatheriaDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.init();
    this.prepareStatements();
  }

  init() {
    try {
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
      `);
    } catch (e) {
      try {
        this.db.exec(`PRAGMA journal_mode = DELETE;`);
      } catch (err) {}
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY COLLATE NOCASE,
        name TEXT NOT NULL,
        salt TEXT NOT NULL,
        hash TEXT NOT NULL,
        save TEXT,
        gold INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        rebirths INTEGER NOT NULL DEFAULT 0,
        plus_until INTEGER NOT NULL DEFAULT 0,
        avatar TEXT,
        avatar_gif TEXT,
        banner_color TEXT DEFAULT '#3a3a8a',
        banner_img TEXT,
        joined INTEGER NOT NULL,
        updated INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_gold ON users (gold DESC);
      CREATE INDEX IF NOT EXISTS idx_users_level ON users (level DESC);

      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_a TEXT NOT NULL COLLATE NOCASE,
        user_b TEXT NOT NULL COLLATE NOCASE,
        status TEXT NOT NULL, -- 'accepted' or 'pending'
        created_at INTEGER NOT NULL,
        UNIQUE(user_a, user_b)
      );

      CREATE INDEX IF NOT EXISTS idx_friends_lookup ON friends (user_a, status);
      CREATE INDEX IF NOT EXISTS idx_friends_target ON friends (user_b, status);

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user TEXT NOT NULL COLLATE NOCASE,
        to_user TEXT NOT NULL COLLATE NOCASE,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages (from_user, to_user, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_to_unread ON messages (to_user, read);
    `);
  }

  prepareStatements() {
    this.stmtGetUser = this.db.prepare('SELECT * FROM users WHERE username = ?');
    this.stmtInsertUser = this.db.prepare(`
      INSERT INTO users (username, name, salt, hash, save, gold, level, rebirths, plus_until, avatar, avatar_gif, banner_color, banner_img, joined, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtUpdateSave = this.db.prepare(`
      UPDATE users SET save = ?, gold = ?, level = ?, rebirths = ?, plus_until = ?, updated = ? WHERE username = ?
    `);
    this.stmtUpdateAvatar = this.db.prepare('UPDATE users SET avatar = ? WHERE username = ?');
    this.stmtUpdateMedia = this.db.prepare(`
      UPDATE users SET avatar_gif = ?, banner_color = ?, banner_img = ? WHERE username = ?
    `);
    this.stmtTouch = this.db.prepare('UPDATE users SET updated = ? WHERE username = ?');
    this.stmtLeaderboard = this.db.prepare(`
      SELECT username, name, gold, level, rebirths, avatar, plus_until, updated
      FROM users ORDER BY gold DESC LIMIT ?
    `);

    // Friends
    this.stmtGetAcceptedFriends = this.db.prepare(`
      SELECT u.username, u.name, u.gold, u.level, u.rebirths, u.avatar, u.plus_until, u.updated
      FROM friends f
      JOIN users u ON f.user_b = u.username
      WHERE f.user_a = ? AND f.status = 'accepted'
    `);
    this.stmtGetIncomingRequests = this.db.prepare(`
      SELECT u.username, u.name, u.gold, u.level, u.rebirths, u.avatar, u.plus_until, u.updated
      FROM friends f
      JOIN users u ON f.user_a = u.username
      WHERE f.user_b = ? AND f.status = 'pending'
    `);
    this.stmtGetOutgoingRequests = this.db.prepare(`
      SELECT u.username, u.name, u.gold, u.level, u.rebirths, u.avatar, u.plus_until, u.updated
      FROM friends f
      JOIN users u ON f.user_b = u.username
      WHERE f.user_a = ? AND f.status = 'pending'
    `);
    this.stmtCheckFriendship = this.db.prepare(`
      SELECT status FROM friends WHERE user_a = ? AND user_b = ?
    `);
    this.stmtAddPending = this.db.prepare(`
      INSERT OR REPLACE INTO friends (user_a, user_b, status, created_at) VALUES (?, ?, 'pending', ?)
    `);
    this.stmtAddAccepted = this.db.prepare(`
      INSERT OR REPLACE INTO friends (user_a, user_b, status, created_at) VALUES (?, ?, 'accepted', ?)
    `);
    this.stmtDeleteFriendship = this.db.prepare(`
      DELETE FROM friends WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)
    `);

    // Messages
    this.stmtInsertMessage = this.db.prepare(`
      INSERT INTO messages (from_user, to_user, text, created_at, read) VALUES (?, ?, ?, ?, 0)
    `);
    this.stmtGetChatMessages = this.db.prepare(`
      SELECT from_user, to_user, text, created_at
      FROM messages
      WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
      ORDER BY created_at ASC LIMIT ?
    `);
    this.stmtMarkChatRead = this.db.prepare(`
      UPDATE messages SET read = 1 WHERE from_user = ? AND to_user = ? AND read = 0
    `);
    this.stmtCountTotalUnread = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE to_user = ? AND read = 0
    `);
    this.stmtCountUnreadWith = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE to_user = ? AND from_user = ? AND read = 0
    `);
    this.stmtGetChatPartners = this.db.prepare(`
      SELECT DISTINCT CASE WHEN from_user = ? THEN to_user ELSE from_user END as partner
      FROM messages
      WHERE from_user = ? OR to_user = ?
    `);
    this.stmtGetLastMessage = this.db.prepare(`
      SELECT from_user, text, created_at
      FROM messages
      WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
      ORDER BY created_at DESC LIMIT 1
    `);
  }

  // ---------- User Methods ----------
  getUser(username) {
    if (!username) return null;
    const row = this.stmtGetUser.get(username.toLowerCase());
    if (!row) return null;
    return this._formatUser(row);
  }

  _formatUser(row) {
    let save = null;
    if (row.save) {
      try { save = JSON.parse(row.save); } catch (e) {}
    }
    return {
      username: row.username,
      name: row.name,
      salt: row.salt,
      hash: row.hash,
      save,
      gold: row.gold,
      level: row.level,
      rebirths: row.rebirths,
      plusUntil: row.plus_until,
      avatar: row.avatar,
      avatarGif: row.avatar_gif,
      banner: {
        color: row.banner_color || '#3a3a8a',
        img: row.banner_img || null
      },
      joined: row.joined,
      updated: row.updated
    };
  }

  createUser({ username, name, salt, hash, save = null, gold = 0, level = 1, rebirths = 0, plusUntil = 0, joined = Date.now(), updated = Date.now() }) {
    const key = username.toLowerCase();
    const saveJson = save ? JSON.stringify(save) : null;
    this.stmtInsertUser.run(key, name || username, salt, hash, saveJson, gold, level, rebirths, plusUntil, null, null, '#3a3a8a', null, joined, updated);
    return this.getUser(key);
  }

  updateSave(username, { save, gold, level, rebirths, plusUntil, updated = Date.now() }) {
    const key = username.toLowerCase();
    const saveJson = save ? JSON.stringify(save) : null;
    this.stmtUpdateSave.run(saveJson, gold, level, rebirths, plusUntil, updated, key);
  }

  updateAvatar(username, avatar) {
    this.stmtUpdateAvatar.run(avatar, username.toLowerCase());
  }

  updateProfileMedia(username, { avatarGif, bannerColor = '#3a3a8a', bannerImg = null }) {
    this.stmtUpdateMedia.run(avatarGif, bannerColor, bannerImg, username.toLowerCase());
  }

  touchUser(username, timestamp = Date.now()) {
    if (!username) return;
    this.stmtTouch.run(timestamp, username.toLowerCase());
  }

  getLeaderboard(limit = 50) {
    const rows = this.stmtLeaderboard.all(limit);
    return rows.map(r => ({
      name: r.name,
      gold: r.gold,
      level: r.level,
      rebirths: r.rebirths,
      avatar: r.avatar,
      plus: (r.plus_until || 0) > Date.now(),
      updated: r.updated
    }));
  }

  // ---------- Friend Methods ----------
  getFriendsData(username, isOnlineFn) {
    const key = username.toLowerCase();
    const friends = this.stmtGetAcceptedFriends.all(key).map(r => ({
      name: r.name,
      gold: r.gold,
      level: r.level,
      rebirths: r.rebirths,
      avatar: r.avatar,
      plus: (r.plus_until || 0) > Date.now(),
      online: isOnlineFn ? isOnlineFn(r.username) : false
    }));

    const incoming = this.stmtGetIncomingRequests.all(key).map(r => ({
      name: r.name,
      gold: r.gold,
      level: r.level,
      rebirths: r.rebirths,
      avatar: r.avatar,
      plus: (r.plus_until || 0) > Date.now(),
      online: isOnlineFn ? isOnlineFn(r.username) : false
    }));

    const outgoing = this.stmtGetOutgoingRequests.all(key).map(r => r.name);

    return { friends, incoming, outgoing };
  }

  areFriends(userA, userB) {
    const a = userA.toLowerCase(), b = userB.toLowerCase();
    const row = this.stmtCheckFriendship.get(a, b);
    return !!(row && row.status === 'accepted');
  }

  sendFriendRequest(fromUser, toUser) {
    const a = fromUser.toLowerCase(), b = toUser.toLowerCase();
    const now = Date.now();
    // Check if b already requested a
    const reverse = this.stmtCheckFriendship.get(b, a);
    if (reverse && reverse.status === 'pending') {
      // Instant mutual friendship
      this.stmtAddAccepted.run(a, b, now);
      this.stmtAddAccepted.run(b, a, now);
      return { accepted: true };
    }
    this.stmtAddPending.run(a, b, now);
    return { accepted: false };
  }

  acceptFriendRequest(me, requester) {
    const myKey = me.toLowerCase(), reqKey = requester.toLowerCase();
    const check = this.stmtCheckFriendship.get(reqKey, myKey);
    if (!check || check.status !== 'pending') return false;
    const now = Date.now();
    this.stmtAddAccepted.run(myKey, reqKey, now);
    this.stmtAddAccepted.run(reqKey, myKey, now);
    return true;
  }

  declineFriendRequest(me, requester) {
    const myKey = me.toLowerCase(), reqKey = requester.toLowerCase();
    this.stmtDeleteFriendship.run(reqKey, myKey, reqKey, myKey);
    return true;
  }

  cancelFriendRequest(me, target) {
    const myKey = me.toLowerCase(), targetKey = target.toLowerCase();
    this.stmtDeleteFriendship.run(myKey, targetKey, myKey, targetKey);
    return true;
  }

  removeFriend(userA, userB) {
    const a = userA.toLowerCase(), b = userB.toLowerCase();
    this.stmtDeleteFriendship.run(a, b, b, a);
    return true;
  }

  // ---------- Message Methods ----------
  sendMessage(fromUser, toUser, text) {
    const a = fromUser.toLowerCase(), b = toUser.toLowerCase();
    const now = Date.now();
    this.stmtInsertMessage.run(a, b, text, now);
    return now;
  }

  getConversationWith(me, other, limit = 100) {
    const a = me.toLowerCase(), b = other.toLowerCase();
    // mark incoming as read
    this.stmtMarkChatRead.run(b, a);
    const msgs = this.stmtGetChatMessages.all(a, b, b, a, limit);
    return msgs.map(m => ({
      mine: m.from_user.toLowerCase() === a,
      text: m.text,
      t: m.created_at
    }));
  }

  getTotalUnread(user) {
    const row = this.stmtCountTotalUnread.get(user.toLowerCase());
    return row ? row.count : 0;
  }

  getConversationsSummary(me, isOnlineFn) {
    const myKey = me.toLowerCase();
    // Get all chat partners + all accepted friends
    const partners = new Set(this.stmtGetChatPartners.all(myKey, myKey).map(r => r.partner.toLowerCase()));
    const friendRows = this.stmtGetAcceptedFriends.all(myKey);
    friendRows.forEach(f => partners.add(f.username.toLowerCase()));

    const conversations = [];
    for (const partnerKey of partners) {
      const u = this.getUser(partnerKey);
      if (!u) continue;
      const last = this.stmtGetLastMessage.get(myKey, partnerKey, partnerKey, myKey);
      const unreadRow = this.stmtCountUnreadWith.get(myKey, partnerKey);
      const isFriend = this.areFriends(myKey, partnerKey);

      conversations.push({
        name: u.name,
        avatar: u.avatar || null,
        plus: (u.plusUntil || 0) > Date.now(),
        online: isOnlineFn ? isOnlineFn(partnerKey) : false,
        friend: isFriend,
        unread: unreadRow ? unreadRow.count : 0,
        last: last ? {
          text: last.text.slice(0, 60),
          t: last.created_at,
          mine: last.from_user.toLowerCase() === myKey
        } : null
      });
    }

    conversations.sort((a, b) => ((b.last ? b.last.t : 0) - (a.last ? a.last.t : 0)));
    return {
      conversations,
      unread: this.getTotalUnread(myKey)
    };
  }

  // ---------- Migration Helper ----------
  migrateFromJson(jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) return false;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    } catch (e) {
      console.error('Failed to read users.json for migration:', e);
      return false;
    }

    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (countRow.count > 0) {
      // Already populated, skip migration
      return false;
    }

    console.log(`[SQLite Migration] Migrating ${Object.keys(data).length} accounts from users.json...`);
    const now = Date.now();

    // Use a transaction for atomic, rapid batch migration
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const [key, u] of Object.entries(data)) {
        const username = key.toLowerCase();
        const name = u.name || key;
        const salt = u.salt || '';
        const hash = u.hash || '';
        const save = u.save ? JSON.stringify(u.save) : null;
        const gold = Math.max(0, Math.floor(Number(u.gold) || (u.save && u.save.coins) || 0));
        const level = Math.max(1, Math.floor(Number(u.level) || (u.save && u.save.level) || 1));
        const rebirths = Math.max(0, Math.floor(Number(u.rebirths) || (u.save && u.save.resetCount) || 0));
        const plusUntil = Math.max(0, Math.floor(Number(u.plusUntil) || (u.save && u.save.plusUntil) || 0));
        const avatar = u.avatar || null;
        const avatarGif = u.avatarGif || null;
        const bannerColor = (u.banner && u.banner.color) || '#3a3a8a';
        const bannerImg = (u.banner && u.banner.img) || null;
        const joined = Number(u.joined) || Number(u.updated) || now;
        const updated = Number(u.updated) || now;

        this.stmtInsertUser.run(
          username, name, salt, hash, save,
          gold, level, rebirths, plusUntil,
          avatar, avatarGif, bannerColor, bannerImg,
          joined, updated
        );

        // Friends
        if (Array.isArray(u.friends)) {
          for (const f of u.friends) {
            const fKey = String(f).toLowerCase();
            this.stmtAddAccepted.run(username, fKey, updated);
          }
        }
        // Requests in
        if (Array.isArray(u.requestsIn)) {
          for (const req of u.requestsIn) {
            const rKey = String(req).toLowerCase();
            this.stmtAddPending.run(rKey, username, updated);
          }
        }
        // Requests out
        if (Array.isArray(u.requestsOut)) {
          for (const req of u.requestsOut) {
            const rKey = String(req).toLowerCase();
            this.stmtAddPending.run(username, rKey, updated);
          }
        }

        // Chats
        if (u.chats && typeof u.chats === 'object') {
          for (const [otherKey, msgList] of Object.entries(u.chats)) {
            if (Array.isArray(msgList)) {
              for (const m of msgList) {
                if (m && m.from === username) {
                  this.stmtInsertMessage.run(username, otherKey.toLowerCase(), m.text || '', m.t || now);
                }
              }
            }
          }
        }
      }
      this.db.exec('COMMIT');
      console.log('[SQLite Migration] Successfully migrated all users to SQLite!');

      // Create backup file
      try {
        fs.copyFileSync(jsonFilePath, jsonFilePath + '.migrated.bak');
      } catch (e) {}

      return true;
    } catch (err) {
      this.db.exec('ROLLBACK');
      console.error('[SQLite Migration] Migration failed, rolled back:', err);
      throw err;
    }
  }
}

module.exports = MatheriaDB;
