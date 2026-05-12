# AI Chrome Assistant — Design System v2.0

> **Philosophy:** The app should feel like a modern Linux terminal session — not a generic chat UI. Think **Starship prompt** meets **tmux** meets **Terminus**.
> Every message is a shell interaction. Every UI element looks like it belongs in a TTY, but polished with 2025 aesthetics: rounded corners, subtle glows, iconography, and smart color coding.

---

## 1. Color Palette

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `bg-base` | `#0d1117` | Main popup background (GitHub Dark / Terminal black) |
| `bg-surface` | `#161b22` | Message blocks, input area, header/footer panels |
| `bg-surface-hover` | `#1f242c` | Hover states on interactive panels |
| `bg-overlay` | `rgba(13, 17, 23, 0.85)` | Modal/dropdown backdrops |

### Foreground & Accents (Starship-inspired)
| Token | Hex | Usage |
|-------|-----|-------|
| `fg-primary` | `#e6edf3` | Primary text, prompts |
| `fg-muted` | `#8b949e` | Timestamps, secondary labels, borders |
| `fg-dim` | `#484f58` | Inactive elements, disabled states |
| `accent-cyan` | `#39d0d8` | User prompt symbol (`~$`), active states, links |
| `accent-green` | `#3fb950` | AI prompt symbol, success indicators, active grab |
| `accent-yellow` | `#d29922` | Warnings, loading spinners, grab button idle |
| `accent-red` | `#f85149` | Errors, destructive actions |
| `accent-blue` | `#58a6ff` | Buttons, focused inputs, highlights |
| `accent-magenta` | `#bc8cff` | Special metadata, image tags |

### Semantic Mapping
- **User messages**: Cyan (`accent-cyan`) prompt prefix + white text.
- **AI messages**: Green (`accent-green`) prompt prefix + light gray text.
- **System/Status**: Yellow (`accent-yellow`) for warnings, Red (`accent-red`) for errors.
- **Active elements**: Blue (`accent-blue`) focus rings and hover states.
- **Borders**: 1px solid `rgba(139, 148, 158, 0.15)` — barely visible dividers.

---

## 2. Typography

| Element | Font | Size | Weight | Line Height | Notes |
|---------|------|------|--------|-------------|-------|
| Prompts (user/ai) | `JetBrains Mono`, `Fira Code`, `Cascadia Code`, `monospace` | 13px | 700 | 1.4 | Must include fallback to system monospace |
| Body text | Same monospace stack | 13px | 400 | 1.6 | Rendered Markdown inside messages |
| Header title | Same monospace stack | 14px | 700 | 1.2 | App name + version |
| Timestamps | Same monospace stack | 11px | 400 | 1.2 | `fg-muted` color |
| Status bar | Same monospace stack | 12px | 600 | 1.2 | Footer F-keys |
| Buttons | Same monospace stack | 12px | 600 | 1.2 | All caps or `[ bracketed ]` style |
| Code inline | Same monospace stack | 12px | 400 | 1.4 | `bg-surface` background, subtle padding |
| Code blocks | Same monospace stack | 12px | 400 | 1.5 | Syntax highlighted (see §6) |

**Font Loading:** Use Google Fonts or bundle `JetBrains Mono` (400, 700). The extension popup must feel instant — prefer bundled fonts or `system-ui` monospace fallback.

---

## 3. Layout Architecture

The popup is a fixed-size terminal window:
- **Width:** `420px`
- **Height:** `540px`
- **Border radius:** `12px` on the outer popup shell (Chrome extension popup natively clips, but internal container should have rounded corners for standalone feel).
- **Padding:** `0` — panels touch edges; internal elements have `12px–16px` padding.

### Panel Structure (like tmux panes)
```
┌─────────────────────────────────────────┐
│ [title]              [btn] [btn] [btn]  │  ← Header Bar (bg-surface)
├─────────────────────────────────────────┤
│ OUTPUT: [EN] [ES]                       │  ← Status Line
├─────────────────────────────────────────┤
│                                         │
│  tú@usuario:~$  Hello there       15:27 │  ← Messages Area (scrollable)
│                                         │
│  ai@assistant:~$                        │
│  ┌──────────────────────────────────┐   │
│  │ > Response line one              │   │
│  │ > Response line two              │   │
│  └──────────────────────────────────┘   │
│                                         │
│  ai@assistant:~$                        │
│  ┌──────────────────────────────────┐   │
│  │ >> TABLE_HEADER                  │   │
│  │ key        : value               │   │
│  │ key2       : value2              │   │
│  └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ >  Type your command...        [send]   │  ← Input Bar (bg-surface)
├─────────────────────────────────────────┤
│ F1 help  F2 clear  F3 export  F4 theme │  ← Footer Key Bar
└─────────────────────────────────────────┘
```

### Z-Index Stack
1. `bg-base` — base layer
2. `bg-surface` panels — header, footer, input
3. Messages — scrollable content
4. Dropdowns / Toasts — floating above

---

## 4. Component Specifications

### 4.1 Header Bar
- **Background:** `bg-surface`
- **Border bottom:** 1px `rgba(139,148,158,0.15)`
- **Height:** `44px`
- **Padding:** `0 16px`
- **Left side:** App logo + title
  - Format: `ai-assistant v1.0.0`
  - `ai-assistant` in `accent-green`, `v1.0.0` in `fg-dim`
- **Right side:** Action buttons in `[ label ]` bracket style
  - `[+ nuevo chat]` — `accent-blue` on hover
  - `[● grab]` — Yellow dot when idle, Green when active, Red when error
  - Hover: background shifts to `bg-surface-hover`, text brightens

### 4.2 Status / Language Bar
- **Background:** transparent (inherits `bg-base`)
- **Padding:** `6px 16px`
- **Content:** `OUTPUT:` label + language toggles `[EN]` `[ES]`
- Active language: `accent-blue` text + bottom border `2px solid accent-blue`
- Inactive: `fg-muted`, hover brightens to `fg-primary`

### 4.3 Message Bubbles → Terminal Blocks
**Eliminate traditional chat bubbles.** Every exchange is a terminal command + output block.

#### User Message
```
tú@usuario:~$  Decime en que estado está mi pedido          [15:27:41]
```
- **Prompt:** `tú@usuario:~$` in `accent-cyan`, bold
- **Text:** `fg-primary`, aligned immediately after prompt with `8px` gap
- **Timestamp:** `fg-muted`, floated right or inline at end
- **No background box.** The prompt itself is the anchor.

#### AI Message
```
ai@assistant:~$  [15:27:42]
┌────────────────────────────────────────┐
│ > El estado de tu pedido es En camino. │
│                                        │
│ > Según la información...              │
└────────────────────────────────────────┘
```
- **Prompt:** `ai@assistant:~$` in `accent-green`, bold
- **Timestamp:** `fg-muted`, right after prompt
- **Content Block:** A rounded panel (`border-radius: 8px`, `bg-surface`, `1px solid rgba(139,148,158,0.1)`) containing the response.
- **Block prefix:** Each paragraph or list item starts with `>` in `accent-green` (like terminal stdout prefixes).
- **Internal padding:** `12px 16px`
- **Margin:** `8px 0 16px 0` below the prompt line

#### Structured Data Blocks
When the AI returns tables, key-value pairs, or structured info:
- Use ASCII-art style borders or simple panels.
- Header: `>> HEADER_TITLE` in `accent-green` + bold
- Separator line: `─` repeated (CSS `border-bottom` on a pseudo-element)
- Key-value alignment: `key : value` with keys in `fg-muted`, values in `fg-primary`, monospaced alignment using a 2-column grid or preformatted text.

### 4.4 Input Bar
- **Background:** `bg-surface`
- **Border top:** 1px `rgba(139,148,158,0.15)`
- **Padding:** `10px 16px`
- **Layout:** Flex row, gap `10px`

#### Input Field
- **Appearance:** No border, no rounded corners (or `6px` subtle). Background `bg-base`.
- **Left prefix:** `>` in `accent-cyan`, acting as the prompt cursor.
- **Placeholder:** `fg-dim`, e.g., `> Preguntá algo sobre esta página...`
- **Text color:** `fg-primary`
- **Font:** Monospace 13px
- **Focus:** `box-shadow: inset 0 0 0 1px accent-blue`, subtle `0 0 0 3px rgba(88, 166, 255, 0.15)` outer glow.
- **Height:** Auto-expanding textarea, min `40px`, max `120px`.

#### Send Button
- **Style:** `[ enviar ]` bracket button
- **Background:** transparent, border `1px solid accent-blue`
- **Text:** `accent-blue`
- **Hover:** Background `accent-blue`, text `bg-base`
- **Disabled:** `fg-dim`, border `fg-dim`, 50% opacity

### 4.5 Footer Status Bar (F-Keys)
- **Background:** `bg-surface`
- **Border top:** 1px `rgba(139,148,158,0.15)`
- **Height:** `32px`
- **Padding:** `0 16px`
- **Layout:** Flex row, justify `space-between`
- **Items:** `F1 ayuda   F2 limpiar   F3 exportar   F4 tema   F5 acerca`
- **Key label:** `F1`, `F2`... in `accent-yellow` or `accent-blue`
- **Action label:** `fg-muted`, hover brightens to `fg-primary`
- **Interaction:** Clickable; show a subtle underline on hover.

---

## 5. Prompt & Shell Aesthetics (Starship-style)

### Prompt Anatomy
Mimic a Starship/zsh prompt with contextual segments:

| Segment | Example | Color | Condition |
|---------|---------|-------|-----------|
| User | `tú` | `accent-cyan` | Always for user |
| Host | `@usuario` | `fg-muted` | Always for user |
| Separator | `:` | `fg-dim` | Always |
| Path | `~` | `accent-cyan` | Always (simplified to `~`) |
| Prompt Char | `$` | `accent-cyan` | User; `accent-green` for AI |
| AI Name | `ai` | `accent-green` | Always for assistant |
| Host | `@assistant` | `fg-muted` | Always for assistant |

**Full Prompt Strings:**
- User: `<span class="prompt-user">tú</span><span class="prompt-dim">@</span><span class="prompt-host">usuario</span><span class="prompt-dim">:</span><span class="prompt-path">~</span><span class="prompt-char">$</span>`
- AI: `<span class="prompt-ai">ai</span><span class="prompt-dim">@</span><span class="prompt-host">assistant</span><span class="prompt-dim">:</span><span class="prompt-path">~</span><span class="prompt-char">$</span>`

### Timestamp Style
- Format: `[HH:MM:SS]` — always 24h.
- Placement: Inline after the prompt, or right-aligned on the same line.
- Color: `fg-muted`
- Font: 11px monospace

---

## 6. Markdown Rendering in Terminal Style

Since AI responses are Markdown, render them with terminal-friendly styling:

| Markdown | Terminal Style |
|----------|----------------|
| `**bold**` | `font-weight: 700`, `fg-primary` |
| `*italic*` | `font-style: italic`, `fg-muted` |
| `` `code` `` | `bg-surface`, `accent-cyan`, `padding: 2px 4px`, `border-radius: 4px` |
| ` ``` ` block | `bg-base` (darker), `border: 1px solid rgba(139,148,158,0.2)`, `border-radius: 8px`, `padding: 12px`, syntax highlighting with terminal colors |
| `> quote` | Left border `2px solid accent-green`, `padding-left: 12px`, `fg-muted` |
| `- list` | Prefix with `>` in `accent-green` instead of bullets |
| `1. ordered` | Prefix with `1.` in `accent-cyan` |
| `---` hr | `border-bottom: 1px dashed fg-dim` |
| `link` | `accent-blue`, underline on hover |
| Table | `bg-surface` panel, header row `accent-green`, rows alternating `bg-base` / `bg-surface` |

### Syntax Highlighting (Code Blocks)
Use a custom highlight.js or Prism theme with the palette:
- Keywords: `accent-magenta`
- Strings: `accent-green`
- Functions: `accent-blue`
- Comments: `fg-dim`
- Numbers: `accent-yellow`
- Operators: `accent-cyan`

---

## 7. Animations & Micro-interactions

### Typing / Streaming
- When AI streams a response, show a blinking block cursor `█` at the end of the last line.
- Cursor: `accent-green`, blink animation `1s step-end infinite`.
- Smooth scroll: `scroll-behavior: smooth` on messages container.

### Message Entrance
- New messages slide in from bottom with `translateY(8px)` → `0` and `opacity: 0` → `1`.
- Duration: `200ms`, easing: `ease-out`.

### Button Interactions
- Hover: `background-color` transition `150ms ease`.
- Active/Press: `scale(0.97)` for 100ms.
- Focus: `outline: none`, use `box-shadow` glow with accent color.

### Loading State
- While AI thinks (before streaming starts), show a compact status line:
  ```
  ai@assistant:~$  [cargando...]
  ```
- `[cargando...]` pulses in `accent-yellow` with an ellipsis animation.

### Grab Toggle
- Transition dot color from yellow → green with a `300ms` CSS transition.
- Optional: A subtle terminal bell flash (`bg-overlay` red tint for 200ms) on grab error.

---

## 8. CSS Custom Properties

```css
:root {
  /* Backgrounds */
  --bg-base: #0d1117;
  --bg-surface: #161b22;
  --bg-surface-hover: #1f242c;
  --bg-overlay: rgba(13, 17, 23, 0.85);

  /* Foregrounds */
  --fg-primary: #e6edf3;
  --fg-muted: #8b949e;
  --fg-dim: #484f58;

  /* Accents */
  --accent-cyan: #39d0d8;
  --accent-green: #3fb950;
  --accent-yellow: #d29922;
  --accent-red: #f85149;
  --accent-blue: #58a6ff;
  --accent-magenta: #bc8cff;

  /* Typography */
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Consolas, monospace;

  /* Layout */
  --popup-width: 420px;
  --popup-height: 540px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Borders */
  --border-subtle: rgba(139, 148, 158, 0.15);
  --border-medium: rgba(139, 148, 158, 0.25);

  /* Shadows */
  --shadow-glow-blue: 0 0 0 3px rgba(88, 166, 255, 0.15);
  --shadow-glow-green: 0 0 0 3px rgba(63, 185, 80, 0.15);
}
```

---

## 9. Theme Variants (Future-proofing)

Design tokens allow for easy theming. Default is **Starship Dark**. Potential variants:
- **Retro Green:** `#00ff00` on `#000000`, phosphor glow effect.
- **Dracula:** Purple/blue dominant.
- **Solarized Dark:** Muted blue-greens.

The F4 key (`F4 tema`) should cycle or open a mini-dropdown to switch themes.

---

## 10. Extension-specific Constraints

- **Popup size:** Chrome extension popups are limited. Keep the main container at `420x540` max and ensure internal scrolling works smoothly.
- **Scrollbars:** Custom thin scrollbar:
  ```css
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--fg-dim); border-radius: 3px; }
  ```
- **No external network calls:** All fonts must be bundled (base64 or local files in `public/`).
- **Keyboard shortcuts:** Map physical keys to F-actions where possible (e.g., `Ctrl+L` for clear, `Ctrl+T` for theme).
- **Focus trap:** Since it's a popup, ensure Tab navigation cycles logically through input → send → header buttons → footer actions.

---

## 11. Assets Needed

| Asset | Format | Notes |
|-------|--------|-------|
| JetBrains Mono font | WOFF2 | Bundle Regular (400) and Bold (700) |
| Grab status dot | CSS | `border-radius: 50%`, animated |
| Send icon | Optional | Can be pure text `[ > ]` to stay terminal-pure |

---

## 12. Accessibility

- **Contrast ratios:** All text meets WCAG AA against `bg-base`.
- **Focus indicators:** Every interactive element has a visible `box-shadow` glow on focus.
- **Screen readers:** Prompt symbols (`$`, `>`) should be `aria-hidden="true"` so they aren't vocalized; use `sr-only` spans for context.
- **Reduced motion:** If `prefers-reduced-motion: reduce`, disable entrance slides and cursor blink.

---

## 13. Migration Checklist from v1.0

- [ ] Replace `system-ui` font with `--font-mono` everywhere.
- [ ] Swap light backgrounds (`#f8fafc`, `#fff`) for `--bg-base` / `--bg-surface`.
- [ ] Remove chat bubble CSS (rounded pills, shadowed tails).
- [ ] Implement prompt component (`PromptUser`, `PromptAI`).
- [ ] Add message block wrapper with `>` prefix logic for paragraphs.
- [ ] Redesign header to bracket-style buttons.
- [ ] Add footer F-key bar.
- [ ] Implement custom syntax highlighting theme.
- [ ] Add streaming cursor and entrance animations.
- [ ] Bundle JetBrains Mono (or chosen font).

---

*End of Design Document.*
