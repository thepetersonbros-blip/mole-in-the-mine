# Manual QA checklist

## Local, two browser windows (npm run dev)

- [ ] Create a mine in window A, join by code in window B
- [ ] Both see each other walk, smooth, no rubber-banding
- [ ] Dig down, sideways, up. Hold E keeps digging
- [ ] Dig a wide tunnel with no posts: cracks appear, dust falls, ceiling collapses
- [ ] Cave-in shakes BOTH windows, harder when close
- [ ] Get buried: screen dark, wiggle ping shows in the other window (fuzzy, no name)
- [ ] Other player digs you out: rescue toast with their name
- [ ] Carry gold to cart, E deposits, toast shows name and amount
- [ ] Place post (1), ladder (2), lantern (3); charges tick back up
- [ ] Bonk (F): stun stars, coins drop, victim can't grab them while dizzy, you can
- [ ] Two bonks break a post; one breaks a ladder
- [ ] Ride the elevator with W/S; door sills are standable
- [ ] Find dynamite (dig a lot), X drops it, boom, gold scatters
- [ ] Ring bell: meeting, vote, result; skip works; tie banishes nobody
- [ ] Start with 4+ tabs: one gets the mole role card and the red drawer (M)
- [ ] Mole: sour a post near you, walk away, it crumbles later with no tell
- [ ] Mole: skim near cart (total drops silently), snuff lanterns, jam elevator
- [ ] Mole: swap hat to a friend's color, stand next to them, giggle
- [ ] Meeting shows true hats; round end reveals mole + hat history
- [ ] Refresh a tab mid-round: lands back in the same dwarf automatically
- [ ] Close a tab 10s: dwarf shows zZ, comes back on reopen

## Phone on the same wifi (npm run build; npm start; http://PC-IP:3000)

- [ ] Joystick walk, climb, elevator
- [ ] Big ACT button digs (hold keeps digging), deposits at cart, rings bell
- [ ] BONK button works
- [ ] Place buttons work; mole drawer usable with a thumb
- [ ] No pinch zoom, no scroll bounce, no text selection while playing
- [ ] Sound plays after first tap
- [ ] Screen stays awake during a round (or tip shown in lobby)
- [ ] Lock the phone 15s, unlock: reconnects into the same dwarf

## On Render (production URL)

- [ ] Cold visit after 20+ min idle: "Waking the mine..." then join screen (under ~90s)
- [ ] Full round with one phone on cellular data (not wifi)
- [ ] DevTools > Network > WS shows a websocket (101), not just polling
- [ ] Push a tiny change to main: Render auto-deploys; old rooms die politely ("mine is gone" card)
