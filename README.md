# Rei das Carnes — sistema de gestão do açougue

Sistema de balcão para açougue: caixa com leitor de balança, emissão de NFC-e, controle de
estoque, rendimento de carcaça e apuração fiscal.

> As tabelas usam o prefixo `acougue_` por herança do desenho original. Renomear exigiria
> migrar dados já gravados, então os nomes ficaram.

## O que faz

**Caixa** — leitor de código de barras que entende a etiqueta da balança (peso/preço embutidos),
troco, desconto e acréscimo, pagamento dividido em várias formas, teclas de atalho configuráveis,
gaveta com sangria, suprimento e fechamento por conferência.

**Fiscal** — NFC-e (modelo 65) e NF-e (55) via Focus NFe, com consulta, cancelamento,
contingência offline, inutilização de numeração e carta de correção. Apuração de PIS/COFINS
respeitando o CST de cada produto, e geração do SPED EFD ICMS/IPI.

**Estoque** — entrada de mercadoria pela leitura do XML da nota do fornecedor, livro de
movimentação com rastro de cada alteração de saldo, e controle de quebra de peso na câmara fria.

**Carcaça** — tabela de rendimento por corte e precificação que revela o custo real por kg
vendável (o custo da compra engana: cerca de 30% da carcaça não vira produto).

**Produção** — ficha técnica do que é fabricado (linguiça, temperados, kits), consumo de insumos,
lotes com validade e custo real do produzido.

**Clientes** — cadastro com limite de fiado, conta a receber com pagamento parcial e painel de
quem deve, quanto e há quanto tempo.

**Relatórios** — faturamento, ticket médio, venda por dia, por forma de pagamento e por produto,
margem por item e lista de produtos sem estoque.

## Rodando

Requer Node 18+ e PostgreSQL.

```bash
npm ci
cp .env.example .env    # preencha DATABASE_URL e JWT_SECRET
npm start
```

O banco é criado e populado na primeira subida, com o dono do açougue e a tabela de rendimento
de referência. Acesso padrão: `reidascarnes` / `reidascarnes`. **O primeiro login obriga a trocar
essa senha** antes de abrir qualquer tela, e a tela de Equipe avisa enquanto ela estiver em uso.

`JWT_SECRET` é obrigatório (mínimo 24 caracteres): sem ele o servidor não sobe. Não existe mais
fallback — o antigo era público.

## Equipe e papéis

Cada pessoa entra com o próprio usuário. Quem cria os acessos é o dono, em **Equipe e Acessos**:
o sistema gera uma senha provisória (mostrada uma vez) e obriga a pessoa a criar a dela no primeiro
login. Não há recuperação por e-mail: quem esquece a senha pede ao dono outra provisória.

| Papel | Alcança |
|---|---|
| **Dono** | Tudo — fiscal, estoque, relatórios, configurações e a equipe. |
| **Caixa** | O balcão: vender, emitir a NFC-e da venda, gaveta (abrir, sangria, suprimento, fechar), clientes e fiado, conferir etiquetas. |

Com isso o `created_by` das vendas, o `aberto_por`/`fechado_por` da gaveta e o autor de cada
sangria passam a dizer **quem** fez — antes era sempre o mesmo login.

Sessões são revogáveis de verdade: **Sair** encerra a sessão no servidor, trocar a senha derruba
as outras, desativar alguém derruba tudo na hora. Cada pessoa vê e encerra as próprias sessões em
**Minha Conta**; o dono vê o histórico de acessos (logins, tentativas erradas, alterações na
equipe) em Equipe. "Manter conectado" no login vale 7 dias; sem marcar, 12 h.

## Testes

```bash
npm test     # guarda de isolamento + Jest/Supertest contra o Postgres de DATABASE_URL
```

O CI (`.github/workflows/ci.yml`) roda o mesmo em push e PR para `main`, num Postgres 16 próprio.
Ele não faz deploy — o deploy continua manual (ver `deploy/README.md`).

## Emissão fiscal

Sem `FOCUS_NFE_TOKEN` no `.env`, nenhuma nota é transmitida: ela fica gravada como rascunho e o
cupom sai carimbado **SEM VALOR FISCAL**. Isso é intencional — imprimir algo parecido com cupom
fiscal sem autorização da SEFAZ é documento falso.

Para emitir de verdade são necessários, no painel da Focus: CNPJ habilitado, certificado digital
A1 e o CSC (que assina o QR Code). `FOCUS_NFE_ENV=producao` faz **cada venda finalizada virar
nota fiscal real**.

## Scripts

| | |
|---|---|
| `scripts/auditoria-acougue.sh` | 57 cenários de borda; nenhum emite nota fiscal |
| `scripts/importar-produtos.py` | importa catálogo de planilhas (preço + tributação) |
| `scripts/validar-fiscal.js` | confere NCM contra a tabela oficial e a coerência CFOP × CST |
| `scripts/exportar-revisao-fiscal.js` | gera CSV para o contador revisar |

## Limites conhecidos

- **Internet fora da loja para o caixa.** A contingência implementada cobre a SEFAZ fora do ar,
  que é outro problema. Resiliência real contra queda de internet exige o sistema rodando dentro
  da loja, não na nuvem.
- **O SPED nunca foi validado no PVA** da Receita. A coerência interna do arquivo é verificada
  (contadores de registro), mas a aceitação oficial não.
- **A taxa de quebra da câmara fria é uma referência de setor**, não uma medição desta câmara.
  Calibre comparando peso de entrada e saída de carcaças reais.
- **Maquininha e balança não conversam com o sistema.** O vínculo com a balança é só pela
  etiqueta impressa, então preço alterado num lado precisa ser alterado no outro.
