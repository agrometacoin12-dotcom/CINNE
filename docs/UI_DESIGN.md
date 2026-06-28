# CinneTemple — UI Design System

> Binding visual direction for **every** page on **web and iOS**, all phases:
> **Netflix-style cinematic UX + Liquid Glass (glassmorphism) surfaces.**

## 1. Principles

- **Cinematic & dark-first.** Deep near-black backgrounds, content-forward,
  large imagery, edge-to-edge hero, horizontally scrolling "rows" of cards.
- **Liquid Glass everywhere.** Navigation bars, modals, cards, sheets, and
  overlays are frosted translucent panels with background blur, subtle inner
  highlight, soft border, and layered depth. On iOS this maps to native
  materials (`.ultraThinMaterial` / Liquid Glass); on web to `backdrop-filter`.
- **Motion with intent.** Smooth, spring-based transitions (Framer Motion on
  web, SwiftUI `spring`/`matchedGeometryEffect` on iOS). Hover/focus elevate;
  hero parallax; row items scale on focus (Netflix-style).
- **Accessible.** Maintain WCAG AA contrast over glass (use scrims/gradients
  behind text), respect reduced-motion and increased-contrast settings.
- **Light mode** is a first-class theme: glass becomes light frosted panels over
  bright backdrops; same structure, inverted tokens.

## 2. Design tokens (source of truth)

These tokens are mirrored in `packages/config` (Tailwind preset) and in the iOS
`Theme` enum so web and iOS stay visually identical.

```jsonc
{
  "color": {
    "bg":        { "base": "#0A0A0B", "elevated": "#141417" },
    "text":      { "primary": "#F5F5F7", "secondary": "#A1A1AA", "onGlass": "#FFFFFF" },
    "brand":     { "primary": "#E50914", "accent": "#FF3B30" }, // cinematic red
    "glass": {
      "fill":    "rgba(255,255,255,0.08)",
      "fillLight":"rgba(255,255,255,0.55)",
      "border":  "rgba(255,255,255,0.18)",
      "highlight":"rgba(255,255,255,0.25)"
    }
  },
  "radius":   { "sm": 10, "md": 16, "lg": 24, "pill": 999 },
  "blur":     { "glass": 24, "glassStrong": 40 },
  "shadow":   { "glass": "0 8px 32px rgba(0,0,0,0.45)" },
  "motion":   { "spring": { "stiffness": 280, "damping": 30 }, "fast": 0.18, "base": 0.32 }
}
```

## 3. Liquid Glass — web recipe (Tailwind/CSS)

```css
.glass {
  background: var(--glass-fill);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid var(--glass-border);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 var(--glass-highlight); /* top inner highlight */
  border-radius: 16px;
}
```

## 4. Liquid Glass — iOS recipe (SwiftUI)

```swift
struct GlassCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(16)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(.white.opacity(0.18), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.45), radius: 16, y: 8)
    }
}
```

## 5. Signature components (built in Phase 1 web/iOS)

- **Hero banner** — full-bleed featured artwork, gradient scrim, glass CTA bar.
- **Content rows** — lazy horizontal carousels of poster cards, focus-scale.
- **Glass nav** — translucent top bar (web) / tab bar + nav bar (iOS).
- **Auth surfaces** — register/login/reset rendered as centered glass panels
  over a cinematic, slowly animating backdrop.
- **Profile & settings** — glass list sections, Netflix-style profile switcher.

> Phase 1 auth screens already adopt this language; Phase 2 content screens
> extend the hero + rows pattern.
