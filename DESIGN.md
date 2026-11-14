# Chromafy design system

**The world, in another light.** Chromafy's interface is warm paper and deep ink. The colour belongs
to the photographs and to the four worlds. The chrome stays quiet so that a transformed photo is
always the loudest thing on screen.

The landing page is built as *colour chapters*: each section is one flat field of colour.
No brand's logo, typeface, palette or layout is reproduced.

## 1. Principles

1. **Photographs carry the colour.** UI surfaces are paper and ink. Saturated colour appears only as
   a mood's own field, the single violet action, or a photograph.
2. **One accent, one job.** Violet marks the primary action and the current selection. Nothing else.
3. **Chapters, not cards.** On the landing page each section is one flat field of colour, edge to
   edge, separated by a hard colour change, not a line or shadow.
4. **Truthful imagery.** An unedited photo is never shown as a result. Results appear only after
   a real transformation, and are always labelled *Original* and *Reimagined*.
5. **Calm motion.** Motion confirms a change of state (a mood chosen, a result revealed), never decorates.

## 2. Colour tokens

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#FBF8F2` | Page ground (warm off-white) |
| `--paper-2` | `#F3EEE4` | First tone step: panels, rails, footer |
| `--paper-3` | `#E8E1D3` | Second step: wells, pressed neutral controls |
| `--ink` | `#1A1726` | All running text and headings (≈16:1 on paper) |
| `--ink-2` | `#4B4658` | Secondary notes only (≈8:1 on paper) |
| `--accent` | `#5B3FD9` | Primary action, selected state, focus ring |
| `--accent-press` | `#4A30BE` | Accent hover / pressed |
| `--accent-soft` | `#ECE7FB` | Selected option ground |
| `--on-accent` | `#FFFFFF` | Text on accent (≈6.6:1) |
| `--danger` | `#9F2D27` | Error text and icon, always with words |
| `--success` | `#1D6A4C` | Completion text, always with words |

**Mood fields** (from `src/lib/config/moods.ts`, used as landing-page chapter colours and as
mood-option swatches):

| World | Field | Ink on field |
| --- | --- | --- |
| Golden | `#EDB458` | `--ink` |
| After Rain | `#1F5F58` | `--paper` |
| Old Soul | `#7C3A2D` | `--paper` |
| Daydream | `#E6D3EE` | `--ink` |

Rules: never a gradient, except a neutral scrim under text on a photo. Never grey running text.
Neighbouring fields must differ clearly in lightness. Status is never shown by colour alone.

Violet is the brand colour and the only accent.

## 3. Typography

One family in two cuts, self-hosted through `next/font`:

- **Display:** Stack Sans Headline, weight 300, tracking −0.022em, leading 1.02–1.05, sentence case.
- **Text:** Stack Sans Text, 400 for body, 500 for emphasis and controls, leading 1.5.

| Step | Size | Use |
| --- | --- | --- |
| `--step-small` | 14px | Captions, labels, meta rows (never below 13px) |
| `--step-body` | 17 to 19px | Running text, controls |
| `--step-lead` | 20 to 26px | Statements, mood names in the studio |
| `--step-head` | 32 to 64px | Section headings, the world index |
| `--step-display` | 56 to 132px | Hero headline, the call-to-action word |

Five sizes is the ceiling. Headlines stay at two lines or fewer at every width. No eyebrows, no
monospace, no tracked uppercase labels, and no italic or coloured accent words.

## 4. Space and layout

- 8px base unit with 4px half-steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Page margin `--gutter: clamp(16px, 2.5vw, 32px)`, 12-column grid, max content width 1440px.
- Landing chapters are at least 90svh tall where they hold a full composition. The gap between
  chapters is a colour change, not empty space.
- The studio uses a canvas + rail split (8 / 4 columns) on desktop and a single column on phones,
  with the canvas first.

## 5. Shape and depth

- **Radii:** `--radius-media: 12px` (photos, comparison frames), `--radius-surface: 20px` (studio
  panels), `--radius-shell: 28px` (outer bezel), `9999px` (buttons and segmented controls). No
  other values.
- **Double bezel (studio only):** the canvas sits in an outer shell (`--paper-2`, 8px padding,
  28px radius) holding an inner core with a 20px radius. This is the one nested device.
- **Shadows:** nothing at rest. `--shadow-float: 0 1px 2px rgb(26 23 38 / .06), 0 8px 24px rgb(26 23 38 / .10)`
  only for things that genuinely float: the comparison handle and toasts.
- No glass, no backdrop blur, no hairline grids, no decorative blobs.

## 6. Components

- **Primary button:** pill, `--accent` fill, `--on-accent` label 16px/500, minimum height 48px,
  a trailing icon nested in its own 32px circle that nudges up and right on hover, and scale 0.98
  when pressed. One per view.
- **Secondary button:** pill, `--paper-3` fill, ink label. **Quiet button:** text with an icon,
  underline on hover.
- **Mood option:** a radio card with the world's four swatches as a flat strip, its name at the
  lead step and its feeling at the small step. When selected it gets an `--accent-soft` ground, a
  2px accent ring and a check icon, so the state is never shown by colour alone.
- **Dropzone:** a large paper-3 well inside the bezel, with the drop instruction, a visible
  "Choose a photo" button and the accepted formats and size in plain text.
- **Comparison:** draggable slider (`role="slider"`, arrow keys, Home/End) with *Original* and
  *Reimagined · World* labels on photo-safe pills. A segmented control switches to side by side.
- **Icons:** Lucide at `strokeWidth={1.5}`, 20 to 24px. The thin stroke keeps icons
  light next to the type.
- **Focus:** a 2px `--accent` outline at a 3px offset on every interactive element.

## 7. Motion

- Easing `--ease-out: cubic-bezier(0.32, 0.72, 0, 1)`. Durations 160ms for feedback, 300ms for
  state, 600 to 800ms for entrances.
- Entrances: heading, then text, then picture, staggered by 70ms, rising 24px with opacity, once,
  as each section enters the viewport.
- Signature move: the world stage's field cross-fades to the chosen mood's colour (300ms).
- One moving picture: the hero photograph drifts in scale very slowly.
- Processing: a soft band of light passes across the original. No percentages, no fake progress.
- `prefers-reduced-motion`: all travel and drift are removed. Opacity changes remain and content is
  always visible without script.

## 8. Logo

The wordmark is "chromafy" in Stack Sans Headline at weight 400 with tight tracking. The symbol is
an original prism: a small upright triangle whose single white ray leaves as four short bands in the
four world colours. It is inline SVG (`src/components/layout/logo.tsx`), so no external asset is needed.

## 9. Voice

Plain, warm and exact. Use short sentences. Never claim the AI detected or changed specific objects.
Use "We asked for…" when describing a result. Never use exclamation marks in errors.
