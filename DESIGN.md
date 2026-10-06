# DESIGN.md

Design direction for `clock2`. This file is the source of visual character.
`antislop/SKILL.md` is the filter that applies it, not the source of direction.

## Identity

A 24 hour information board for Wonosalam Boarding School. Read from a distance,
watched by students and caregivers. Not a dashboard and not a landing page: one
screen that stays lit in a dim room.

## Personality

Calm and dependable. Quiet until something actually needs to be known. No
promotion, no urgency theatre.

## Palette

| Role | Value | Reason |
|---|---|---|
| Base | `#050a12`, `#0d1d31` | Slate black. An emissive screen in a dim room, not a document read at a desk. |
| Text | `#edf5ff` | Cold white, highest contrast against a dark wall. |
| Muted | `#a7bad4` | Secondary text, held above 4.5:1 on every surface it crosses. |
| Accent | `#8dd7ff` | Cyan. The only colour that is neither neutral nor status. Points at the next prayer. |
| Adhan status | `#85efac` | Green, and the only green. Every highlighted element carries it as text: the active prayer row, the adhan countdown label, the next prayer label. |
| Tint behind it | `rgba(133, 239, 172, 0.12)` | The single background wash for a highlighted row. It existed at three strengths plus a partly green bottom border before, so one state read as four different colours. |
| Live status | `#ff5f76` | Red. Appears only while a live announcement is actually running. |

Green and red are not decoration. Both carry status. When the status is not
happening, neither colour appears on the screen.

## Typography

- Time digits alternate every Jakarta minute: even minutes read Latin digits
  in Xirana, odd minutes read Arabic-Indic digits in Markazi Text Bold. Both
  faces ship inside `public/fonts`, so the board needs no internet on the LAN.
  Everything else stays on the system sans stack: no display typeface anywhere
  else on the screen.
- Arabic (mufrodat): Noto Sans Arabic. It is the teacher's language, not an
  ornament, so its typography has to be correct rather than decorative.
- Labels: the same sans, normal case, no wide letter spacing. Wide tracking is
  used only on the vertical clock in the vocab takeover, where the column is
  narrow and the characters really are small.

No display typeface beyond the clock digits. The screen stays lit for 24 hours, and a display face turns
into eye fatigue after a few hours. Character comes from size and colour
hierarchy, not from a typeface picked for looking fashionable.

## Theme

Dark, and fixed. The reason is concrete: a large screen in a dim room, plus the
21:00 to 03:00 night behaviour already built into `NightAmbientController`. A
light mode adds no capability for this use case, so it is not built.

## Dials

**ENERGY 1 / RHYTHM 2 / MOTION 2**

- **ENERGY 1.** Passive screen, read from a distance, it must not shout. Exactly
  one thing is allowed to dominate: the time.
- **RHYTHM 2.** Panel content genuinely differs in weight: the clock dominates,
  the prayer schedule is a reference, events and mufrodat are rotating content.
  Composition differs because content differs, while the page frame stays
  consistent.
- **MOTION 2.** The only continuous motion is motion the product cannot work
  without: the announcement marquee, the second hand, and the adhan status
  window. Every decorative loop is removed.

## Identity motif

One green text colour plus one shared background tint mark any element that is
currently in a state. No left rail: the green was already strong enough that a
rail beside it read as a second, brighter signal. Hairline rules divide rows and
stay neutral.

## Owner overrides (recorded)

- Rainbow conic edge glow in night mode kept per explicit owner request. Collides
  with R-01 (rainbow gradients). Scoped to the 21:00 to 03:00 night frame only,
  never in daytime operation.
- Cyan WebGL smoke on the two countdown tiles kept per explicit owner request
  (the InfernoCard shader). Collides with R-19 (endless loops) and the board's
  MOTION 2 rule that every decorative loop is removed. Scoped to countdown tiles
  that actually hold a date: an unset tile stays static, rendering pauses during
  night mode while the rail is hidden, and `prefers-reduced-motion` disables it
  the same way the ticker is disabled.

## The control console

`/admin` and `/control/vocab` are one document, not a tile grid. They share a
shell (`.console`) so an operator moving between them learns nothing new.

**ENERGY 1 / RHYTHM 1 / MOTION 0.**

- **ENERGY 1** again, for the same reason as the board, plus one more: this is
  a maintenance surface, not a product page. Nothing on it is trying to be
  looked at twice.
- **RHYTHM 1.** No panel competes with another. Sections are separated by
  hairline rules and run down one column, because the operator is walking a
  checklist, not comparing widgets. The previous layout was a two-column card
  grid, which forced a card per task and made the page taller than the work.
- **MOTION 0.** Nothing animates. There is no pending spinner, no entrance
  transition, no hover lift. A form that moves while being filled is a form the
  operator has to re-find.

Deliberate consequences:

- **Flat, not glass.** No backdrop blur, no translucent overlap, no gradient
  fill behind text. The console is read at arm's length on a desk, where blur
  costs contrast and buys nothing.
- **One radius value** (6px) for every input, button, and bordered box. Radius is
  not a hierarchy signal here, so it does not get to carry one.
- **Sticky index.** A section list pinned to the top of the scroll container, so
  jumping around a long page does not require scrolling back up. It carries the
  save result underneath it, because the page jumps to the edited section after
  every write and a notice pinned at the document top would be off screen. Links
  are grouped (Papan, Jadwal, Audio, Bahasa, Siaran) and each label repeats its
  section heading word for word, so the index never calls a thing by a second
  name. The jumped-to section answers back: its heading and its index link take
  the accent color through `:target` and `:has`, with no scroll-watching script.
- **Every write ends in a redirect** carrying a notice key and a section anchor.
  Without it the operator cannot tell a saved row from a failed one. See
  `lib/panel-notice.ts`.
- **One primary form per section.** Edit forms live in `<details>`, not expanded
  under every row, so the list stays a list.
- **Delete asks first**, and the confirm message names the row.

Green stays reserved for state: the `Aktif` tag on an enabled row. Nothing
decorative is green.

## Content

Screen language is split on purpose: the wall board reads full English,
the control console reads Indonesian. The board faces students and guests, so
prayer names use the English transliterations (Imsak, Fajr, Dhuhr, Asr,
Maghrib, Isha). Stored values stay Indonesian day names ('senin'..'minggu')
because that is what the schedule matching compares; only the rendered text
is translated. Panel labels do not repeat the heading, and no kicker sits
above a title.