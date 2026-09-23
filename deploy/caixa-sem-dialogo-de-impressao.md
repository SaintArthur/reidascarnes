# Imprimir o cupom sem o diálogo "Imprimir / Cancelar"

O sistema emite a NFC-e e manda imprimir sozinho — não há nenhuma pergunta do sistema nesse
caminho. Quem pergunta é o **navegador**: `window.print()` abre a janela de impressão, e nenhuma
página da web pode fechá-la por conta própria. É uma trava do navegador, não do sistema: se
qualquer site pudesse imprimir calado, qualquer site imprimiria.

A saída é a mesma que os PDV em navegador usam: ligar o **modo de impressão de quiosque** do
Chrome. Com ele, `window.print()` manda direto para a impressora padrão, sem diálogo nenhum.

## O que fazer, uma vez, na máquina do caixa

**1. Deixe a impressora térmica como padrão do Windows**

Configurações → Bluetooth e dispositivos → Impressoras e scanners → a térmica → *Definir como
padrão*. E desmarque *"Permitir que o Windows gerencie minha impressora padrão"*, senão o
Windows troca a padrão sozinho para a última usada — e um dia o cupom sai na impressora do
escritório.

**2. Crie o atalho do caixa**

Atalho novo na área de trabalho apontando para:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --kiosk --app=http://SERVIDOR:5000
```

Trocando `SERVIDOR` pelo endereço da máquina onde o sistema roda (se for a mesma, `localhost`).

| Parâmetro | Para quê |
|---|---|
| `--kiosk-printing` | **É este que tira o diálogo.** Imprime direto na impressora padrão. |
| `--kiosk` | Tela cheia sem barra de endereço — o operador não navega para outro lugar nem fecha sem querer. |
| `--app=` | Abre sem abas e sem botões de navegação. |

**3. Confira o tamanho do papel**

Na primeira impressão, ajuste o papel da térmica para 80 mm nas preferências da impressora. O
cupom já vem com `@page { size: 80mm auto }`, mas o driver precisa concordar.

## Como saber que funcionou

Finalize uma venda. O cupom tem que sair **sem nenhuma janela aparecer**. Se a janela de
impressão aparecer, o Chrome foi aberto sem o `--kiosk-printing` — quase sempre porque alguém
abriu pelo ícone normal do Chrome em vez do atalho do caixa.

## Por que não dá para resolver no código

Não existe API de navegador que imprima sem diálogo. As alternativas seriam trocar a natureza
do programa:

- **Agente local de impressão** — um pequeno programa na máquina do caixa recebendo o cupom e
  mandando para a impressora. Funciona, mas é mais uma peça para instalar e manter em cada
  balcão.
- **Empacotar em Electron** — o sistema viraria um aplicativo de desktop, que pode imprimir
  calado. Muda o modelo de distribuição inteiro.

O `--kiosk-printing` entrega o mesmo resultado sem instalar nada e sem mudar o sistema.

## Enquanto isso, o resto já é automático

Pelo sistema, uma venda em dinheiro finalizada faz tudo sozinha, sem perguntar nada:

1. grava a venda e baixa o estoque;
2. emite a NFC-e na SEFAZ (ou registra como rascunho, se a Focus não estiver configurada);
3. abre a gaveta, se o pagamento tiver espécie;
4. manda o DANFE para a impressora.

A Focus tem prazo de 15 segundos (`FOCUS_TIMEOUT_MS`). Estourando, a venda **não trava**: ela
fica gravada, sai o comprovante carimbado *SEM VALOR FISCAL*, e a nota se emite depois em
Relatórios › Histórico de vendas.
