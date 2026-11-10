// WebSocket integration test using node standard http and crypto (RFC 6455 client)
const http = require('http');
const crypto = require('crypto');

function makeWsClient(token) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/ws?token=' + encodeURIComponent(token),
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': 13
      }
    });

    req.on('upgrade', (res, socket) => {
      const client = {
        socket,
        messages: [],
        handlers: {},
        send(obj) {
          const payload = Buffer.from(JSON.stringify(obj));
          const len = payload.length;
          const mask = crypto.randomBytes(4);
          const masked = Buffer.alloc(len);
          for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
          const head = len < 126
            ? Buffer.from([0x81, 0x80 | len])
            : Buffer.from([0x81, 0x80 | 126, len >> 8, len & 255]);
          socket.write(Buffer.concat([head, mask, masked]));
        },
        close() { socket.end(); }
      };

      let buf = Buffer.alloc(0);
      socket.on('data', d => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
          const b0 = buf[0], b1 = buf[1];
          const opcode = b0 & 15;
          let len = b1 & 127, off = 2;
          if (len === 126) {
            if (buf.length < 4) return;
            len = buf.readUInt16BE(2);
            off = 4;
          }
          if (buf.length < off + len) return;
          const payload = buf.slice(off, off + len);
          buf = buf.slice(off + len);
          if (opcode === 1) {
            try {
              const msg = JSON.parse(payload.toString('utf8'));
              client.messages.push(msg);
              if (client.handlers.message) client.handlers.message(msg);
            } catch (e) {}
          }
        }
      });
      resolve(client);
    });

    req.on('error', reject);
    req.end();
  });
}

// Token helper for testing
const MatheriaDB = require('../db/database');
const path = require('path');
const fs = require('fs');
const secret = fs.readFileSync(path.join(__dirname, '../data/secret.txt'), 'utf8');

function testToken(name) {
  const exp = Date.now() + 3600000;
  const body = name + '.' + exp;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return body + '.' + sig;
}

async function run() {
  console.log('Testing WebSocket multiplayer co-op...');
  const t1 = testToken('leangchakrey');
  const t2 = testToken('suymeng');

  const p1 = await makeWsClient(t1);
  console.log('Player 1 connected to /ws');

  const p2 = await makeWsClient(t2);
  console.log('Player 2 connected to /ws');

  let roomCode = null;

  p1.handlers.message = msg => {
    // console.log('[P1 received]', msg.type);
    if (msg.type === 'state' && msg.code && !roomCode) {
      roomCode = msg.code;
      console.log('Room created with code:', roomCode);
      // Now player 2 joins
      p2.send({ type: 'join', code: roomCode, hero: 'Max', grade: 4, power: 100, maxHp: 200 });
    }
  };

  p2.handlers.message = msg => {
    // console.log('[P2 received]', msg.type);
    if (msg.type === 'state' && msg.players && msg.players.length === 2 && msg.status === 'lobby') {
      console.log('Both players in lobby! Host starting fight...');
      p1.send({ type: 'start' });
    }
    if (msg.type === 'question') {
      console.log('Player 2 received question:', msg.text);
      console.log('WebSocket multiplayer co-op test passed! 🎮');
      p1.close();
      p2.close();
      process.exit(0);
    }
  };

  // Host creates room
  p1.send({ type: 'create', difficulty: 'Normal', hero: 'Lastly', grade: 8, power: 500, maxHp: 1000 });

  // Timeout guard
  setTimeout(() => {
    console.error('WebSocket test timed out!');
    process.exit(1);
  }, 6000);
}

run().catch(err => {
  console.error('WS test error:', err);
  process.exit(1);
});
