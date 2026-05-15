## How this plugin compares to alternatives

There are several Vite plugins for SVG sprite generation, each taking a different architectural approach. Here's how they differ and where this plugin fits in.

### At a glance

| Plugin | Sprite method | TS types for icon names | SVGO | Status |
|---|---|---|---|---|
| **This plugin** | External file | ✅ Union type + array | ❌ (bring your own) | ✅ Active |
| [vite-plugin-svg-icons](https://github.com/vbenjs/vite-plugin-svg-icons) | Inline DOM | Runtime only | ✅ | ⛔ Abandoned |
| [vite-plugin-svg-icons-ng](https://github.com/yangxu52/vite-plugin-svg-icons-ng) | Inline DOM | ❌ | ✅ | ✅ Active |
| [@spiriit/vite-plugin-svg-spritemap](https://github.com/SpiriitLabs/vite-plugin-svg-spritemap) | External file | ❌ | ✅ (+ OXVG) | ✅ Active |
| [vite-plugin-svg-spritemap](https://github.com/g-makarov/vite-plugin-svg-spritemap) (g-makarov) | External file | ❌ | ✅ | ✅ Active |
| [vite-plugin-svg-spritesheet](https://github.com/imjasonmiller/vite-plugin-svg-spritesheet) (imjasonmiller) | External file | ✅ Union / enum | ✅ | ✅ Active |
| [vite-awesome-svg-loader](https://github.com/matafokka/vite-awesome-svg-loader) | Inline DOM | ❌ | ✅ | ✅ Active (LGPL) |
| [vite-plugin-magical-svg](https://github.com/cyyynthia/vite-plugin-magical-svg) | Component import → external sprite at build | ❌ | ✅ | ✅ Active (BSD-3) |

### Inline DOM injection

Plugins like [vite-plugin-svg-icons](https://github.com/vbenjs/vite-plugin-svg-icons) and its maintained fork [vite-plugin-svg-icons-ng](https://github.com/yangxu52/vite-plugin-svg-icons-ng) inject the entire spritesheet into the DOM at runtime via a virtual module (`virtual:svg-icons-register`). Icons are referenced with `<use href="#icon-name">` — no external file needed.

This is simple to set up, but means the full sprite markup is parsed on every page load, increases HTML size, and can't be HTTP-cached independently. Neither plugin generates TypeScript types for icon names — you get runtime access to the list via `virtual:svg-icons-names`, but no compile-time safety. Both include SVGO.

### External file with CSS/view/use modes

[@spiriit/vite-plugin-svg-spritemap](https://github.com/SpiriitLabs/vite-plugin-svg-spritemap) is the most feature-rich option. It generates an external hashed spritesheet supporting `<symbol>`, `<view>`, and `<use>` elements, meaning you can reference icons via `<use>`, `<img>` fragments, or even CSS `background-image`. It includes SVGO (and optionally OXVG), generates CSS/SCSS/Less variables, and has first-class Vue/Nuxt integration.

However, it does not generate TypeScript types for icon names.

### Other external file approaches

[vite-plugin-svg-spritemap](https://github.com/g-makarov/vite-plugin-svg-spritemap) (by g-makarov) takes a minimal approach — external `spritemap.svg` with `<symbol>` elements, built-in SVGO v3, and a `currentColor` replacement option. It's lightweight and framework-agnostic but does not generate TypeScript types.

[vite-plugin-svg-spritesheet](https://github.com/imjasonmiller/vite-plugin-svg-spritesheet) (by imjasonmiller) is the closest alternative to this plugin. It generates an external spritesheet with SVGO, automatic TypeScript type generation (union types or enums via a `generateTypes` callback), CSS variable theming for `fill`/`stroke`, and layered directory overrides. Worth evaluating if you need those features.

**This plugin** generates an external SVG spritesheet and optionally produces a TypeScript file with an `iconNames` array and an `IconName` union type, giving you IDE autocomplete and compile-time checking of icon names. It supports multiple independent configurations (separate sprite files and type files per icon set), custom icon name transformers, and formatter integration (Prettier/Biome). It intentionally does not bundle SVGO — optimize your SVGs before placing them in the input directory, or use a separate SVGO step.

### SVG loader (different paradigm)

[vite-awesome-svg-loader](https://github.com/matafokka/vite-awesome-svg-loader) is not a sprite generator but a full SVG loader with five import modes (source, URL, data URI, base64, sprite). It includes built-in React/Vue components with `size`/`color` props and stroke-width preservation. The sprite mode injects symbols into the DOM (inline, not external). Licensed under LGPL-2.1.

### Component imports backed by a sprite (SVGR-style)

[vite-plugin-magical-svg](https://github.com/cyyynthia/vite-plugin-magical-svg) is closer to SVGR than to a sprite generator: `import MySvg from './icon.svg'` returns a framework component (target: `dom`, `react`, `preact`, `vue`, `solid`, `ember`, …). The sprite is an implementation detail — bundled at build, embedded inline during dev for HMR. Imported icons are tree-shaken and nested asset refs (`<image href>`, `<use href>`) are recursively bundled. SVGO on by default. No TS type generation since icons are referenced by import binding, not by name. BSD-3-Clause.

Pick it if you want one import per icon and bundler-driven sprite contents; pick this plugin if you prefer a directory-driven model with `<use href="sprite.svg#icon-name">` and a typed `IconName` union.
