import { globby } from 'globby';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { build } from 'tsup';

const subpaths = ['cli', 'meta', 'types', 'utils'];

await build({
  name: 'lithia',
  entry: [
    'src/cli/index.ts',
    'src/meta/index.ts',
    'src/types/index.ts',
    'src/utils/index.ts',
  ],
  target: 'esnext',
  platform: 'node',
  bundle: true,
  external: subpaths.map((subpath) => `lithia/${subpath}`),
  dts: true,
  minify: false,
  treeshake: {
    preset: 'recommended',
  },
  format: ['esm'],
  cjsInterop: false,
  clean: true,
  async onSuccess() {
    for (const subpath of subpaths) {
      await writeFile(
        `./${subpath}.d.ts`,
        `export * from "./dist/${subpath}/index"`,
      );
    }
  },
});

await globby('.', {
  cwd: join(process.cwd(), 'dist'),
  absolute: true,
  dot: true,
}).then(async (paths) => {
  for await (const fullPath of paths) {
    const content = await readFile(fullPath, 'utf-8');

    await writeFile(
      fullPath,
      content.replace(
        /(import|export)\s*\{([a-zA-Z0-9_,\s$]*)\}\s*from\s*['"](lithia(?:\/[a-zA-Z0-9_-]+)?)['"]/g,
        (match, type, items, lithiaPath) => {
          const pathMap: Record<string, string> = {
            'lithia/cli': './cli',
            'lithia/meta': './meta',
            'lithia/types': './types',
            'lithia/utils': './utils',
          };

          const resolvedPath = pathMap[lithiaPath];
          if (!resolvedPath) return match;

          let relativePath = relative(
            dirname(fullPath),
            join(process.cwd(), 'dist', resolvedPath, 'index.js'),
          );

          if (relativePath[0] !== '.') {
            relativePath = `./${relativePath}`;
          }

          return `${type} {${items}} from "${relativePath}"`;
        },
      ),
    );
  }
});
