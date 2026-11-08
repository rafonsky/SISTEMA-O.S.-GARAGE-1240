// Servidor estático mínimo só para desenvolvimento: node scripts/serve.mjs [porta]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};
const porta = Number(process.argv[2] ?? 5173);

createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const arquivo = join(process.cwd(), caminho === '' ? 'index.html' : caminho);
  if (!arquivo.startsWith(process.cwd()) || /(^|[/\\])(backup|\.git|node_modules)([/\\]|$)/.test(caminho)) {
    res.writeHead(403).end('negado');
    return;
  }
  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('não encontrado');
  }
}).listen(porta, '127.0.0.1', () => console.log(`http://localhost:${porta}/?emulador`));
