# Mole in the Mine

A browser game for you and five friends. Dig gold together in one shared mine. Build supports or the roof comes down. One of you is secretly paid by the rival mine, and cave-ins are not always accidents.

No downloads. Friends tap a link, type a 4-letter code, and play. Works on PC and phones.

## How a round works

- Six dwarfs, one mine, a 10 minute shift. Bank 140 gold in the cart to win.
- Dig too wide without support posts and the ceiling cracks, then falls. Anyone under it gets buried alive (not dead). Friends must dig them out.
- Every cave-in shakes everyone's screen. Count the hats and go hunting for the buried.
- With 4 or more players, one player is secretly the MOLE. The mole can sour supports (they fail a while later), skim gold from the cart, snuff lanterns, jam the elevator, and swap their hat color to frame people.
- Hats are the only identity in the mine. No name tags. Depositing at the cart flashes your real name, and meetings show true colors. Everything else is lies.
- Anyone can ring the camp bell (once per round each) to call a vote. Banish the mole and the miners win on the spot.
- Your pickaxe is also a club. Bonk a friend: they drop coins and you can take them. Robbery is legal. Two hits breaks a support. Dark tunnels hide your hat.
- Sometimes digging turns up dynamite. Press X. Then run.

## Controls

PC: A/D move, W/S climb and ride the elevator, E dig and use (hold to keep digging), F bonk, 1 post, 2 ladder, 3 lamp, X dynamite, Q stop, M mole tricks.
Phone: left thumb to move, big buttons to act. Keep your screen on.

## Run it on your PC (for testing)

```
npm install
npm run dev
```

Open http://localhost:5173 in two browser windows and play with yourself. Make the second window a private/incognito window: normal tabs in the same browser share a rejoin token, so the game thinks they are the same dwarf.

To test on your phone: run `npm run build` then `npm start`, find your PC's IP (`ipconfig`), and open `http://YOUR-PC-IP:3000` on the phone (same wifi). Windows may ask to allow Node through the firewall: say yes.

## Put it online (about 10 minutes, one time)

1. Make a free GitHub account at github.com if you don't have one.
2. On GitHub: click the + (top right) > New repository. Name it `mole-in-the-mine`. Private is fine. Do NOT add a README (we have one). Create it.
3. GitHub shows you a URL like `https://github.com/YOURNAME/mole-in-the-mine.git`. In a terminal in this folder run:

```
git remote add origin https://github.com/YOURNAME/mole-in-the-mine.git
git push -u origin main
```

4. Make a free account at render.com (sign up with GitHub, it's one click).
5. On Render: New + > Blueprint > pick the `mole-in-the-mine` repo > Apply. Render reads `render.yaml` and builds everything.
6. A few minutes later you get a URL like `https://mole-in-the-mine.onrender.com`. That's the game. Done forever: every time code is pushed, Render updates itself.

## Game night runbook

1. Open the game URL about 5 minutes early. Free servers nap when nobody plays, and the first wake-up takes up to a minute. The join screen shows "Waking the mine..." while it happens.
2. Click "Open a new mine," then copy the invite link and drop it in the group chat.
3. Get everyone on the Discord call. The arguing IS the game.
4. While people are connected and playing, the server stays awake. No naps mid-night.
5. If someone's phone hiccups, they just reopen the link. The game puts them right back into their dwarf, even if they're buried.
6. If the server restarts mid-round (rare), the room is gone: open a new mine, two taps. Night scores live in each player's browser, so bragging rights survive.

## Tuning the game

Every number lives in `src/shared/constants.ts`: round length, quota, cooldowns, cave-in fuses, mole powers. Change, test, push.

## Tests

```
npm test            # unit + 6-bot integration tests
npx playwright test # real-browser test: 3 tabs share a mine
```

The test suite includes a secrecy audit that proves no network message can reveal who the mole is, even to someone reading browser dev tools.
