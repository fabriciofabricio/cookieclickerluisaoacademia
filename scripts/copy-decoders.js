// Copia os decoders Draco e Basis (KTX2) do three para public/libs,
// assim o jogo funciona offline sem depender de CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libs = resolve(root, 'node_modules/three/examples/jsm/libs');
const targets = [
  [resolve(libs, 'draco/gltf'), resolve(root, 'public/libs/draco')],
  [resolve(libs, 'basis'), resolve(root, 'public/libs/basis')],
];

for (const [from, to] of targets) {
  if (!existsSync(from)) {
    console.warn(`[copy-decoders] não encontrado: ${from}`);
    continue;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-decoders] ${from} -> ${to}`);
}
