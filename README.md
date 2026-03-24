![GitHub Repo stars](https://img.shields.io/github/stars/MyEasyFarm/vite-plugin-icons-spritesheet?style=social)
![npm](https://img.shields.io/npm/v/@myeasyfarm/vite-plugin-icons-spritesheet?style=plastic)
![Vite compatibility](https://registry.vite.dev/api/badges?package=@myeasyfarm/vite-plugin-icons-spritesheet&tool=vite)
![GitHub](https://img.shields.io/github/license/MyEasyFarm/vite-plugin-icons-spritesheet?style=plastic)
![npm](https://img.shields.io/npm/dy/@myeasyfarm/vite-plugin-icons-spritesheet?style=plastic)
![npm](https://img.shields.io/npm/dw/@myeasyfarm/vite-plugin-icons-spritesheet?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/MyEasyFarm/vite-plugin-icons-spritesheet?style=plastic)

# @myeasyfarm/vite-plugin-icons-spritesheet
A Vite plugin to generate a spritesheet with icons from a directory, re-runs on every edit/delete/add to the directory that is being watched.

Optionally generates TypeScript types for the icon names that it outputs.

If you want to learn more about this approach and it's benefits
check it out here:
https://www.jacobparis.com/content/svg-icons

## About This Fork

This is a fork of the original [vite-plugin-icons-spritesheet](https://github.com/forge42dev/vite-plugin-icons-spritesheet) project. The original maintainer is no longer actively developing the library and is not accepting pull requests. To ensure continued development, bug fixes, and new features, we have decided to maintain and develop this project separately under the `@myeasyfarm` scope.

We extend our gratitude to the original author and contributors for creating this excellent tool. This fork aims to build upon their work while keeping the library up-to-date and actively maintained.

### Key Changes from Original

- **ESM-only**: This package is published as ESM-only (no CommonJS support). Make sure your project supports ES modules. If you need CommonJS support, please use the original package.
- **SVG formatting**: We don't attempt to format the output SVG file with Biome or Prettier, as neither tool supports SVG input. Applying HTML formatting to SVG files would be misusing these formatters, as they are not designed for this file type.
- **Auto-detected formatter**: The plugin automatically detects Prettier, Biome, or oxfmt by walking up from the working directory looking for the binary in `node_modules/.bin/`. Detection order: Prettier → Biome → oxfmt. The manual `formatter` option has been removed.
- **Node.js >= 22 required**: This package uses Node.js native `globSync` API instead of the external glob package, which requires Node.js 22 or higher. If you have an older Node version, please use the original package.

## Installation
```bash
npm install -D @myeasyfarm/vite-plugin-icons-spritesheet
```

## Usage
```javascript
// vite.config.js
import { iconsSpritesheet } from '@myeasyfarm/vite-plugin-icons-spritesheet';

export default {
  plugins: [
     iconsSpritesheet({
      // The path to the icon directory
      inputDir: "icons",
      // Output path for the generated spritesheet file
      outputFile: "public/icons/icon.svg",
      // When set, generates TypeScript types at this path
      typesFile: "app/icons.ts",
      // The cwd, defaults to process.cwd()
      cwd: process.cwd(),
      // Callback function that is called when the script is generating the icon name
      // This is useful if you want to modify the icon name before it is written to the file
      iconNameTransformer: (iconName) => iconName,
    }),
  ],
};
```

You can also pass an array of configs to the plugin to generate multiple spritesheets and types files at the same time (and watch those folders for changes).
```javascript
// vite.config.js
import { iconsSpritesheet } from '@myeasyfarm/vite-plugin-icons-spritesheet';

export default {
  plugins: [
     iconsSpritesheet([
      {
        inputDir: "icons/subset1",
        outputFile: "public/icons1/icon1.svg",
        typesFile: "app/icons1.ts",
      },
      {
        inputDir: "icons/subset2",
        outputFile: "public/icons2/icon2.svg",
        typesFile: "app/icons2.ts",
      },
    ]),
  ],
};
```


Example component file:

```jsx
import spriteHref from "~/path/sprite.svg"
import type { SVGProps } from "react"
import type { IconName } from "~/path/types.ts"

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: IconName
}) {
  return (
    <svg {...props}>
      <use href={`${spriteHref}#${name}`} />
    </svg>
  )
}
```

Component usage:

```jsx
<Icon name="plus" />
```

## Unused icon detection

The package ships with a standalone CLI command to detect icons that are never referenced in your source code.

```bash
npx icons-unused --typesFile ./app/icons.ts
```

Options:
- `--typesFile <path>` (required) — path to the generated TypeScript types file
- `--cwd <dir>` (optional) — working directory, defaults to `process.cwd()`
- `--error` (optional) — exit with code 1 if unused icons are found (useful in CI)

Example output:

```
⚠️  Unused icons:
   - OldIcon
   - DeprecatedIcon
   2 of 15 icons appear unused.
```

The command uses the TypeScript compiler to perform type-aware analysis. It detects icon names used in typed positions (assignments, function arguments, JSX props), comparisons, switch/case statements, and computed template literals. Untyped string literals that happen to match icon names are not counted as usage.

Requirements: `typescript` must be installed as a dependency, and a `tsconfig.json` must be present in the working directory.

## Comparison with alternatives

See [COMPARISON.md](./COMPARISON.md) for a detailed breakdown of how this plugin compares to other Vite SVG sprite plugins.

## Development

```bash
npm test           # run tests
npm run test:watch # run tests in watch mode
npm run validate   # lint + typecheck + tests
```
