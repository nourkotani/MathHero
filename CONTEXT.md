# MathHero — Domain Glossary

A self-contained, offline 3D math practice game for kids — multiplication, division, function machines, and number patterns, all built on times tables 1–12 — with DBZ-inspired power-up spectacle.

## Terms

### Skill
The kind of math a Round trains: **Multiply** ✖️, **Divide** ➗, **Machine** ⚙️ (crack the secret rule of an input→output machine), or **Pattern** 🔁 (continue or name a number sequence). Chosen on the Pre-round screen before Difficulty. All Skills draw from the same Facts; each Skill tracks its own mastery data and Personal Bests, while XP / Hero Level is one shared pool fed by every Round regardless of Skill. Each Skill defines how a Fact is worn (displayed) and graded, its base-point scale, and its mastery window — adding a future Skill means defining those, nothing else forks.

### Player
A named profile (e.g., the daughter, her sibling). Created once, then selected before each Round. Owns a character appearance (chosen colors), a Hero Level, XP, mastery data, and Personal Bests. Multiple Players share one Save File. Players can be renamed and deleted from the Title screen (delete requires a strong confirmation; it permanently erases that hero).

### Round
One timed play session: a Player answers Questions until the timer expires. Configured by a Skill, a Difficulty, and a timer length (default 2 minutes, settable 30 seconds–10 minutes). Produces a score.

### Question
A single prompt for the active Skill (e.g., "7 × 8" when Multiplying, "56 ÷ 8" when Dividing — division answers are always exact, never remainders). Machine Questions show the machine's example rows for inputs 1, 2, 3 and ask for the output of a **jump input** drawn from 5–12 (so the rule must actually be found, not just extended). Pattern Questions show 4 terms of the sequence and ask for the 5th. Compute Questions are answered by typing the number (on-screen number pad or keyboard) and **explicitly submitting** via Enter or a big ✓ button (backspace allowed; the ✓ doubles as the "fire the blast" trigger); roughly 1 in 3 Machine and Pattern Questions are Name-the-Rule Questions instead. A wrong answer costs no points, breaks the Power Streak, and briefly shows the correct answer (or the true Secret Rule) before the next Question. When the Round timer hits zero, the Round ends instantly and any in-progress Question is voided. The countdown is always visible and pulses during the final 10 seconds.

### Secret Rule
The hidden transformation inside a Machine or Pattern Question — what the child plays detective to find. Machine rules are always two-step: `(Input × m) + c`, where {m, c} is the Fact. Pattern rules are "add d each time" (skip-counting), or the geometric twist "multiply the previous term by 2 (or 3)".

### Name-the-Rule
The second answer modality, exclusive to Machine and Pattern (Multiply and Divide have no rule to name). Instead of the number pad, the child picks the Secret Rule from **3 big rule cards** (tap, or keys 1–3) — distractors are classic traps like the swapped pair (`× 2 then + 3` vs `× 3 then + 2`) or a one-step rule that fits only the first row. Mixed into Rounds at random (~1 in 3), never a separate mode. Same base points as that Skill's compute Questions (guessing is punished by losing the Power Streak); the attempt records into the same Fact's mastery.

### Fact
A commutative factor pair treated as a single unit of mastery: 7×8 and 8×7 are **one Fact**, displayed in either order at random. Tables 1–12 therefore contain 78 Facts, and every Skill wears the same Fact its own way, in either role at random:
- **Multiply** wears {7, 8} as "7 × 8" or "8 × 7".
- **Divide** wears it inside-out: "56 ÷ 8" or "56 ÷ 7".
- **Machine** wears it as the two-step Secret Rule `(Input × 7) + 8` or `(Input × 8) + 7`.
- **Pattern** wears it as the skip-count sequence "7, 15, 23, 31, …" (start 7, add 8) or "8, 15, 22, 29, …" (start 8, add 7). As a twist, Facts containing a 2 or 3 sometimes wear it geometrically — "5, 10, 20, 40, …" (multiply the previous term by 2 or 3); the digit cap keeps every such term ≤ 3 digits.

Mastery of a Fact is tracked **independently per Skill** — knowing 7×8 does not pre-master 56÷8 or the ×7+8 Machine.

### Difficulty
Determines which times tables are in play, identically for every Skill — the ranges and weights apply to the underlying Fact pair, however it is worn. "Tables N–M" means **one operand comes from N–M and the other from 1–12** (the way school teaches a times table):
- **Easy** — tables 1–5, 10 base points
- **Medium** — tables 2–9, 20 base points
- **Hard** — tables 2–12, 30 base points; Facts whose operands are *both* ≥ 6 get double base sampling weight

Base points scale with the Skill's **base-point scale** — Multiply/Divide ×1, Pattern ×2, Machine ×3 — so the slower detective Skills still pay fair XP per minute of training.

### Power Streak
Consecutive correct answers *within one Round*. The score multiplier and the visual intensity are **one unified system** — powering up and multiplying points are the same event. A Streak never changes *which* Form the hero is in; it turns that Form's own power up:

| Streak | Multiplier | Intensity |
|---|---|---|
| 0–2 | ×1 | At rest — the hero's Form glows quietly |
| 3–5 | ×2 | The aura ignites |
| 6–9 | ×3 | Hair blazes, energy crackles |
| 10+ | ×4 | Full power — the aura roars and every correct answer fires an energy blast |

A wrong answer drops the hero back to rest and ×1. Resets at the start of every Round; never persisted.

### Form
The hero's earned state of power, unlocked by Hero Level and worn **permanently** — a Form is who the hero *is*, while the Power Streak is how hard they are pushing right now. Each Form sets the hero's hair color and shape, eye color, aura color and character (jagged and fierce, or smooth and calm), and whether energy arcs crackle and bright motes rise around them. Six Forms are earned across the climb, each at a Landmark Level:

| Level | Form | Look |
|---|---|---|
| 0 | (the hero's own) | Their chosen colors, no aura at rest |
| 10 | **Gold Spark** | Golden hair and a golden flame |
| 25 | **Storm Gold** | Gold with blue energy arcs crackling around it |
| 50 | **Wild Mane** | A long, wild mane and a towering aura |
| 70 | **Crimson Sage** | Deep crimson, calm and smooth instead of jagged |
| 85 | **Rose Dawn** | Rose and violet, with bright motes rising |
| 100 | **Legend** | Silver-white, serene, endlessly shimmering |

The hero's chosen hair color is who they are underneath: it shows at Hero creation, on the Title screen, and at rest before the first Form is earned.

### XP / Hero Level
XP equals total points scored: every Round's final score is added to the Player's lifetime XP. Levels 1–30 cost 500 XP each; above 30 every level costs 25 XP more than the one before it, so the climb steepens toward the cap. **Level 100 is the cap** — XP keeps accumulating past it, but the level stays 100. Levels never reset. Every level slightly intensifies the character's permanent glow/particles; every 5th level automatically unlocks a cosmetic tier, and the six Landmark Levels each unlock a new **Form**. Early tiers add new pieces (aura ring, energy crown, lightning wisps, energy wings, comet trail, twin halo); from level 35 on, each tier **evolves** one of those pieces into a grander form instead of stacking another on, so a veteran hero reads sharper, never cluttered. There is no shop or currency — unlocks are automatic.

### Landmark Level
Hero Levels 10, 25, 50, 70, 85, and 100 — the levels where the hero earns a new **Form**. These transform the hero's whole presence rather than upgrading a single piece, and are celebrated with a full transformation scene in the Results ceremony (regular level-ups keep the quicker celebration). Level 100 is **Legend**: the hero's final, permanently radiant Form.

### Adaptive Selection
Question picking is weighted random: Facts the Player answers wrongly or slowly appear more often until mastered. Runs on the active Skill's own attempt data. The same question never appears twice in a row. A Fact is **mastered** when its last 3 answers were all correct and each beat the Skill's **mastery window** — the pace that counts as fluent for that Skill: ~6 seconds for Multiply/Divide, ~15 for Pattern, ~25 for Machine. A wrong answer un-masters it.

### Practice
An alternative to Difficulty on the Pre-round screen: the Round asks only one chosen table (1–12) of the active Skill — "8×" when Multiplying, "÷8" when Dividing, "×8 machine" for Machine (every rule is ×8 + something), "by 8s" for Pattern (count by 8s — pure skip-counting; the geometric twist never appears in Practice). Difficulty tiers and weights don't apply; scoring uses Easy base points (times the Skill's base-point scale). One table picker serves every Skill.

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
