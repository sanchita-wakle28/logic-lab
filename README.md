# Logic Lab

An interactive web application for learning and practicing propositional logic, predicate quantifiers, and discrete mathematics. Includes a self-paced study lab and a real-time multiplayer duel mode.

## Overview

Logic Lab was built to make formal logic concepts more visual and engaging. It combines interactive formula evaluation with dynamic visualization tools, allowing students to test expressions, generate truth tables, and race against classmates in live problem-solving rounds.

### Key Components

* **Concept Lab (`learn.html`)**: Evaluates propositional formulas using custom operators (`¬`, `∧`, `∨`, `→`, `↔`) and generates truth tables dynamically. Includes an interactive activity suite loaded from structured dataset files (`data/propositions.json`).
* **Predicate & Quantifier Evaluator**: Allows users to set predicate conditions $P(x)$ across custom numerical domains to test universal ($\forall$) and existential ($\exists$) quantifiers step-by-step.
* **Multiplayer Arena (`game.html`)**: Real-time room creation and score tracking powered by Firebase Realtime Database. Users can host or join lobbies across different networks (mobile data, Wi-Fi, or hotspots) using a generated 5-character room code.
* **Theme System**: Custom CSS design system supporting six distinct visual profiles (Neon, Cyberpunk Dystopia, and Cozy Y2K Pastel variants) with local storage persistence.

---

## Technical Stack

* **Frontend**: HTML5, CSS3, ES6+ JavaScript (native modules)
* **Realtime Backend**: Firebase Realtime Database
* **Typography**: Space Grotesk, Inter, JetBrains Mono, VT323

---

## Repository Structure

```text
├── index.html              # Landing page and navigation
├── learn.html              # Interactive study lab and truth table generator
├── game.html               # Multiplayer lobby and arena
├── css/
│   └── style.css           # Global stylesheet and theme configurations
├── js/
│   ├── logic-engine.js     # AST parser and truth table evaluation logic
│   ├── learn.js            # Learning activities and proposition classifier
│   ├── game.js             # Multiplayer state, timers, and lobby logic
│   ├── firebase-config.js  # Firebase instance setup
│   └── theme.js            # Theme switcher and persistence logic
└── data/
    └── propositions.json   # Question database for study activities
