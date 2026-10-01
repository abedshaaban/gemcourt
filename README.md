# Splendor (local multiplayer)

A local-network implementation of the board game **Splendor** (standard base-game rules, 2–4 players),
built with TanStack Start + React. Your machine is the server; everyone plays in a browser.

## Run it

```bash
pnpm install
pnpm dev        # dev server on http://localhost:3000 (also reachable from your LAN)
```

Production-style run (faster, no hot reload):

```bash
pnpm play       # build + serve on port 3000
```

When the server starts, the terminal prints a **QR code** of your network address — players on the
same Wi-Fi scan it with their phone camera and land straight on the game (no typing URLs).

Open `http://localhost:3000`, click **Create game**, share the 5-letter code.
Friends on the same Wi-Fi open `http://<your-LAN-IP>:3000` (shown in the waiting room), click **Join game**,
enter the code and pick a display name. The host (first to sit down) starts the game once 2–4 players are seated.

Tip: to test alone, open several browser tabs — each tab is a separate player.

## Rules implemented

- Setup: gem piles of 4 / 5 / 7 for 2 / 3 / 4 players, 5 gold, players + 1 nobles, 4 face-up cards per tier.
- One action per turn:
  - take 3 gems of different colors (fewer only if fewer colors remain), or
  - take 2 gems of one color if that pile has at least 4, or
  - reserve a face-up card or the top card of a deck (max 3 reserved) and gain 1 gold if available, or
  - buy a face-up or reserved card (card bonuses discount the cost, gold is wild).
- Hold at most 10 tokens at the end of a turn — excess must be returned.
- Nobles (3 points) visit at the end of your turn when your card bonuses meet their requirement; one per turn,
  you choose if several qualify.
- Reaching 15 points triggers the final round so everyone gets the same number of turns. Highest score wins;
  tie goes to the player with the fewest purchased cards, otherwise a shared victory.
- Blind-reserved cards stay hidden from opponents.
- If a player truly has no legal move (bank empty, 3 reserved, nothing affordable) they may pass.

## Disconnects

- Closed your tab? Open the game link again and join with the **same name** to reclaim your seat
  (possible once you've been gone ~5 seconds, so a quick refresh never gets merged with someone else).
- If the player whose turn it is has been offline for ~8 seconds, anyone at the table can **skip their turn**
  so the game keeps going (any tokens over 10 are returned for them).
- If the host has been offline for a few seconds, any other player can start / restart the game and becomes host.
- The host can't start while a seated player is offline (remove them or wait).
- Seats are protected only by name: this is meant for friends on a trusted home network.

## Scripts

| Command          | What it does                     |
| ---------------- | -------------------------------- |
| `pnpm dev`       | Dev server with hot reload       |
| `pnpm play`      | Build and serve production build |
| `pnpm test`      | Rules-engine unit tests (vitest) |
| `pnpm typecheck` | TypeScript check                 |

## Layout

- `src/game/` — pure rules engine (`types.ts` contract, `engine.ts`, card + noble data, tests)
- `src/server/rooms.ts` — in-memory rooms, lobby, per-player views
- `src/routes/api/rooms/*` — HTTP endpoints + Server-Sent Events stream for live updates
- `src/routes/` — home (create / join), `/room/$code` (join form, waiting room, game)
- `src/components/` — lobby and board UI

Game state is kept in memory: restarting the server ends all games.
