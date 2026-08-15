# MathHero ⚡

Heyyy! Welcome to the arena! I'm SO glad you're here — we're gonna train your brain until your times tables are UNSTOPPABLE!

MathHero is a 3D multiplication game (times tables 1–12) that lives in **one single HTML file**. No install. No internet. No account. You download it, you open it, you POWER UP. That's it!

## 🥋 Wanna play? Here's how!

1. Grab **`MathHero.html`** from the [latest release](https://github.com/nourkotani/MathHero/releases/latest).
2. Double-click it. It opens right in your browser — even with the Wi-Fi off!
3. Make your hero, pick a challenge, and GO GO GO!

Works great on a regular family computer. Keyboard or on-screen number pad — your choice, champ.

## 💥 What happens in there?!

Man, where do I start —

- **You build your own hero!** Girl or boy, spiky hair or a long ponytail, gi or battle armor, your colors, your skin tone — and you watch your hero change LIVE while you pick. So cool!
- **Every correct answer is an ATTACK!** Punches! Kicks! Energy blasts! Your hero unloads on the Training Dummy and sends it FLYING. (Don't feel bad for the dummy. The dummy loves it.)
- **The Power Streak is everything.** Answer 3 in a row and your aura IGNITES. Hit 6 and your hair starts glowing with crackling energy. Hit 10 and — ohhh you're not ready — **SUPER MODE**: golden flames and a giant energy blast on every single answer. Your points multiply the whole way up, ×2, ×3, ×4!
- **Get one wrong? Shake it off!** Your hero staggers, you see the right answer, and you jump back in. Every master was once a beginner — that's just training!
- **You LEVEL UP forever.** Every point you ever score builds your Hero Level. New aura colors, an energy crown, lightning wisps, energy wings… the stronger you get, the cooler you look. No shop, no coins — just training!
- **The game trains you where you're weakest.** It quietly notices which Facts slow you down (looking at you, 7×8) and brings them back until you've CRUSHED them. That's Adaptive Selection — it's like a sparring partner who knows all your openings.
- **Race your family!** Personal Bests for every Difficulty, and a Family Leaderboard so you and your sibling can battle for the top spot. Rivals make you stronger!
- **Practice mode** when you wanna spar without the clock, and Easy / Medium / Hard when you're ready for a real Round.

## 👨‍👩‍👧 For the grown-ups (hi, grown-ups!)

- **Fully offline, zero data collection.** One static HTML file, no server, nothing leaves the machine.
- **Multiple kids, one Save File.** Each Player has their own hero, level, and progress, saved in the browser. You can export the Save File to a `.json` from the Title screen (the game will gently nag you to back it up).
- **The Mastery Grid** on the Title screen shows exactly which of the 78 multiplication Facts each kid has mastered — green, yellow, red. It's a progress report disguised as a video game.
- Difficulty follows how school teaches tables: Easy is tables 1–5, Medium 2–9, Hard 2–12 (with extra weight on the tough stuff like 7s, 8s, and 9s).
- The hero and world are original, procedurally built 3D — inspired by classic power-up anime, with no licensed characters or assets.

## 🔧 For fellow builders

```bash
npm install
npm run check   # typecheck → lint → core tests → build → flow tests against the built file
npm run dev     # live dev server
```

`npm run check` must pass before every commit — there's no CI, the discipline IS the pipeline. The build produces the single playable file at `dist/MathHero.html`. Architecture notes live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), the domain glossary in [`CONTEXT.md`](CONTEXT.md), and decisions in [`docs/adr/`](docs/adr/).

---

Alright, enough reading — the arena's waiting! Seven times eight, GO!!
