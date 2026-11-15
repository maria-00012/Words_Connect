# Visual Design Specification

## Visual character

The legacy interface is a warm, friendly classroom tool. Preserve its dark-teal framing, lime accents, mint surfaces, warm off-white page, rounded geometry, generous tap targets, and short lesson cards. Rebuild as reusable React components while matching the source composition and responsive behavior rather than introducing a new visual direction.

## Color tokens observed

| Token/use | Value | Evidence/use |
|---|---:|---|
| Deep teal | `#102b2b` | Header, hero, primary buttons, dark spotlight |
| Main text teal | `#173535` | Body text and foregrounds |
| Pale lime | `#d6f078` | Brand accent, highlighted text, primary student action |
| Mint | `#dff3e9` | Secondary buttons and chips |
| Medium green | `#2c8066` | Progress bars, emphasis, success elements |
| Warm off-white | `#fffaf0` | Page background |
| White | `#fff` | Cards and navigation |
| Muted text | `#647675` | Secondary descriptions |
| Border | `#dce8e1` | Cards, options, navigation |
| Pale green surface | `#f4f8f2` / `#f4f7f2` | Metrics, question and result surfaces |
| Success | `#e6f6e9` / `#205b3a` | Success message background/text |
| Error | `#fff0e9` / `#874333` | Error feedback background/text |
| Warm note | `#fff5df` / `#6b5528` | Guidance/notice |
| Wall alternate | `#fff3e8` | Alternating wall notes |

## Typography and scale

- Font stack: system UI (`-apple-system`, `Segoe UI`, `Roboto`, `Arial`, sans-serif); 16px body with 1.5 line-height.
- `h2`: 1.6rem, 1.15 line-height; hero title: 3rem, tight .95 line-height and negative tracking.
- `h3` uses browser-default heading sizing with reset margins; secondary `.sm` is .78rem; chips are .75rem; small labels and status text are mostly .7–.9rem.
- Headings and labels are bold; brand lettering is uppercase with letter spacing.

## Layout and component rules

- Body page background `#fffaf0`; bottom padding reserves space for fixed student navigation.
- Main student width is 680px including 14px side padding; teacher wrapper is 1000px.
- Header is full width, deep teal, 16px vertical / 18px horizontal padding. Brand label is lime; status pill floats on the right.
- Hero uses deep teal, 22px radius, 26px/20px padding, and 14px bottom gap.
- Cards are white, 1px border, 18px radius, 16px padding, 12px bottom gap, and subtle teal shadow.
- Buttons have minimum 44px height, 13px radius, 12px/16px padding, bold text, and dark, mint, lime, or coral variants.
- Inputs and textareas fill width, have 12px padding/radius, 1px border, and 4px top gap; textarea minimum height is 96px.
- Metrics and result summaries use wrapping flex rows. Teacher tabs scroll horizontally when needed.
- Student bottom navigation is fixed to viewport; teacher spotlight/QR panels use full-screen fixed overlays.
- Chips, question panels, feedback blocks, progress bars, award cards, and wall notes have distinct pale surfaces and radii (11–20px).

## Responsive behavior

The design is mobile-first. Wrapping flex rows adapt their children at approximately 140px basis; metric tiles use approximately 90px basis. Teacher content widens up to 1000px, while student content remains 680px. At `min-width: 760px`, teacher metrics enlarge. Inputs, buttons, tabs, cards, and fixed navigation are touch-oriented. QR size is computed from viewport dimensions and bounded from 180px to 420px.

## Student and teacher presentation

Both experiences use one shared visual system. Student home and activities are narrow and sequential, with fixed stage navigation. Teacher mode uses a wider wrapper, horizontal tabs, data tables/lists expressed as cards, larger metrics, controls, and overlays. `teacher.html` is not a separately designed dashboard; it is the same document with teacher mode forced.

## Reconstruction guidance

- Create CSS variables for the observed palette, radius, spacing, and type scale; this keeps the token values centralized without changing the visual language.
- Build reusable `Header`, `Card`, `Button`, `Chip`, `Metric`, `Feedback`, `ProgressBar`, `Tabs`, and `Modal/Overlay` components.
- Keep the small-screen width, safe bottom navigation, scrolling tabs, and contrast of feedback states.
- Restore intended Unicode icons/arrows/quotes; the current files contain mojibake despite declaring UTF-8.
- Verify visual parity against screenshots or side-by-side browser captures in later implementation; no rendering comparison was run during this planning-only stage.
