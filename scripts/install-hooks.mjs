// Turns on the repository's git hooks (the secret check, then the frontend tests) for this clone. Runs after `npm install` in frontend/, or by hand:  node scripts/install-hooks.mjs
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
    const dir = join(root, '.githooks');
    if (existsSync(dir)) for (const file of readdirSync(dir)) { try { chmodSync(join(dir, file), 0o755); } catch { /* not needed on Windows */ } }
    console.log('Git hooks are on: commits are checked for secrets, and the frontend tests run when frontend files change.');
} catch {
    // Not a git checkout (a source download, a CI cache): nothing to turn on
}
