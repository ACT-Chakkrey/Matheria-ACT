# 📜 Matheria: Number Heroes – Complete Feature Documentation

A comprehensive catalog of all features built into **Matheria (Number Heroes – Boss Rush Edition)** across single-player gameplay, real-time multiplayer, social systems, math mechanics, responsive UI/UX, and database architecture.

---

## 🧮 1. Adaptive Math Engine

- **Grade-Based Curriculum (Grades 1 through 9+)**:
  - **Grade 1**: Basic addition & subtraction (within 10), missing number problems (`a + ? = c`).
  - **Grade 2**: Addition & subtraction (within 50), single-digit multiplication.
  - **Grade 3**: Addition & subtraction (within 200), times tables (up to 10×10), simple division, missing numbers (within 50).
  - **Grade 4**: 4-digit arithmetic, 2-digit multiplication, division (up to 12÷10), fractions with like denominators (`a/d ± b/d`).
  - **Grade 5**: 5-digit arithmetic, advanced multiplication, order of operations without parentheses, linear one-step equations (`x + a = b`, `cx = d`), fractions.
  - **Grade 6**: Order of operations with parentheses, square roots (`√r²`), fractions with different denominators (`a/d1 + b/D`), percentages (`10%, 20%, 25%, 50%`), advanced multiplication.
  - **Grade 7**: Negative numbers arithmetic (number line rules, sign changes), 2-step equations (`cx ± b = d`), powers/exponents (`a^e`), square roots.
  - **Grade 8**: Advanced 2-step equations, variable on both sides (`ax + b = cx + d`), powers, negative numbers, square roots, percentages.
  - **Grade 9+**: Equations with brackets (`k(x + b) = d`), negative variable equations (`-cx + b = r`), quadratic equations (`x² = n, x > 0`), square roots, exponents.
- **Difficulty Multipliers**:
  - **Easy**: 0.6x number scale, 30s question countdown timer.
  - **Normal**: 1.0x standard scale, 20s question countdown timer.
  - **Hard**: 1.6x expanded numbers, 10s rapid-fire question timer.
- **Hero-Specific Math Traits**:
  - Playing with hero **Divina** forces division problems across all grades.
- **AI Math Explanation & Instant Feedback**:
  - Generates step-by-step written explanations for missed problems (e.g. arithmetic breakdown, algebraic steps, common denominator steps).
  - Shows timeout penalties and highlights the correct answer before continuing.

---

## ⚔️ 2. Hero & RPG Progression System

- **5 Playable Heroes** with progressive base stats and unlock tiers:
  1. **Addy**: Base Damage: 20 | Price: Free (Starting Hero).
  2. **Subtra**: Base Damage: 35 | Price: 800 Gold.
  3. **Max**: Base Damage: 60 | Price: 2,500 Gold.
  4. **Divina**: Base Damage: 100 | Price: 5,000 Gold | Special: Forces division math problems.
  5. **Lastly**: Base Damage: 400 | Price: 20,000 Gold | High-tier late-game hero.
- **Hero Upgrades**:
  - **Damage Upgrade (DMG Level)**: Incremental permanent damage boosts.
  - **Health Upgrade (HP Level)**: Max HP increases by +20 HP per level.
- **Rebirth System**:
  - Reset character levels for permanent rebirth multipliers and crafting prerequisites (supports up to 999 rebirths).

---

## 🗡️ 3. Weapons & Equipment System (22 Weapons)

- **Standard Weapons**:
  - `SWORD` (+30 DMG)
  - `HORNET_STAFF` (+60 DMG)
  - `MASTER_SWORD` (+90 DMG)
  - `FROST_STAFF` (+120 DMG)
  - `STARDUST_STAFF` (+150 DMG)
  - `VOID_SWORD` (+180 DMG)
  - `PIRATE_STAFF` (+200 DMG)
  - `BONE_BREAKER` (+200 DMG)
  - `CRYSTAL_STAFF` (+220 DMG)
  - `KAIDO_WHIP` (+250 DMG, with pulsing rainbow aura)
  - `TERRAPRISMA` (+700 DMG, flying sword animation)
  - `SKELETON_STAFF` (+400 DMG)
  - `LEAD_BROADSWORD` (+190 DMG)
  - `TERRARIAN_SPEAR` (+10 DMG)
  - `BRAND_OF_INFERNO` (+450 DMG, purple magic slash)
- **High-Tier & God-Tier Weapons**:
  - `SOUL_SCYTHE` (+1,500 DMG, with hit counter boosts)
  - `TERRARIAN_SABER` (+6,700 DMG)
  - `VOLCANO` (+67,000 DMG, fire trail & volcanic slash effect)
  - `DEVOUR_PRIDE` (+9,000,000 DMG, rainbow beam projectile, requires Rebirth 6)
- **Consumables & Potions**:
  - `POTION` (Heals 20 HP, throwing animation, splash explosion)
  - `POTION_ONE` (Heals 30 HP, pink potion explosion effect)

---

## 🐾 4. Pets & Companions System (11 Pets)

- **Combat Damage Boost Pets**:
  - `TANUKI_GIRL`: +500 DMG (Cost: 20,000G)
  - `TORTLE_SAGE`: +1,000 DMG (Cost: 40,000G)
  - `EXOTIC_MYNA`: +2,000 DMG (Cost: 80,000G)
  - `AMNESIAC`: +4,000 DMG (Cost: 150,000G)
  - `BEET_COOKIE`: +8,000 DMG (Cost: 250,000G)
  - `WYVERN_PUP`: +13,000 DMG (Cost: 350,000G)
  - `LIL_MAID`: +19,000 DMG (Cost: 500,000G)
  - `LYRIST`: +23,000 DMG (Cost: 780,000G)
  - `CLOTH_GEIST`: +50,000 DMG (Cost: 1,300,000G)
  - `MINI_PRIMORDIALS`: +90,000 DMG (Cost: 3,000,000G)
- **Special Companion**:
  - `LIFE_SPIRIT` (Cost: 40,000G): Second-chance guardian. If the player suffers lethal damage, revives them with 50% HP (can be equipped alongside another pet as a secondary companion).

---

## 🔨 5. Crafting & Forging Workshop

- **Workshop System**:
  - Dedicated workshop environment with dynamic atmospheric background and custom music track.
  - Combines lower-tier weapons and items into legendary weapons.
- **Recipes**:
  - `LEAD_BROADSWORD`: `SWORD` + `POTION` (0 Gold).
  - `BRAND_OF_INFERNO`: `CRYSTAL_STAFF` + `STARDUST_STAFF` (0 Gold).
  - `VOLCANO`: `HORNET_STAFF` + `BRAND_OF_INFERNO` (700,000 Gold).
  - `DEVOUR_PRIDE`: `TERRAPRISMA` + `KAIDO_WHIP` (2,800,000 Gold + Rebirth 6).

---

## 💰 6. Economy, Shops & Inventory

- **Weapon Shop**: Browse and buy unlocked swords and staves.
- **Pet Shop**: View pet cards with stats, costs, and buy companions.
- **Backpack / Inventory**:
  - Visual equipment slots for Active Weapon, Primary Pet, and Secondary Pet (Life Spirit).
  - Item grid with equipment stats, descriptions, and one-click equip.
- **Coins / Gold System**: Earned through answering correctly, defeating monsters, completing quests, and winning co-op boss raids.

---

## 🎯 7. Quests & Boss Rush Progression

- **Progressive Quests**:
  - Quest 1: Achieve Rebirth 1.
  - Quest 2: Defeat God Boss on Easy 3 times.
  - Quest 3: Defeat God Boss on Hard 1 time.
- **Shadow Key Mechanic**:
  - 1 Shadow Key drops every 30 defeated enemies (`keyKills / 30`).
  - Shadow Keys are required to challenge the finale God Boss in single-player or host a co-op raid.
- **Boss Monsters**:
  - Dark Mage Golem, Queen Bee Ogre, Duke Fishron Saucer, Lunatic Cultist Betsy, Empress Plantera.
- **Cinematic Finale Boss (??GOD?? / Moon Lord)**:
  - Unlocked at Level 50+.
  - Full cutscene with letterbox cinematic black bars, black hole swirl, glowing boss text lines, screen flash, and orchestral boss music.

---

## 🌐 8. True Real-Time Multiplayer Co-op (WebSockets)

- **1 to 4 Players Co-op Boss Raids**:
  - Real-time room creation with 4-letter join codes (e.g. `XZ7B`).
  - Lobby system with live readiness and player roster cards.
  - Dynamic combat roles: **Front**, **Back**, **Mid**, and **Support**.
- **Synchronized Boss Combat**:
  - Shared boss HP bar scaled to player count (60k Easy, 150k Normal, 600k Hard per player).
  - Real-time attacks broadcasted to all players with damage floating numbers.
  - Timing Bar QTE: Green center (2x damage), Yellow zone (1x damage), Red edge (0.5x damage).
- **Synchronized Pearl Dodge Event**:
  - Every 9 seconds the boss throws a dangerous pearl with a 3-second countdown.
  - All players must click the pearl dodge button (or press Space) within the grace window or lose 15% HP.
- **Anti-Cheat Validation**:
  - Server calculates and enforces maximum stat ceilings based on claimed equipment.
- **Network Resilience**:
  - RFC 6455 compliant WebSocket layer with 25-second ping/pong heartbeats and clean disconnect recovery.

---

## 👥 9. Social & Community Hub

- **Global Leaderboard**:
  - Real-time rankings of top 50 players sorted by Gold, showing Level, Rebirths, Avatars, and Online status badges.
- **Friends System**:
  - Send, accept, decline, cancel, and remove friend requests.
  - Live friend card roster showing online/offline status, levels, and rebirths.
- **Private Direct Messaging (Friends Only)**:
  - Real-time 1-on-1 private messaging.
  - Unread message counter badges.
  - Conversation history with chat partners.
- **Public Player Profiles**:
  - Inspect any player: Hero, Weapon, Accuracy percentage, Monster wins, Boss wins, Max HP, Base damage, Join date, and Last seen.

---

## ⭐ 10. Matheria PLUS (VIP System)

- **PLUS Benefits**:
  - **5x Stat & Reward Multiplier**: 5x Max HP and 5x Base Damage.
  - **Animated GIF Avatars**: Upload and showcase animated GIF profile pictures.
  - **Custom Profile Banners**: Choose custom hex colors and upload banner background images or GIFs.
  - **Gold Crown PLUS Badge**: Displayed next to the player's username across leaderboards, profiles, and chats.

---

## 🎵 11. Built-in Retro Music Player

- **Dynamic Ambient BGM**:
  - Menu Theme, Battle Theme, Boss Theme, and Crafting Workshop Theme.
- **Custom Music Player / Jukebox**:
  - Allows uploading local audio files (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`) stored securely in the browser's IndexedDB.
  - Playlist controls: Play, Pause, Next, Previous, and Track Deletion.
  - Supports switching between Game Music, Spotify embed, YouTube embed, and Custom Files.

---

## 📱 12. Cross-Screen Responsive UI/UX & Mobile Keypad

- **Universal Responsiveness**:
  - Dynamic Viewport Units (`100dvh`) to prevent address-bar jumps on iOS Safari and Chrome Android.
  - Mobile Portrait (375px–430px) layout: auto-scaled character sprites, compact HUD, and flexible modal windows.
  - Mobile Landscape layout: compact vertical arrangement to prevent vertical scrolling during combat.
  - Tablet & Desktop scaling with retro pixel-art rendering (`image-rendering: pixelated`).
- **On-Screen Mobile Virtual Numeric Keypad**:
  - Dedicated touch keypad (`1–9`, `0`, `⌫ Delete`, `↵ Enter`) in single-player and co-op combat.
  - Solves the problem of native phone keyboards covering monsters and timers.

---

## 💾 13. Persistent SQLite Database Architecture

- **Engine**: Native Node.js `node:sqlite` (`DatabaseSync`) in **Write-Ahead Logging (WAL)** mode.
- **Zero NPM Bloat**: No external database driver dependencies, zero binary compilation.
- **Relational Tables**:
  - `users`: Credentials, salt, scrypt hash, full RPG save JSON, indexed gold, level, rebirths, avatar, banners, plus expiry.
  - `friends`: Symmetrical friendships, pending requests, timestamps.
  - `messages`: Sender, receiver, message text, timestamps, read status.
- **Automated Migration**:
  - Seamlessly imports existing user records from legacy `data/users.json` on initial boot.
