import { defineConfig } from 'vite';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, sep, normalize } from 'node:path';

// Plugin que expõe "virtual:asset-list": a lista de arquivos presentes em
// public/assets. O jogo só tenta carregar o que existe (sem 404 no console)
// e usa os fallbacks procedurais para o resto. Ao adicionar/remover um
// asset com o dev server rodando, a página recarrega sozinha.
function assetListPlugin() {
  const VIRTUAL = 'virtual:asset-list';
  const RESOLVED = '\0' + VIRTUAL;
  const assetsDir = resolve(__dirname, 'public/assets');

  const scan = (dir) => {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      if (statSync(full).isDirectory()) out.push(...scan(full));
      else if (!name.startsWith('.') && !name.toLowerCase().endsWith('.txt') && !name.toLowerCase().endsWith('.md')) {
        out.push(relative(assetsDir, full).split(sep).join('/'));
      }
    }
    return out;
  };

  return {
    name: 'asset-list',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id === RESOLVED) return `export default ${JSON.stringify(scan(assetsDir))};`;
    },
    configureServer(server) {
      server.watcher.add(assetsDir);
      const onChange = (file) => {
        if (!normalize(file).startsWith(normalize(assetsDir))) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig({
  plugins: [assetListPlugin()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
