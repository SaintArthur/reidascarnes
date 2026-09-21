#!/usr/bin/env python3
"""
Importa o catálogo de produtos do açougue a partir das duas planilhas exportadas do
sistema antigo, casando-as pelo código do produto.

Por que duas planilhas: nenhuma delas sozinha basta.
  - "PLanilha produtos1"     → tributação (NCM, CFOP, CEST, CST de ICMS/PIS/COFINS)
  - "relatorio_de_produtos"  → preço de venda, unidade e categoria

O campo CODIGO das planilhas é o mesmo número que o produto tem NA BALANÇA (o PLU), que é
o que a etiqueta traz embutida no código de barras — por isso ele vira `scale_code` aqui, e
não `barcode`. A coluna CODIGO_BARRAS das planilhas repete o código interno (o GTIN vem
como "SEM GTIN"), então não é um EAN de fábrica e é descartada.

Idempotente: rodar de novo atualiza os produtos existentes pelo PLU em vez de duplicar.
Use quando os preços mudarem — reexporte as planilhas e rode outra vez.

Uso:
    python3 scripts/importar-produtos.py <planilha_fiscal.xlsx> <planilha_precos.xlsx> \
        [--api http://localhost:5001] [--usuario reidascarnes] [--dry-run]

A senha é lida da variável de ambiente ACOUGUE_SENHA (ou perguntada no terminal), nunca
passada por argumento — argumento de linha de comando fica gravado no histórico do shell.
"""
import argparse, json, os, re, sys, getpass, urllib.request, urllib.error

try:
    import openpyxl
except ImportError:
    sys.exit("Falta a biblioteca openpyxl. Instale com: pip3 install openpyxl")

# Categorias das planilhas → categorias do sistema.
CATEGORIAS = {'acougue': 'corte', 'mercadorias': 'outro', 'bebidas': 'outro'}
UNIDADES = {'KG': 'kg', 'UN': 'un', 'SC': 'un'}


def ler_planilha(caminho):
    ws = openpyxl.load_workbook(caminho, data_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    cabecalho = [str(h).strip() if h is not None else '' for h in next(it)]
    return [dict(zip(cabecalho, linha)) for linha in it if any(c is not None for c in linha)]


def texto(valor):
    """Normaliza célula para string limpa, tratando o None e o 0 que o Excel espalha."""
    if valor is None:
        return None
    s = str(valor).strip()
    return s or None


def numero(valor):
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n


def normalizar(s):
    """Uppercase sem acento, para comparar descrições que divergem entre as duas planilhas
    ('Costela gaúcha' x 'COSTELA GAUCHA')."""
    if not s:
        return ''
    acentos = str.maketrans('ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
    return ' '.join(str(s).strip().upper().translate(acentos).split())


def semelhanca(a, b):
    """Fração de palavras em comum. Suficiente aqui: as descrições são curtas e as
    diferenças são de acento, caixa e espaço, não de vocabulário."""
    ta, tb = set(normalizar(a).split()), set(normalizar(b).split())
    return len(ta & tb) / max(len(ta | tb), 1)


def montar_catalogo(fiscal, precos):
    """Casa as duas planilhas pelo código. Só entra produto que tem preço — sem preço o
    caixa não consegue vender, e o peso da etiqueta de balança nem é calculável.

    Cuidado com o código repetido: nas planilhas exportadas o mesmo CODIGO aparece em
    produtos diferentes (o 2 é COSTELA e também SUCO LARANJA 300ML). Casar só pelo número
    aplicaria a tributação do suco na costela. Por isso, quando há mais de uma linha fiscal
    para o mesmo código, escolhemos pela descrição — e se nenhuma parecer, preferimos deixar
    sem tributação a chutar, porque CFOP/CST errado vira nota rejeitada ou imposto errado."""
    por_codigo = {}
    for r in fiscal:
        codigo = texto(r.get('CODIGO'))
        if codigo:
            por_codigo.setdefault(codigo, []).append(r)

    catalogo, sem_fiscal, ambiguos = [], [], []
    for r in precos:
        codigo = texto(r.get('Código'))
        preco = numero(r.get('Valor'))
        if not codigo or preco is None:
            continue

        candidatas = por_codigo.get(codigo, [])
        descricao = r.get('Descrição', '')
        if len(candidatas) == 1:
            f = candidatas[0]
        elif candidatas:
            melhor = max(candidatas, key=lambda c: semelhanca(descricao, c.get('DESCRICAO')))
            if semelhanca(descricao, melhor.get('DESCRICAO')) >= 0.5:
                f = melhor
            else:
                f = {}
                ambiguos.append(f"{codigo} ({descricao})")
        else:
            f = {}

        if not f:
            sem_fiscal.append(codigo)

        categoria = CATEGORIAS.get(str(r.get('Categoria', '')).strip().lower(), 'outro')
        # O Excel guarda NCM como número e come o zero à esquerda: "02013000" volta como
        # 2013000. A SEFAZ exige 8 dígitos e rejeita a nota com 7 — repõe o zero.
        ncm = texto(f.get('NCM')) or texto(r.get('NCM'))
        if ncm:
            ncm = ''.join(ch for ch in ncm if ch.isdigit()).zfill(8)
        # CEST vem em dois formatos nas planilhas ("17.084.00" e "1708400"); a SEFAZ quer só
        # os dígitos.
        cest = texto(f.get('CEST'))
        if cest:
            cest = ''.join(ch for ch in cest if ch.isdigit()) or None

        # O CFOP às vezes vem rotulado na planilha ("5102 -  Tributação padrão"). A SEFAZ
        # espera só os 4 dígitos — mandar o rótulo junto faz a nota ser rejeitada.
        cfop = texto(f.get('CFOP')) or texto(r.get('Tributação'))
        if cfop:
            m = re.match(r'\s*(\d{4})', cfop)
            cfop = m.group(1) if m else None

        catalogo.append({
            'scale_code': codigo,
            'name': str(r.get('Descrição', '')).strip(),
            'price': preco,
            'unit': UNIDADES.get(str(r.get('Unidade', '')).strip().upper(), 'un'),
            'category': categoria,
            'barcode': None,
            'ncm': ncm,
            'cfop': cfop,
            'cest': cest,
            'origem': texto(f.get('ICMS_ORIGEM')) or '0',
            'icms_cst': texto(f.get('ICMS_CST')),
            'icms_aliquota': numero(f.get('ICMS_ALIQUOTA')),
            'icms_reducao_bc': numero(f.get('ICMS_ALIQUOTA_REDUCAO')),
            'pis_cst': texto(f.get('PIS_CST')) or texto(r.get('Pis/Cofins Saidas')),
            'cofins_cst': texto(f.get('COFINS_CST')) or texto(r.get('Pis/Cofins Saidas')),
        })
    return catalogo, sem_fiscal, ambiguos


def api(metodo, url, token=None, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        corpo_erro = e.read()
        try:
            return e.code, json.loads(corpo_erro or b'{}')
        except json.JSONDecodeError:
            return e.code, {'error': corpo_erro.decode('utf-8', 'replace')[:200]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('planilha_fiscal')
    ap.add_argument('planilha_precos')
    ap.add_argument('--api', default='http://localhost:5001')
    ap.add_argument('--usuario', default='reidascarnes')
    ap.add_argument('--dry-run', action='store_true', help='mostra o que faria, sem gravar')
    args = ap.parse_args()

    catalogo, sem_fiscal, ambiguos = montar_catalogo(
        ler_planilha(args.planilha_fiscal), ler_planilha(args.planilha_precos))

    print(f"{len(catalogo)} produtos prontos para importar")
    if sem_fiscal:
        print(f"  aviso: {len(sem_fiscal)} sem tributação (entram, mas não emitem NFC-e "
              f"até alguém preencher): {', '.join(sem_fiscal[:8])}"
              + (' ...' if len(sem_fiscal) > 8 else ''))
    if ambiguos:
        print(f"  ATENÇÃO: {len(ambiguos)} com código repetido na planilha fiscal e descrição "
              f"que não bate — ficaram SEM tributação de propósito: {', '.join(ambiguos[:5])}")

    if args.dry_run:
        for p in catalogo[:10]:
            print(f"  PLU {p['scale_code']:>6}  {p['name'][:28]:<28} R$ {p['price']:>8.2f}/{p['unit']}"
                  f"  NCM {p['ncm']} CFOP {p['cfop']} CST {p['icms_cst']}")
        print("  (dry-run — nada foi gravado)")
        return

    senha = os.environ.get('ACOUGUE_SENHA') or getpass.getpass(f"Senha de {args.usuario}: ")
    status, dados = api('POST', f"{args.api}/api/auth/login",
                        corpo={'email': args.usuario, 'password': senha})
    if status != 200 or 'token' not in dados:
        sys.exit(f"Falha no login ({status}): {dados.get('error', dados)}")
    token = dados['token']

    status, existentes = api('GET', f"{args.api}/api/acougue/products", token)
    if status != 200:
        sys.exit(f"Não consegui listar os produtos atuais ({status}): {existentes}")
    por_plu = {str(p['scale_code']): p['id'] for p in existentes if p.get('scale_code')}

    criados = atualizados = falhas = 0
    for p in catalogo:
        if p['scale_code'] in por_plu:
            st, resp = api('PATCH', f"{args.api}/api/acougue/products/{por_plu[p['scale_code']]}", token, p)
            ok = st == 200
            atualizados += ok
        else:
            st, resp = api('POST', f"{args.api}/api/acougue/products", token, p)
            ok = st == 201
            criados += ok
        if not ok:
            falhas += 1
            print(f"  ERRO PLU {p['scale_code']} ({p['name'][:24]}): {resp.get('error', st)}")

    print(f"\n{criados} criados, {atualizados} atualizados, {falhas} falhas")


if __name__ == '__main__':
    main()
