// Генерує docs/CODE_MAP.md: класи, методи й експорти кожного модуля з номерами рядків.
//   node scripts/code-map.mjs          перезаписати карту
//   node scripts/code-map.mjs --check  лише перевірити: карта свіжа, кожен файл є в docs/FILE_TREE.md, шляхи в документах існують
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'docs/CODE_MAP.md', TREE = 'docs/FILE_TREE.md';
const DOCS = ['README.md', 'CLAUDE.md', 'AGENTS.md', 'docs/ARCHITECTURE.md', 'docs/WHERE_TO_CHANGE.md', TREE];
const KEYWORD = /^(if|for|while|switch|catch|return|function)$/;
const files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);

function mapJs(f, lines) {
  const exp = [], fns = [], classes = [];
  let cls = null;
  lines.forEach((l, i) => {
    const n = i + 1;
    let m = /^(?:export )?class (\w+)/.exec(l);
    if (m) { cls = { name: m[1], line: n, methods: [] }; classes.push(cls); return; }
    if (/^}/.test(l)) cls = null;
    if (cls && (m = /^  (?:async |static |get |set )*([A-Za-z_$][\w$]*)\(.*\)\s*\{/.exec(l)) && !KEYWORD.test(m[1])) cls.methods.push(`${m[1]}:${n}`);
    if ((m = /^export (?:async )?(?:const|let|function) (\w+)/.exec(l))) exp.push(`${m[1]}:${n}`);
    else if ((m = /^(?:async )?function (\w+)/.exec(l))) fns.push(`${m[1]}:${n}`);
  });
  let out = '';
  if (exp.length) out += `- Експорти: ${exp.join(', ')}\n`;
  if (fns.length) out += `- Внутрішні функції: ${fns.join(', ')}\n`;
  for (const c of classes) out += `- **${c.name}** :${c.line}${c.methods.length ? `\n  ${c.methods.join(', ')}` : ''}\n`;
  return out;
}

function mapCss(lines) {
  const secs = [];
  lines.forEach((l, i) => {
    const m = /^\/\*[\s=-]*(.*?)[\s=-]*\*\/\s*$/.exec(l);
    if (m && m[1]) secs.push(`${m[1]}:${i + 1}`);
  });
  return secs.length ? `- Розділи: ${secs.join(' · ')}\n` : '';
}

function build() {
  let md = '# Карта коду\n\nЗгенеровано `npm run docs:map`, руками не правити. Запис `назва:рядок` веде до оголошення в цьому файлі.\n'
    + 'Рядки зсуваються з кожною правкою: якщо карта застаріла, перегенеруй її або шукай за назвою.\n';
  for (const f of files.filter((x) => /^src\/.*\.(js|css)$/.test(x)).sort()) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    const head = /^(?:\/\/|\/\*\*?)\s*(.*?)(?:\s*\*\/)?$/.exec(lines[0]);
    md += `\n## ${f} (${lines.length - 1} рядків)\n\n`;
    if (head && head[1]) md += `${head[1]}\n\n`;
    md += f.endsWith('.css') ? mapCss(lines) : mapJs(f, lines);
  }
  return md;
}

/** Шляхи з дерева: глибина визначається відступом у 4 символи перед ├── або └──. */
function treePaths() {
  const stack = [], paths = new Set();
  for (const l of fs.readFileSync(TREE, 'utf8').split(/\r?\n/)) {
    const m = /^((?:[│ ] {3})*)[├└]── (\S+)/.exec(l);
    if (!m) continue;
    const d = m[1].length / 4, name = m[2].replace(/\/$/, '');
    stack.length = d; stack[d] = name;
    paths.add(stack.join('/'));
  }
  return paths;
}

const map = build();
if (!process.argv.includes('--check')) {
  fs.writeFileSync(OUT, map);
  console.log(`${OUT} оновлено`);
} else {
  const errs = [];
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (!fs.existsSync(OUT) || norm(fs.readFileSync(OUT, 'utf8')) !== norm(map)) errs.push(`${OUT} застарів: запусти npm run docs:map`);
  const tree = treePaths();
  for (const f of files) if (!tree.has(f)) errs.push(`${TREE}: немає файлу ${f}`);
  for (const p of tree) if (!files.includes(p) && !files.some((f) => f.startsWith(p + '/'))) errs.push(`${TREE}: файлу вже нема: ${p}`);
  const re = /`((?:src|public|store|docs|scripts|\.github)\/[^`\s:*]+)|\]\(((?:src|public|store|docs|scripts|\.github)\/[^)\s:#]+)|\]\(\.\.\/((?:src|public|store|docs|scripts)\/[^)\s:#]+)/g;
  for (const d of DOCS) {
    for (const m of fs.readFileSync(d, 'utf8').matchAll(re)) {
      const p = (m[1] || m[2] || m[3]).replace(/\/$/, '');
      if (!fs.existsSync(p)) errs.push(`${d}: немає шляху ${p}`);
    }
  }
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log(`Документи в порядку: ${files.length} файлів у дереві, карта свіжа, шляхи існують`);
}
