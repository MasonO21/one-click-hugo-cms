import fs from 'node:fs';
import path from 'node:path';

/**
 * A package whose required peer dependency is missing bundles fine on web but fails to build for
 * iPhone/Android ("Unable to resolve module ..."). This catches that in unit tests.
 */
const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

function readPkg(dir: string): { peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> } {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

describe('required peer dependencies are installed', () => {
  const missing: string[] = [];
  for (const name of Object.keys(pkg.dependencies)) {
    const dir = path.join(ROOT, 'node_modules', name);
    if (!fs.existsSync(dir)) {
      missing.push(`${name} (declared but not installed)`);
      continue;
    }
    const { peerDependencies = {}, peerDependenciesMeta = {} } = readPkg(dir);
    for (const peer of Object.keys(peerDependencies)) {
      if (peerDependenciesMeta[peer]?.optional) continue;
      try {
        require.resolve(`${peer}/package.json`, { paths: [dir] });
      } catch {
        missing.push(`${peer} (required by ${name})`);
      }
    }
  }

  it('finds every required peer from the package that needs it', () => {
    expect(missing).toEqual([]);
  });

  it('lists the native modules the app imports directly as dependencies', () => {
    const src = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true }) as string[];
    const imports = new Set<string>();
    for (const file of src.filter((f) => /\.(ts|tsx)$/.test(f))) {
      const text = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
      for (const m of text.matchAll(/from '((?:@[\w-]+\/)?[\w-]+)(?:\/[^']*)?'/g)) {
        const name = m[1]!;
        if (!name.startsWith('.') && !['react', 'react-native'].includes(name)) imports.add(name);
      }
    }
    const undeclared = [...imports].filter((n) => !(n in pkg.dependencies) && n !== 'expo' && !n.startsWith('node:'));
    expect(undeclared).toEqual([]);
  });
});
