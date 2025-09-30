import { build } from 'tsup';

async function main() {
  await build({
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    target: 'esnext',
    platform: 'node',
    bundle: true,
    dts: false,
    minify: false,
    treeshake: {
      preset: 'recommended',
    },
    format: ['esm'],
    cjsInterop: false,
    clean: true,
  });
}

main().catch(console.error);
