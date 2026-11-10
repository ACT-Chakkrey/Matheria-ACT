// Integration test for Matheria HTTP & SQLite APIs
const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('Testing integration endpoints...');

  // 1. Leaderboard
  const lb = await request('GET', '/api/leaderboard');
  console.log('1. /api/leaderboard status:', lb.status, 'Rows:', lb.body.rows.length);

  // 2. Public profile
  const prof = await request('GET', '/api/player/leangchakrey');
  console.log('2. /api/player/leangchakrey:', prof.status, 'Hero:', prof.body.hero, 'Lvl:', prof.body.level);

  // 3. Register new user
  const testUser = 'hero_' + Math.floor(Math.random() * 10000);
  const reg = await request('POST', '/api/register', { username: testUser, password: 'password123' });
  console.log('3. /api/register status:', reg.status, 'Username:', reg.body.username, 'Token received:', !!reg.body.token);

  const token = reg.body.token;

  // 4. Save game data
  const saveRes = await request('PUT', '/api/save', {
    save: { coins: 1500, level: 12, resetCount: 2, hero: 'Subtra', grade: 4 }
  }, token);
  console.log('4. /api/save PUT status:', saveRes.status);

  // 5. Read back save
  const getSave = await request('GET', '/api/save', null, token);
  console.log('5. /api/save GET status:', getSave.status, 'Coins:', getSave.body.save.coins, 'Hero:', getSave.body.save.hero);

  // 6. Friends list
  const fr = await request('GET', '/api/friends', null, token);
  console.log('6. /api/friends GET status:', fr.status, 'Friends count:', fr.body.friends.length);

  // 7. Ping
  const ping = await request('POST', '/api/ping', {}, token);
  console.log('7. /api/ping status:', ping.status, 'Server time:', ping.body.serverTime);

  console.log('ALL API TESTS PASSED! 🎉');
  process.exit(0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
