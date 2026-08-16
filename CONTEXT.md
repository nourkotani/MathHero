# MathHero — Domain Glossary

A self-contained, offline 3D math practice game (times tables 1–12 and their division inverses) for kids, with DBZ-inspired power-up spectacle.

## Terms

### Skill
The operation a Round trains: **Multiply** or **Divide**. Chosen on the Pre-round screen before Difficulty. Both Skills draw from the same Facts; each Skill tracks its own mastery data and Personal Bests, while XP / Hero Level is one shared pool fed by every Round regardless of Skill. Adding a future Skill means defining how it displays and grades a prompt — nothing else forks.

### Player
A named profile (e.g., the daughter, her sibling). Created once, then selected before each Round. Owns a character appearance (chosen colors), a Hero Level, XP, mastery data, and Personal Bests. Multiple Players share one Save File. Players can be renamed and deleted from the Title screen (delete requires a strong confirmation; it permanently erases that hero).

### Round
One timed play session: a Player answers Questions until the timer expires. Configured by a Skill, a Difficulty, and a timer length (default 2 minutes, settable 30 seconds–10 minutes). Produces a score.

### Question
A single prompt for the active Skill (e.g., "7 × 8" when Multiplying, "56 ÷ 8" when Dividing — division answers are always exact, never remainders). Answered by typing the number (on-screen number pad or keyboard) and **explicitly submitting** via Enter or a big ✓ button (backspace allowed; the ✓ doubles as the "fire the blast" trigger). A wrong answer costs no points, breaks the Power Streak, and briefly shows the correct answer before the next Question. When the Round timer hits zero, the Round ends instantly and any in-progress Question is voided. The countdown is always visible and pulses during the final 10 seconds.

### Fact
A commutative factor pair treated as a single unit of mastery: 7×8 and 8×7 are **one Fact**, displayed in either order at random. The Divide Skill wears the same Fact inside-out: {7, 8} appears as "56 ÷ 8" or "56 ÷ 7" at random. Tables 1–12 therefore contain 78 Facts. Mastery of a Fact is tracked **independently per Skill** — knowing 7×8 does not pre-master 56÷8.

### Difficulty
Determines which times tables are in play and the base points per correct answer, identically for every Skill — the ranges and weights apply to the underlying Fact pair, however it is displayed. "Tables N–M" means **one operand comes from N–M and the other from 1–12** (the way school teaches a times table):
- **Easy** — tables 1–5, 10 base points
- **Medium** — tables 2–9, 20 base points
- **Hard** — tables 2–12, 30 base points; Facts whose operands are *both* ≥ 6 get double base sampling weight

### Power Streak
Consecutive correct answers *within one Round*. The score multiplier and the visual transformation are **one unified system** — transforming and multiplying points are the same event:

| Streak | Multiplier | Transformation |
|---|---|---|
| 0–2 | ×1 | Base form |
| 3–5 | ×2 | Aura ignites |
| 6–9 | ×3 | Glowing hair, crackling energy |
| 10+ | ×4 | Super mode — golden aura, energy blast per correct answer |

A wrong answer drops the character back to base form and ×1. Resets at the start of every Round; never persisted.

### XP / Hero Level
XP equals total points scored: every Round's final score is added to the Player's lifetime XP. Hero Level N requires `N × 500` cumulative XP. Levels never reset. Every level slightly intensifies the character's permanent glow/particles; every 5th level automatically unlocks a major cosmetic tier (new aura color, energy crown, lightning wisps, energy wings, …). There is no shop or currency — unlocks are automatic.

### Adaptive Selection
Question picking is weighted random: Facts the Player answers wrongly or slowly appear more often until mastered. Runs on the active Skill's own attempt data. The same question never appears twice in a row. A Fact is **mastered** when its last 3 answers were all correct and each took under ~6 seconds; a wrong answer un-masters it.

### Practice
An alternative to Difficulty on the Pre-round screen: the Round asks only one chosen table (1–12) of the active Skill — "8×" when Multiplying, "÷8" when Dividing. Difficulty tiers and weights don't apply; scoring uses Easy base points. One table picker serves every Skill.

### Mastery Grid
A per-Player 12×12 times-table chart on the Title screen, coloring each Fact green/yellow/red by mastery state — a progress report for the parent, driven by the same data Adaptive Selection uses. A Skill toggle (defaulting to the session's active Skill) switches which Skill's mastery it shows.

### Training Dummy
A cosmetic opponent in the arena. Every correct answer zaps/knocks it back; super-mode blasts launch it dramatically. It has no health bar and no effect on scoring — the score is purely about math.

### Personal Best
A Player's highest Round score, tracked separately per Skill × Difficulty. Beating one triggers its own celebration.

### Family Leaderboard
Cross-Player comparison of Personal Bests, shown on the main menu; each Player's best is shown per Skill side by side.

### Save File
A single JSON document containing every Player's data. Lives in browser localStorage during play; the Player can export it to / import it from a `.json` file on disk via explicit menu buttons on the Title screen. If more than 7 days pass since the last export, the game shows a gentle "back up your heroes!" reminder. The game runs fully offline from a static HTML file — no server, no internet.

### Screens
Title (player select, Family Leaderboard, New Hero, settings: export/import + sound toggle) → Hero creation (new players only) → Pre-round (skill + difficulty + timer + Start) → Round (3D arena) → Results (score, best streak, XP gained, level-up ceremony, personal-best celebration) → back to Title.

### Sound
All effects are synthesized in-browser (no audio asset files): power-up hums, hit zaps, level-up fanfares. Mute toggle on the Title screen. No background music.

### Character
An original, procedurally built anime-style 3D hero (no licensed assets). DBZ-*inspired*, not DBZ. At Hero creation the Player picks a name plus hair color and outfit primary/secondary colors from a curated bright preset palette (no free color wheel). Milestone cosmetics earned via Hero Level layer on top of this chosen identity.
