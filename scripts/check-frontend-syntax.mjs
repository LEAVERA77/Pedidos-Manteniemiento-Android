#!/usr/bin/env node
/**
 * Comprueba sintaxis de JS del front empaquetado (assets).
 * Uso: node scripts/check-frontend-syntax.mjs
 * made by leavera77
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Raíz de assets: Nexxo por defecto; en Pedidos-MG pasar `.` como argv[2]. */
const assetsRoot = path.resolve(
    process.argv[2] || process.env.GESTORNOVA_ASSETS_ROOT || path.join(__dirname, '..', 'app', 'src', 'main', 'assets')
);

function collectJsFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
            if (name === 'node_modules' || name === '.git') continue;
            collectJsFiles(full, out);
        } else if (name.endsWith('.js') && !name.endsWith('.min.js')) {
            out.push(full);
        }
    }
    return out;
}

const roots = [
    assetsRoot,
    path.join(assetsRoot, 'js'),
    path.join(assetsRoot, 'modules'),
].filter((p) => fs.existsSync(p));

const files = [...new Set(roots.flatMap((r) => collectJsFiles(r)))].sort();
let failed = 0;

for (const file of files) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (e) {
        failed++;
        const rel = path.relative(path.join(__dirname, '..'), file);
        console.error(`FAIL ${rel}`);
        if (e.stderr) console.error(String(e.stderr));
    }
}

console.log(`Frontend syntax: ${files.length} archivos, ${failed} error(es).`);
if (failed > 0) process.exit(1);
