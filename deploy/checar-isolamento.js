#!/usr/bin/env node
// Guarda de isolamento: impede que este projeto volte a apontar para a infraestrutura do
// sistema do qual ele foi forkado.
//
// Por que existe: o Rei das Carnes nasceu como fork de outro sistema e herdou os scripts de
// deploy INTACTOS — mesmo segredo, mesmo bucket, mesma IAM role, mesmo ALB, mesmo nome de banco.
// O `deploy/fetch-env.sh` era byte a byte idêntico ao do outro projeto. Rodar o deploy daqui
// mexia na infraestrutura de produção alheia. Pior: o `setup-aws.sh` grava o segredo com
// `put-secret-value`, que SUBSTITUI o conteúdo inteiro — apontar para o segredo errado apaga as
// chaves do outro sistema.
//
// Um `sed` distraído numa próxima cópia recoloca tudo. Por isso a checagem é automática.
//
// Uso: node deploy/checar-isolamento.js
// Sai com código 1 se encontrar qualquer referência proibida.

const { readFileSync, readdirSync, statSync } = require('fs');
const { join, relative } = require('path');

const RAIZ = join(__dirname, '..');

// Cada padrão é um recurso CONCRETO de outro sistema, nunca uma palavra genérica — uma guarda que
// dá falso positivo é uma guarda que alguém desliga.
const PROIBIDOS = [
  { re: /csbarber\/app-env/, motivo: 'segredo do Secrets Manager de outro sistema' },
  { re: /\/etc\/csbarber/, motivo: 'diretório de env de outro sistema' },
  { re: /csbarber\.service/, motivo: 'unit systemd de outro sistema' },
  { re: /csbarber-(ec2-role|ec2-profile|app-access|photos|alb|tg|alb-sg)/, motivo: 'recurso AWS de outro sistema' },
  { re: /\bbarberpro\b/, motivo: 'banco de dados de outro sistema' },
  // Descoberta de Aurora por posição na lista: `| [0]` não tem ordem garantida, então com mais de
  // um cluster na conta o script escolhe em silêncio o errado — e o endpoint dele vai pro segredo.
  { re: /DBClusters\[[^\]]*\][^\n]*\|\s*\[0\]/, motivo: 'cluster Aurora escolhido por posição na lista' },
];

// Escopo: só o que pode causar uma AÇÃO contra infraestrutura. A documentação histórica herdada do
// fork (ESTRUTURA.md, GUIA-FINAL, DEPLOY-HOSTGATOR) fica de fora de propósito — é texto morto, e
// varrer tudo transformaria esta guarda em ruído que ninguém respeita.
const ESCOPO = [/^deploy\//, /^\.env\.example$/];

const IGNORAR_DIR = new Set(['node_modules', '.git', 'public']);

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else saida.push(caminho);
  }
  return saida;
}

const problemas = [];
for (const caminho of arquivos(RAIZ)) {
  const rel = relative(RAIZ, caminho);
  if (!ESCOPO.some(re => re.test(rel))) continue;
  if (caminho === __filename) continue;   // este arquivo cita os padrões de propósito

  let linhas;
  try {
    linhas = readFileSync(caminho, 'utf8').split('\n');
  } catch {
    continue;   // binário
  }
  linhas.forEach((linha, i) => {
    for (const { re, motivo } of PROIBIDOS) {
      if (re.test(linha)) problemas.push(`${rel}:${i + 1}  ${motivo}\n      ${linha.trim()}`);
    }
  });
}

if (problemas.length > 0) {
  console.error('\nIsolamento quebrado — este projeto voltou a referenciar infraestrutura de outro sistema:\n');
  problemas.forEach(p => console.error('  ' + p + '\n'));
  console.error(`${problemas.length} ocorrência(s). Use os recursos do Rei das Carnes.\n`);
  process.exit(1);
}

console.log('Isolamento OK: nenhuma referência à infraestrutura do sistema de origem.');
