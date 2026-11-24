---
name: Cobble AI
description: A course tutor proven by its citation.
colors:
  sol-blue: "#073dea"
  sol-blue-pressed: "#0532c4"
  sol-blue-400: "#4f75f7"
  sol-blue-300: "#6a8ff0"
  sol-blue-200: "#8fadeb"
  sol-blue-100: "#b0c8ee"
  sol-blue-50: "#d4e1f4"
  sol-blue-wash: "#eef3fd"
  white-smoke: "#f9f9f9"
  surface: "#ffffff"
  sunken: "#f2f2f3"
  sunken-2: "#e9e9eb"
  hairline: "#e4e4e7"
  hairline-strong: "#cdcdd2"
  charcoal-ink: "#000000"
  ink-2: "#282828"
  ink-3: "#5c5c62"
  ink-4: "#8e8e93"
  status-ready: "#10b981"
  status-attention: "#f59e0b"
  danger: "#dc2626"
  danger-text: "#b91c1c"
  danger-wash: "#fef2f2"
  danger-line: "#fecaca"
typography:
  display:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(3rem, 7vw, 5.5rem)"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  display-close:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(3rem, 10vw, 9rem)"
    fontWeight: 500
    lineHeight: 0.88
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 4.4vw, 4.2rem)"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline-course:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 4rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title-sm:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  nav:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, SF Pro Display, SF Pro Text, BlinkMacSystemFont, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'ss01'"
  body-lead:
    fontFamily: "-apple-system, SF Pro Display, SF Pro Text, BlinkMacSystemFont, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Space Grotesk, -apple-system, SF Pro Display, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  input: "12px"
  panel: "16px"
  pill: "9999px"
spacing:
  gutter-sm: "20px"
  gutter-md: "32px"
  gutter-lg: "48px"
  row: "24px"
  bar: "64px"
  section: "96px"
  section-lg: "144px"
  app-max: "72rem"
  field-max: "1440px"
components:
  button-primary:
    backgroundColor: "{colors.sol-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.nav}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.sol-blue-pressed}"
  button-secondary:
    backgroundColor: "{colors.charcoal-ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.ink-2}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.pill}"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.pill}"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.charcoal-ink}"
  button-on-blue:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.sol-blue}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-on-blue-hover:
    backgroundColor: "{colors.sol-blue-50}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.input}"
    padding: "0 16px"
    height: "48px"
  citation-chip:
    backgroundColor: "{colors.sol-blue-wash}"
    textColor: "{colors.sol-blue}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Cobble AI

## Overview

**Creative North Star: "The Cited Figure"**

Cobble is drawn like an annotated plate in a textbook. Every important thing is a figure: it gets a caption (`■ FIG. 01 · COBBLE`), crosshair registration marks at its corners, and leader lines that run out to small tracked labels in parentheses (`( TUTOR )`, `( YOU )`). The thesis, a course tutor proven by its citation, is literal on the landing: the two-figure mark is crossed by a giant "p. 14", the page an answer came from. Proof is the decoration.

Two worlds share one grammar. Brand moments (landing, sign-in, onboarding) are drenched fields of Sol Blue with white type and no other colour. The app is White Smoke with black ink, where Sol Blue is the only accent and appears as active-tab underlines, primary buttons, focus rings, links and citation chips. Display type is Space Grotesk set lowercase, medium weight and tight (-0.04em); body is the system SF stack. Structure comes from hairline rules, not boxes: lists are ruled rows under a black top rule, panels are sections under a 1px ink line.

The world is calm for long study sessions. Expression lives in type scale and composition: huge lowercase headlines, small type pinned to corners, a three-zone running head. It refuses the AI-SaaS hero: no gradients, no product mockups, no feature-card grids.

**Key Characteristics:**
- Sol Blue drenched fields with white type for brand surfaces; White Smoke app with black ink and one blue accent.
- Space Grotesk display, lowercase, weight 500, tracking -0.035em to -0.04em, line-height under 1.
- System SF body at 15px, 1.5 line-height.
- Tracked uppercase annotations (11px, 0.08em) for captions, corner meta and data labels.
- Crosshair registration marks and self-drawing leader-line callouts around figures.
- Hairline rules over cards: ruled rows and ink-topped sections.
- Pills for actions, 12px corners for fields, 16px for the few panels that remain.

## Colors

One saturated blue against black and near-white; everything else is a tint, a grey, or a status signal.

### Primary
- **Sol Blue** (`sol-blue`): the drenched field on landing, sign-in and onboarding; in the app, primary buttons, the 2px active-nav and active-tab bar, focus outline, caret, text selection, links, and citation chips. The browser theme colour.
- **Sol Blue Pressed** (`sol-blue-pressed`): hover and pressed state for anything filled with Sol Blue.
- **Sol Blue Tints** (`sol-blue-400` to `sol-blue-50`): from the brand kit. `sol-blue-100` borders blue-tinted panels and chips; `sol-blue-50` is the focus ring halo on inputs and the hover fill of white buttons on blue.
- **Sol Blue Wash** (`sol-blue-wash`): selected fills, chips, the selected option in a choice group.

### Neutral
- **White Smoke** (`white-smoke`): the app canvas and every light landing section.
- **Surface** (`surface`): white panels, inputs, menus, dialogs, row hover.
- **Sunken** (`sunken`, `sunken-2`): quiet fills: segmented-control track, ghost-button hover, skeletons, tracks.
- **Hairline** (`hairline`): the default 1px rule between rows, under the top bar, under the tab row.
- **Hairline Strong** (`hairline-strong`): control borders (inputs, outline buttons, selects) and scrollbar thumb.
- **Charcoal Ink** (`charcoal-ink`): body text, headings, the black top rule over lists and sections, the secondary button, the avatar disc.
- **Ink 2 / 3 / 4** (`ink-2`, `ink-3`, `ink-4`): strong secondary text and labels; secondary text and inactive nav (AA on White Smoke); placeholders, icons and faint arrows.

### Status (functional, never decorative)
- **Ready** (`status-ready`) and **Attention** (`status-attention`): 8px status dots only, beside a text label ("Ready", "Needs a map").
- **Danger** (`danger`, `danger-text`, `danger-wash`, `danger-line`): the danger button and inline error alerts (wash fill, line border, text colour).

### Named Rules
**The One Accent Rule.** In the app, Sol Blue is the only hue that carries meaning or emphasis. Status colours appear only as small dots or error alerts with a text label beside them.

**The Drenched Field Rule.** A brand surface is all Sol Blue with white type. Nothing else sits on it except white at reduced opacity (85% secondary text, 75% or 70% annotations, 60% outline-button border, 25% rules). Selection inverts to white on blue.

## Typography

**Display Font:** Space Grotesk (with -apple-system, SF Pro Display, system-ui)
**Body Font:** SF Pro Display via the system stack (-apple-system, SF Pro Text, BlinkMacSystemFont, Segoe UI Variable Text, Segoe UI, system-ui)
**Label Font:** Space Grotesk, uppercase and tracked

**Character:** a geometric grotesk set tight and lowercase for voice, against an invisible system face for reading. Every h1 to h6 is Space Grotesk at weight 500, -0.025em, line-height 1.1, balanced wrapping.

### Hierarchy
- **Display Close** (500, clamp(3rem, 10vw, 9rem), 0.88): the closing line on the landing ("bring your course.").
- **Display** (500, clamp(3rem, 7vw, 5.5rem), 0.9): top-level app page titles via PageHeader ("your courses", "analytics").
- **Headline** (500, clamp(2.2rem, 4.4vw, 4.2rem), 0.95): the statement on blue brand panels ("welcome back.", "join your class.").
- **Headline Course** (500, clamp(2.25rem, 5vw, 4rem), 0.98, -0.035em): the course title in the course shell.
- **Title** (500, 1.5rem to 1.75rem, -0.03em): course names in ruled rows, section headings inside pages.
- **Title Small** (500, 1.25rem, -0.025em): panel headings on analytics sections and card titles.
- **Nav** (400, 15px, -0.015em): top-bar sections, course tabs, button labels (buttons use 500).
- **Body** (400, 15px, 1.5, `ss01`): all reading text. Leads cap at max-w-xl (about 36rem).
- **Body Lead** (400, 17px, -0.01em): the offer paragraph on blue fields.
- **Label** (500, 11px, 0.08em, uppercase): figure captions, course codes, data labels, corner footnotes, the role tag in the account menu.

### Named Rules
**The Lowercase Voice Rule.** Display and headline statements are written lowercase with a closing full stop ("answers from your course. nothing else."). UI labels, buttons and nav stay sentence case.

**The Annotation Is Not An Eyebrow Rule.** The 11px tracked label captions figures, pins meta to corners and labels data. It never sits above a heading as a kicker.

**The Tabular Rule.** Course codes, counts and every table cell use tabular figures.

## Layout

The app frame is a sticky 64px top bar over a scrolling content area (100dvh shell). Top-level pages use one frame: side gutters of 20px, 32px at md, 48px at lg, content capped at 72rem and centred, 40px (56px at md) top padding, 96px bottom. The course shell repeats the same frame so every left edge aligns with the top bar.

The top bar and the landing running head are a printed running head in three zones: mark left, sections centred, account or sign-in right; on small screens the centre zone drops to its own scrolling row of pills.

Landing sections are full-bleed fields capped at 1440px inside, with 96px vertical padding (144px at md) and a 12-column grid at md. The first viewport is composed, not stacked: headline pinned top-left, figure filling the field, offer and actions bottom-left, footnote bottom-right. Brand panels for sign-in and onboarding split 5:6 at lg, blue left, form right (form column 420 to 460px).

Lists are ruled rows: 24px vertical padding, a black top rule, hairlines between rows, and on md a fixed 7rem code column, a flexible title, meta, then an arrow. Breakpoints are Tailwind v4 defaults (sm 640, md 768, lg 1024).

## Elevation & Depth

Flat at rest. Depth is a 1px rule, a fill step (canvas, surface, sunken), or Sol Blue. Shadows exist only on layers that float above the page: the account menu, modal dialogs and the selected thumb of a segmented control. Modals dim the page with 40% ink and a 2px backdrop blur; the top bar is 95% canvas with a small backdrop blur.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 40px -12px rgba(0,0,0,0.25)`): dropdown menus.
- **Modal** (`box-shadow: 0 24px 60px -20px rgba(0,0,0,0.35)`): dialogs.
- **Thumb** (`box-shadow: 0 1px 3px rgba(0,0,0,0.12)`): the selected segment in a pill segmented control.

### Named Rules
**The Rule-Not-Box Rule.** Group content with a hairline or an ink top rule before reaching for a bordered panel. Analytics panels, course lists, recent files and the landing spec lists all follow it.

## Shapes

Three corner values. Actions are pills (buttons, nav items, chips, selects, segmented controls, avatar). Fields and inline alerts are 12px. The remaining panels (cards, dialogs, menus, the example answer) are 16px; chat bubbles are 16px with a 6px tail corner. Rules are always 1px; the only heavier line is the 2px Sol Blue active indicator. The logo is the user's own two-figure mark (round heads, block bodies, 0.6 rounded rects), drawn in currentColor so it takes white on blue and blue or black on smoke.

## Components

### Buttons
Confident pills in Space Grotesk 500 with -0.01em tracking.
- **Shape:** full pill. Sizes 32px (sm, 14px padding), 40px (md, 20px), 48px (lg, 28px).
- **Primary:** Sol Blue fill, white text; hover Sol Blue Pressed.
- **Secondary:** Charcoal Ink fill, white text; hover Ink 2.
- **Outline:** white fill, Hairline Strong border, ink text; hover border turns ink.
- **Ghost:** transparent, Ink 3 text; hover Sunken fill and ink text.
- **Danger:** white fill, red text, light red border; hover red wash.
- **On blue:** white pill with Sol Blue text (hover Sol Blue 50), paired with an outline pill of white at 60% (hover white at 10%). Both 48px.
- **Motion:** 200ms ease-out-expo on colour and border; press scales to 0.98. Disabled is 45% opacity.

### Inputs / Fields
- **Style:** 48px tall, white fill, Hairline Strong border, 12px corners, 16px side padding, 15px text, Ink 4 placeholder. Label above in 14px Ink 2.
- **Focus:** border turns Sol Blue with a 2px Sol Blue 50 ring. Caret is Sol Blue.
- **Codes:** invite-code fields set in Space Grotesk, uppercase, 0.12em tracking.
- **Error:** an inline alert block above the form: danger wash, danger line border, danger text, 12px corners.

### Navigation
- **Top bar:** three-zone running head, 64px, 95% White Smoke with a hairline below. Sections in Space Grotesk 15px: inactive Ink 3, active ink with a 20px by 2px Sol Blue bar sitting on the bottom rule. Mobile: a row of pills, active one filled ink with white text.
- **Course tabs:** Space Grotesk 15px, 28px gaps, on a hairline; the active tab gets a full-width 2px Sol Blue underline on the rule.

### Citation Chip (signature)
The proof of the thesis. A pill with Sol Blue Wash fill, Sol Blue 100 border, Sol Blue Space Grotesk 12px text and a 6px Sol Blue dot, naming the exact location ("regularisation.pdf · p. 14", "Lecture 7 · 18:42").

### Annotated Figure (signature)
A figure framed by four 13px crosshairs, captioned top-left with a `■ FIG. NN · NAME` label, with leader lines that draw themselves (1100ms) to a small ring and end in a parenthesised tracked label. Used for the hero mark, the brand-panel mark and the example answer.

### Ruled Row List
A black top rule, hairline between rows, 24px row padding; code as a label, title as Title type that turns Sol Blue on hover, meta in Ink 3, an arrow that turns blue and nudges 4px right. Rows hover to white.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Surface (default) or Sunken (raised).
- **Shadow Strategy:** none (see Elevation).
- **Border:** one hairline; the hoverable variant's border turns ink on hover and is keyboard operable.
- **Internal Padding:** 24px.
- Shipped on course detail, assignments, study plan, tests and tutor policy. This is the build's current panel, not the target: new surfaces follow the Rule-Not-Box Rule.

## Do's and Don'ts

### Do:
- **Do** drench brand surfaces fully in Sol Blue (#073dea) with white type and white-at-opacity for everything secondary.
- **Do** keep Sol Blue as the single accent in the app: primary action, active indicator, focus, links, citations.
- **Do** set statements in lowercase Space Grotesk 500 with -0.04em tracking and line-height under 1.
- **Do** structure lists and sections with a 1px ink top rule and hairlines between rows.
- **Do** caption figures with tracked 11px uppercase annotations, crosshairs and leader-line callouts.
- **Do** show where an answer came from with a citation chip naming the page, slide or timestamp.
- **Do** use the shared page frame (20/32/48px gutters, 72rem max) so left edges align with the top bar.
- **Do** honour reduced motion; entrances use `rise` (900ms ease-out-expo) and are disabled by the global reduced-motion rule.

### Don't:
- **Don't** add gradients, product mockups or feature-card grids to brand surfaces.
- **Don't** introduce a second accent hue in the app; status colours are dots and alerts with labels, nothing more.
- **Don't** put shadows on resting surfaces; shadows belong to menus, dialogs and the segmented thumb only.
- **Don't** wrap grouped content in a bordered card when a rule will do.
- **Don't** use the annotation style as an eyebrow above headings.
- **Don't** redraw or recolour the two-figure mark beyond currentColor.
