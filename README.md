# Propositions & Predicates — Interactive Logic Lab

An interactive teaching module + a real-time multiplayer quiz game for **Discrete Mathematics (7MA206), Unit I — Logic & Proof Techniques**, built for ISE-2.

Live pieces:
- **`index.html`** — landing page
- **`learn.html`** — interactive concept lab: type any propositional formula and get a truth table generated live; define your own predicate and domain and watch `∀x P(x)` / `∃x P(x)` get evaluated
- **`game.html`** — "Logic Duel", a real-time multiplayer quiz (2–8 players) that runs on phones and laptops at once via Firebase Realtime Database
- **`js/logic-engine.js`** — the actual logic: a hand-written tokenizer/parser/evaluator for propositional formulas (`¬ ∧ ∨ → ↔`), shared by both the Learn page and the game, so there's one source of truth for "what is correct"

Nothing in the app is a fixed test case: the truth-table builder parses whatever formula you type, the quantifier explorer evaluates whatever domain/predicate you type, and every multiplayer round is generated at random at the moment it's needed (`js/game.js`, functions `genEvaluateQuestion`, `genClassifyQuestion`, `genQuantifierQuestion`).

---

## 1. Project structure

```
discrete-math-app/
├── index.html
├── learn.html
├── game.html
├── css/
│   └── style.css
├── js/
│   ├── firebase-config.js   # Firebase init (Realtime Database + Anonymous Auth)
│   ├── logic-engine.js      # propositional logic parser/evaluator (no Firebase dependency)
│   ├── learn.js             # Learn page behaviour
│   └── game.js              # multiplayer game logic
└── README.md
```

No build step, no npm install, no bundler — it's plain HTML/CSS/JS with ES modules, and Firebase is loaded straight from Google's CDN inside `firebase-config.js`. That keeps the GitHub repo simple to review and the app trivial to host.

## 2. Run it locally

Browsers block ES module imports over `file://`, so you need a tiny local server:

```bash
cd discrete-math-app
python3 -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000`. For the multiplayer game to be testable with a second "player", open a second browser tab (or your phone on the same Wi-Fi, pointed at `http://<your-laptop-ip>:8000`).

## 3. Put it online (so classmates can play on their phones)

The simplest free option is **GitHub Pages**, which also satisfies the "public GitHub repository" deliverable:

1. Push this folder to a public GitHub repo.
2. Repo → **Settings → Pages** → Source: `main` branch, `/ (root)`.
3. GitHub gives you a URL like `https://<username>.github.io/<repo>/`. Open `game.html` there from any phone and it works — no app install needed.

## 4. Firebase setup (Realtime Database)

The project already points at your Firebase project (`discrete-mathematics-ise-2`) in `js/firebase-config.js`. Two things to turn on in the [Firebase console](https://console.firebase.google.com/):

### 4a. Enable Anonymous Authentication
**Build → Authentication → Sign-in method → Anonymous → Enable.**
The game signs every visitor in anonymously (no email/password UI) purely so Database Rules can tell "a real visitor" apart from an arbitrary script — the display name you type is separate and is what other players see.

### 4b. Set Realtime Database rules
**Build → Realtime Database → Rules**, and use something like:

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": "auth != null",
        ".write": "auth != null",
        "players": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid"
          }
        }
      }
    }
  }
}
```

This requires every reader/writer to at least be anonymously signed in, and restricts each player's own `players/$uid` node to that player. Firebase's rule language can't cleanly express "only the room's host may write the `question` node" without duplicating the host's uid into every rule path, which is overkill for a classroom-scale project — the trade-off is documented here rather than hidden. If you want that extra restriction for the report's "software architecture" section, mention this as a known simplification.

> Keep the database region as `asia-southeast1` (already set in `databaseURL`) — don't change it unless you also create a new database instance in that region.

## 5. How the multiplayer sync works (for your technical report / viva)

- Each room lives at `rooms/<5-character code>` in the Realtime Database.
- `players/` holds one entry per connected player (`name`, `score`, `connected`), kept live with `onValue` listeners — every client re-renders the moment anything changes.
- Only the **host's browser** generates each question and runs the round timer (`startHostRoundWatch` in `game.js`); every other client just renders whatever the host wrote and submits answers to `answers/<round>/<uid>`. This avoids every client racing to decide "who answered first."
- `firebase.onDisconnect()` flips a player's `connected` flag to `false` automatically if their tab closes or their phone loses signal — no polling needed.
- Scoring: a correct answer is worth 100 points plus up to 50 bonus points for speed (`closeRound` in `game.js`), computed from how much of the round's time limit was left when the answer arrived.

## 6. Question types generated during a game

| Type | What's asked | Where it's generated |
|---|---|---|
| **Evaluate** | Given a random truth assignment (e.g. `p=T, q=F`), is a randomly built formula like `(p ∧ q) → r` True or False? | `genEvaluateQuestion()` |
| **Classify** | Is a randomly built formula a Tautology, Contradiction, or Contingency? | `genClassifyQuestion()` |
| **Quantifier** | Given a randomly generated integer domain and a randomly parameterised predicate (e.g. "x is divisible by 3"), is `∀x∈D, P(x)` / `∃x∈D, P(x)` True or False? | `genQuantifierQuestion()` |

Every field — variables used, truth assignment, operators, domain size and values, predicate parameters — is produced with `Math.random()` at generation time, so the same round is extremely unlikely to repeat across games.

## 7. Mapping to the ISE-2 rubric

- **Mathematical rigor (3.0):** `logic-engine.js` is a real recursive-descent parser with standard precedence (¬ highest → ∧ → ∨ → → → ↔ lowest) and is unit-testable in isolation from the UI; truth tables and the quantifier evaluator are computed from it directly.
- **Gamification / UI interactivity (2.5):** live truth-table builder, quantifier explorer, and a timed multiplayer duel with a live scoreboard, timer bar, and round reveal.
- **Software architecture & code quality (2.5):** the logic engine has zero UI or Firebase dependencies and is shared by both pages; dynamic/random inputs are used everywhere per the "no hardcoded scenarios" requirement; the project needs no build tooling, keeping the repo easy to review.
- **Live demo & viva (2.0):** `game.html` is playable end-to-end on two or more phones/laptops at once, which makes a strong live classroom demo.

## 8. Suggested additions for your 2-page report

- A screenshot of the Learn page's truth-table builder with a formula you typed yourself.
- A screenshot of the quantifier explorer with a custom domain/predicate.
- A screenshot of a live multiplayer round (ideally with 2+ devices visible).
- A short architecture diagram: `Browser (Learn) → logic-engine.js` and `Browser (Host/Players) ↔ Firebase Realtime Database ↔ logic-engine.js + game.js`.

## 9. Known limitations (good viva talking points)

- Host migration isn't implemented: if the host disconnects mid-game, the room stalls until they reconnect (the `connected` flag still updates, but no client takes over hosting). A natural "Phase 5" extension.
- Database Rules here trust any signed-in anonymous user to write most of a room's state; a stricter version would validate writes against `rooms/$roomCode/hostId` for host-only fields.
- Scoring is a simple accuracy + speed formula; it could be extended with streak bonuses or difficulty weighting.
