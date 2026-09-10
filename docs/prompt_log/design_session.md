# Prompt log - design session

**Agent slug:** `design_session`
**Role:** Background design agent. Visual direction exploration for the blotter UI: multi-artboard
design canvases, design tokens, and interaction and loading specifications handed to the
implementing agent.

Significant prompts only, append-only, newest at the bottom. Rules: `/CLAUDE.md`.

---

### 2026-09-10T17:12Z - design_three_blotter_directions

**Prompt**

> /design Design a multi-artboard canvas for "Fusion Blotter", a real-time equity trade blotter for a broker
> (TP ICAP style institutional trading tool). Give me THREE distinct visual directions of the same
> product so I can pick one, plus a shared spec sheet. Implementation target is Next.js 16 + React 19
> + Tailwind v4, so express the palette as CSS custom properties (oklch or hex) I can drop into @theme.
>
> ## Product context (use real-looking data everywhere, no lorem ipsum)
> Trade record: tradeId (TRD-100001), symbol (AAPL, MSFT, TSLA, NVDA, VOD.L, HSBA.L), side (BUY/SELL),
> quantity (800 to 25,000), price (227.45), notional, trader (JSMITH, ABROWN, MJONES), book
> (EQUITIES_UK, EQUITIES_US, TECH_GROWTH), counterparty (Goldman Sachs, JP Morgan, Morgan Stanley,
> Barclays), tradeTimestamp (2026-08-18T09:15:23Z), status (ACTIVE/CANCELLED/AMENDED).
> Users view, create, amend and cancel trades. Every connected client sees changes live over WebSocket.
>
> ## Canvas layout
> One row per direction. Each row contains, left to right:
> 1. Desktop dashboard, 1440x1024, the full single-page app (this is the hero artboard)
> 2. Desktop overlay state, 1440x1024: create-trade slide-over open, with inline validation errors,
>    plus a live-update toast landing in the corner
> 3. Mobile blotter list, 390x844
> 4. Mobile trade detail + amend, 390x844
> Then a fourth artboard row: a shared spec sheet, 1440x1024, covering tokens, motion and states.
>
> [... desktop single-page-application and mobile multi-page layout sections elided, ~2000 characters ...]
>
> ## Colour direction (green + blue + white, techy/futuristic)
> Keep brand chrome and semantic data colour separate. BRAND DECISION ALREADY MADE: brand chrome is
> CYAN/TEAL (electric cyan primary, teal secondary) across all three directions. Blue is structure,
> white/near-white is surface or ink depending on direction. Reserve emerald green for gains and BUY,
> and a rose/red for losses and SELL, so P&L never fights the brand. Never encode meaning in colour
> alone: pair side and direction with a glyph or arrow.
> Give me these three directions:
>
> Direction A, "Deep Terminal": near-black navy base (#080B14 family), elevated slate panels, electric
> cyan primary, emerald and rose semantics, hairline grid rules, monospace numerics. Bloomberg-adjacent
> but modern and calm.
>
> Direction B, "Glass HUD": deep blue-green gradient field, frosted translucent panels with 1px
> luminous edges, cyan-to-teal gradient accents, soft outer glow on live elements, depth via blur
> and layering. The most futuristic of the three, still readable at data density.
>
> Direction C, "Institutional Light": white and cool-grey base, ink text, deep blue structure with
> cyan/teal as the interactive accent, emerald and rose semantics, crisp cards with restrained
> shadows, generous whitespace. Prove the system works in a bright trading-floor room, and include a
> small dark-mode swatch strip to show it inverts.
>
> All three must hit WCAG AA on body text and on status chips, in both the dense grid and the charts.
>
> [... motion specification, anticipation and loading requirements, and spec-sheet contents elided,
> ~2500 characters ...]
>
> Label every artboard clearly. Prioritise data density and legibility over decoration: this is a tool
> traders stare at all day, not a marketing page.

**Outcome:** Produced a fourteen-artboard canvas covering three directions, Deep Terminal, Glass HUD and Institutional Light, each with a desktop single-page blotter, a create-trade overlay showing an optimistic pending row, and two phone pages, plus shared token and anticipation/loading spec sheets. A verification pass then fixed two clipping defects, reconciled trade data and KPI arithmetic across every board, and moved all live-socket indicators off emerald so green and rose stay reserved for P&L.

**Artifact:** [Fusion Blotter design canvas](../artifacts/fusion_blotter_design_canvas.html)
