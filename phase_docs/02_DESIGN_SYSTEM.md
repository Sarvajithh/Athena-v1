# 02_DESIGN_SYSTEM.md — Project Athena
### Desktop application behavior and visual system. Governs `athena-app`'s Tauri shell and the React/TypeScript presentation layer only — introduces no new screens, no new tables, no new interaction category beyond what `MASTER_SPECIFICATION.md` §5 and §4.8 already settled.

**Standing:** subordinate to `MASTER_SPECIFICATION.md` §5 (UI Philosophy) and `PROJECT_RULES.md`, per `PROJECT_RULES.md` §0. Every non-cosmetic choice below cites the section of either document that justifies it, per Immutable Rule #8.

---

## 1. Visual Philosophy

Athena is not decorated, it is *instrumented*. The screen is a panel of true facts, ranked. Nothing on it exists to look impressive; everything on it exists so that a glance answers "what do I do next" (§5.1's governing test, kept verbatim).

The "purple futuristic" direction is read as an **accent identity, not a theme** — it does not relax §5.1's rule that Athena uses *"a neutral low-saturation palette with one accent color reserved for the one thing that matters."* Futurism here means precision, not saturation: a near-black instrument panel, hairline structure, monospaced numerics, and exactly one violet signal color that only ever appears where it's earned. A screen that is mostly purple has diluted its own accent into wallpaper — the opposite of the intent.

Three words govern every visual decision: **quiet, exact, singular.** Quiet — low chroma everywhere except the one signal. Exact — numbers are typographically the loudest thing on any screen (§5.1). Singular — one ranked answer per screen, never a grid of competing claims for attention.

---

## 2. Color System

### 2.1 Base (neutral, low-saturation — §5.1)

| Token | Value | Use |
|---|---|---|
| `--surface-0` | `#0B0B0F` | App background (near-black, not pure black — avoids OLED crush and keeps hairlines visible) |
| `--surface-1` | `#131318` | Card/panel background |
| `--surface-2` | `#1B1B22` | Raised element (hover, active row) |
| `--border-hairline` | `#26262F` | 1px structural dividers only |
| `--text-primary` | `#EDEDF2` | Primary reading text |
| `--text-secondary` | `#8E8E9C` | Metadata, timestamps, labels |
| `--text-tertiary` | `#5A5A66` | Disabled, placeholder |

### 2.2 The Accent (one color, reserved — §5.1)

| Token | Value | Use |
|---|---|---|
| `--accent-violet` | `#8B5CF6` | The single accent. Reserved exclusively for: the Priority Resolution verdict on **Now**, the active/focused Command Palette row, primary action affordances, and the app's own identity (icon, splash wordmark). |
| `--accent-violet-dim` | `#4C3480` | Accent at rest / 40% context (borders, subtle glows) — never a second competing accent, only the same hue at lower emphasis |
| `--accent-violet-glow` | `rgba(139, 92, 246, 0.18)` | Soft outer glow on the single most important element per screen only. Never applied to more than one element at once — a glow on everything is a glow on nothing. |

If a future screen wants "something to stand out," the answer is never a second accent color — it's asking whether that element actually deserves the one accent, per §5.1's "the one thing that matters."

### 2.3 Severity (corrected per §1.2 — severity is always visually distinguishable, muted ≠ hidden)

| Token | Value | Use |
|---|---|---|
| `--severity-watch` | `#5EB3D6` (soft blue-grey dot) | `drift_signals.severity = watch` |
| `--severity-flag` | `#D6A85E` (soft amber dot) | `severity = flag`, the UI docs' own "single soft amber dot" pattern, adopted per §1.2 |
| `--severity-urgent` | `#D65E5E` (desaturated red, never neon) | `severity = urgent`, real `apply_by` proximity — rendered distinctly, never suppressed for calm's sake (§1.2 explicitly strikes the "never red" rule) |

Severity color is never used as a background fill or a full-card treatment — always a small, fixed-size dot or hairline border. This is what keeps "distinguishable" from becoming "alarming": the *information* is unmistakable, the *treatment* stays quiet.

### 2.4 Confidence (§6.3)

`confirmed` renders in `--text-primary` with no annotation. `inferred` renders with a `--text-secondary` "hypothesis" tag beside it. `insufficient_data` renders as a labeled empty state, never a guessed value — this is a typography/content rule, not a color rule, and no color is allowed to substitute for the explicit label.

---

## 3. Typography

One typeface family, two weights — kept exactly per §5.1.

- **Family:** a single geometric-grotesk with a genuine monospaced numeral variant (e.g. Inter for prose, its tabular-figure numeral set for all numbers). Numbers never use the proportional variant — trajectory deltas, CGPA, ratings, and countdowns must align in a column.
- **Weights:** Regular (400) for all body/label text, Semibold (600) for the one ranked verdict and screen-level numbers only. No Bold, no Light, no italics — a third weight is a second visual system.
- **Scale** (desktop, 1x):

| Role | Size | Weight | Line height |
|---|---|---|---|
| Verdict number (Now's primary metric) | 40px | 600 | 1.1 |
| Screen title | 20px | 600 | 1.3 |
| Card heading / recommendation text | 15px | 400 | 1.5 |
| Body / reasoning sentence | 14px | 400 | 1.6 |
| Metadata / timestamp / freshness note | 12px | 400 | 1.4 |

- **Numbers are always the largest thing on their screen** (§5.1) — a CGPA figure or a countdown is never visually subordinate to its own label.

---

## 4. Spacing

An 8px base unit, used exhaustively — no arbitrary pixel values anywhere in the frontend.

| Token | Value | Use |
|---|---|---|
| `--space-1` | 8px | Icon-to-label gaps |
| `--space-2` | 16px | Inline element spacing |
| `--space-3` | 24px | Card internal padding |
| `--space-4` | 32px | Between cards |
| `--space-5` | 48px | Screen-edge margin (desktop) |
| `--space-6` | 64px | Above the primary verdict on **Now** |

Generous spacing is a stated part of §5.1's kept visual language — the instinct is that whitespace itself communicates "this is the only thing here," reinforcing the max-5-visible-items collapse rule (below).

**Max 5 visible items before collapse** (§5.1, kept verbatim): any list — deadlines, drift signals, decisions — renders at most 5 rows before a `+N more` affordance (the one genuinely useful pattern kept from the cut Weekly Planner screen, per §5.3) replaces the remainder. This is enforced as a component-level rule, not a per-screen judgment call.

---

## 5. Motion

Slow, physical, never bouncy or urgent-reading — kept verbatim from §5.1.

- **Easing:** `cubic-bezier(0.2, 0.0, 0.0, 1.0)` (a settle, not a spring) for all transitions. No overshoot, no elastic curves — those read as urgency or playfulness, both wrong for an instrument panel.
- **Durations:** 120ms for hover/focus state changes, 220ms for card enter/exit and density toggles, 320ms for screen transitions. Nothing above 400ms — slow ≠ sluggish.
- **What is allowed to animate:** opacity and transform (translate/scale) only. Layout-affecting properties never animate — no janky reflow.
- **What never animates:** severity dots (they appear/disappear instantly — a fading urgent signal is a contradiction), the Challenge Dialog's entrance (see §7 — it should register as a genuine interruption, not a slide-in that can be visually dismissed as "just more UI"), numeric verdict changes (the new number simply replaces the old one on next render; counting-up animations imply gamified progress, rejected per §11).
- **The single permitted signature flourish:** on **Now**, when the ranked verdict changes to a new item, the accent glow (`--accent-violet-glow`) cross-fades from the old card to the new one over 320ms. This is the one moment "futuristic" is allowed to show itself as motion, and it happens at most once per verdict change — never as ambient/looping animation. Ambient looping motion (particles, pulsing backgrounds) is explicitly rejected: it's decoration competing with signal, which is the exact failure mode §5.1 exists to prevent.

---

## 6. Window, Sizing, and Responsiveness

- **Default window:** 1280×800, resizable, remembers last size/position per-OS (native window state, not app-level logic — this is a Tauri shell concern, not `athena-domain`).
- **Minimum window:** 960×640. Below this, the four-screen layout cannot maintain the max-5-collapse rule with legible spacing — the app clamps rather than reflowing into a cramped, decision-hiding layout.
- **No responsive breakpoints beyond a single collapse point** at 1100px width, where Trajectory's three-zoom-level view stacks its swimlanes vertically instead of side-by-side. Athena is a desktop app for one user on their own machine (§4.7, §3.1 non-negotiable §8) — it is not designed for arbitrary viewport sizes the way a web product is, and building a full responsive grid system is speculative generality the product doesn't need (§2, Coding Principles, "no speculative generality").
- **Multi-monitor:** the window is a normal OS window; no custom multi-window UI (a second "always-on-top mini Now" panel is a plausible Future Feature, not v1 — it would need its own citation and isn't requested here).

---

## 7. Desktop Chrome: Icon, Splash, Tray

- **Icon:** the accent violet, `#8B5CF6`, on the near-black surface — a single geometric mark (e.g., a minimal ranked-bar or vector glyph), not a literal illustration. Must render legibly at 16px (taskbar) through 512px (installer) — tested at both extremes before shipping, since `CURRENT_CONTEXT.md` already flags the current icon set as an empty placeholder blocking packaging.
- **Splash screen:** near-black `--surface-0`, the wordmark "Athena" in Semibold at the verdict-number size, with the accent-violet glow fading in over 320ms and holding until the SQLite migration check and IPC bootstrap (`get_app_version` round-trip) both resolve. No loading bar, no percentage — a determinate progress indicator for a sub-second local bootstrap is theater, not information (this is the same "no false signal" instinct as §3.1 non-negotiable #5, applied to chrome rather than data).
- **System tray:** cross-platform via Tauri's native tray API (§1.6 — Windows/macOS/Linux, not Windows-only). Tray icon uses the same mark; a severity dot overlay (using the §2.3 severity colors) appears on the tray icon only when an `urgent` item exists — this is a delivery channel for an already-typed `Alert` object (Engineering Guideline #3), never a bare OS notification string.

---

## 8. Command Palette

**A user-invoked overlay, keyboard-summoned only (`Cmd/Ctrl+K`), never system-triggered.** This is the load-bearing distinction that keeps it compliant with §1.3: the "no modals" rule and its two named exceptions (Challenge Dialog, Deep Work Guard override) govern *system-initiated interruption* — "Athena never interrupts" is about the system imposing a blocking moment on the user unprompted. A command palette the user opens and closes at will, for navigation and existing typed actions, is categorically different — it interrupts nothing, because the user is the one who summoned it. It is not a fifth screen (§4.8's "four screens, no more" stands); it is a cross-screen input method, the same category as a keyboard shortcut.

**What it can do:**
- Navigate to any of the four screens.
- Jump to a specific entity already in the schema — a course, a deadline, a decision in the log, a drift signal (fuzzy-matched by name/title). It never creates an ungrounded free-text entity; every result is a real row.
- Trigger an existing typed command — log a grade snapshot, log a DSA session, open Semester Setup, open the Decision Log filtered to a semester. It calls the same typed Commands the UI buttons call (§4.6) — it is a second entry point to existing commands, never a parallel code path.
- Toggle screen density (Calm/Detail, §5.1).

**What it cannot do:** free-text "quick capture" of an untyped item. §1.4 and §5.3 already rejected Quick Capture as a re-introduction of a general task manager; a command palette that accepts arbitrary text and "figures out what you meant" is exactly that feature wearing a different UI, and is rejected on the same grounds — no schema table exists to receive it (§7.3).

**Visual treatment:** centered overlay, `--surface-1` panel, `--accent-violet` reserved for the focused row only, 220ms fade/scale-in. Dismisses on `Esc` or click-outside — trivially, since it interrupts nothing, unlike the Challenge Dialog.

---

## 9. Keyboard Shortcuts

Kept minimal, per §3.2.11 ("minimal surface, maximum signal — fewer, denser, higher-signal touchpoints"). A shortcut for every possible action is its own kind of sprawl.

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+K` | Open Command Palette |
| `1` / `2` / `3` / `4` | Jump to Now / Trajectory / Semester Setup / Decision Log (only active when palette is closed and focus isn't in a text field) |
| `D` | Toggle Calm/Detail density on the current screen |
| `Esc` | Dismiss Command Palette or any dismissible inline prompt — never dismisses the Challenge Dialog, which requires an explicit confirm/revise/cancel choice (§4.6) |
| `Cmd/Ctrl+Z` | Undo the last reversible action (§5.1's "undo on reversible actions") |

No shortcut exists for anything the Decision Challenge Layer or Deep Work Guard can block — a keyboard shortcut that bypasses an interceptor would silently violate §4.6's "commands fail closed" guarantee.

---

## 10. Transitions Between Screens

Screen-to-screen navigation (via palette, number key, or in-app link) crossfades the outgoing screen's content out (120ms) before the incoming screen's content fades/settles in (220ms) — never a slide or push transition, which implies spatial adjacency the four screens don't actually have (they're not tabs in a sequence, they're four independent instruments). The persistent chrome (nav affordance, tray-adjacent status) does not transition at all — only content.

Within a screen, density toggles (Calm ↔ Detail) animate row insertion/removal at 220ms with height auto-adjusting via transform, not reflow-jank.

---

## 11. What This Document Deliberately Does Not Specify

Per the Refactoring Rules' discipline of stating what doesn't change even outside a refactor context: this document does not touch component architecture, state management, or the IPC binding layer — those are `athena-app`/frontend engineering concerns, not design-system concerns, and belong in an implementation PR, not here. It also does not add a fifth screen, a settings surface, or a notification-preference matrix — §4.8 rules those out categorically, and nothing above should be read as reopening that.
