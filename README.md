# esocial-ts

[![CI](https://github.com/AstralunaProject/esocial-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/AstralunaProject/esocial-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/esocial-ts.svg)](https://www.npmjs.com/package/esocial-ts)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

**Gere, valide, assine e envie eventos do eSocial a partir do Node.js.**

Biblioteca TypeScript para o leiaute **S-1.3** (NT 07/2026 rev. 20/10/2026), com os 50 eventos, os XSDs oficiais embutidos e assinatura digital no padrão do Manual de Orientação do Desenvolvedor (MOD v1.16). Roda localmente: o certificado A1 fica com você, sem API de terceiros e sem dependências nativas.

```bash
npm install esocial-ts
```

Requer Node.js 20 ou mais recente.

## Exemplo completo

```ts
import { readFileSync } from "node:fs";
import {
  ClienteEsocial,
  assinarEvento,
  carregarCertificado,
  criarGeradorDeId,
  montarEvento,
  montarLote,
  validarEvento,
} from "esocial-ts";

const certificado = carregarCertificado(readFileSync("empresa.pfx"), process.env.SENHA_CERTIFICADO!);
const empregador = { tpInsc: 1, nrInsc: "12.ABC.345/01DE-35" } as const;
const novoId = criarGeradorDeId(empregador);

// 1. Monte o evento: as chaves seguem os nomes e a ordem do leiaute.
const evento = montarEvento("S-1000", {
  "@Id": novoId(),
  ideEvento: { tpAmb: 2, procEmi: 1, verProc: "meu-erp 1.0" },
  ideEmpregador: { tpInsc: 1, nrInsc: "12ABC345" },
  infoEmpregador: {
    inclusao: {
      idePeriodo: { iniValid: "2026-11" },
      infoCadastro: { classTrib: "99", indCoop: 0, indConstr: 0, indDesFolha: 0, indOptRegEletron: 1 },
    },
  },
});

// 2. Valide contra o XSD oficial antes de assinar.
const { valido, erros } = await validarEvento(evento);
if (!valido) throw new Error(erros.map((e) => e.mensagem).join("\n"));

// 3. Assine e monte o lote (até 50 eventos do mesmo grupo).
const lote = montarLote({
  grupo: 1,
  empregador,
  transmissor: { tpInsc: 1, nrInsc: "12ABC34501DE35" },
  eventos: [assinarEvento(evento, certificado)],
});

// 4. Envie e consulte o processamento.
const esocial = new ClienteEsocial({ certificado, ambiente: "producao-restrita" });
const envio = await esocial.enviarLote(lote);
if (envio.cdResposta !== 201 || !envio.protocoloEnvio) throw new Error(envio.descResposta);

let retorno = await esocial.consultarLote(envio.protocoloEnvio);
while (retorno.cdResposta === 101) {
  await new Promise((r) => setTimeout(r, (retorno.tempoEstimadoConclusao ?? 30) * 1000));
  retorno = await esocial.consultarLote(envio.protocoloEnvio);
}
for (const e of retorno.eventos) console.log(e.id, e.cdResposta, e.nrRecibo, e.ocorrencias);
```

## O que a biblioteca resolve

| Etapa | Função | Regra aplicada |
| --- | --- | --- |
| Id do evento | `gerarIdEvento`, `criarGeradorDeId` | MOD §8.3: `ID` + tipo + inscrição (14, zeros à direita) + data/hora + sequencial. CNPJ base ou completo conforme a natureza jurídica, horário de Brasília independente do fuso do servidor, sequencial que não se repete no mesmo segundo |
| XML | `montarEvento` | Namespace da versão, sem declaração, sem comentários, sem espaços entre tags; tags vazias omitidas (MOD §6.2 e §7.9.10) |
| Validação | `validarEvento`, `validarLote` | XSDs oficiais via libxml2 em WebAssembly, sem binário nativo. Mensagens legíveis: `Element 'indCoop': This element is not expected. Expected is ( classTrib ).` |
| Certificado | `carregarCertificado` | A1 `.pfx`/`.p12`, inclusive PKCS#12 legado (3DES/RC2). Extrai titular, CNPJ/CPF e validade |
| Assinatura | `assinarEvento`, `verificarAssinatura` | MOD §6.7: XMLDSig enveloped, C14N, RSA-SHA256, SHA-256, `Reference URI=""`, só `X509Certificate` no `KeyInfo` |
| Lote | `montarLote` | Até 50 eventos, mesmo grupo e empregador, sem Id repetido. Os eventos assinados entram byte a byte, sem reserializar |
| Envio | `ClienteEsocial` | SOAP 1.1 conforme os WSDLs, TLS mútuo, limite de 750 kB, retorno com protocolo, recibos e ocorrências |

**CNPJ alfanumérico:** suportado em todo o fluxo. A biblioteca normaliza para maiúsculas; o eSocial rejeita letras minúsculas.

### Como a assinatura é conferida

A cada commit, a CI assina um evento e o confere com as implementações de referência do JDK: `javax.xml.crypto` para a assinatura e Xerces para o XSD. Um evento adulterado precisa ser rejeitado. Veja [`test/interop/Verifica.java`](test/interop/Verifica.java).

Duas decisões evitam o erro 142 ("assinatura inválida"):

- os eventos não são reformatados depois de assinados;
- o envelope SOAP usa só namespaces padrão, sem prefixos. Com C14N inclusivo, um `xmlns:soap` declarado no envelope "vazaria" para a canonicalização do evento.

## Montando eventos

O conteúdo é um objeto JavaScript com os nomes de campo do leiaute, **na ordem do XSD**:

- chaves que começam com `@` viram atributos (`"@Id"`);
- arrays repetem o elemento (`dependente: [{...}, {...}]`);
- `null`, `undefined`, `""` e grupos que ficam vazios são omitidos;
- booleanos são recusados: o eSocial usa `"S"`/`"N"`.

Se a ordem ou um campo estiver errado, `validarEvento` aponta o elemento e o que era esperado. Os nomes e a ordem estão nos [leiautes oficiais](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-07-2026-rev-20-10-2026/index.html).

O catálogo dos 50 eventos fica em `EVENTOS`, com o elemento raiz e o nome oficial:

```ts
import { EVENTOS } from "esocial-ts";
EVENTOS["S-2299"]; // { raiz: "evtDeslig", nome: "Desligamento" }
```

## Ambientes

| `ambiente` | Uso | `tpAmb` no evento |
| --- | --- | --- |
| `"producao-restrita"` | Testes, sem efeito jurídico | `2` |
| `"producao"` | Envio real | `1` |

O servidor do eSocial usa a cadeia ICP-Brasil. Se o sistema não a tiver instalada, passe os certificados em `ca` (PEM): a raiz [ICP-Brasil v2](http://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv2.crt) e as ACs da RFB e do SERPRO, listadas no MOD §9.

## Situação e limitações

- **O envio ainda não foi testado contra a produção restrita com um certificado ICP-Brasil real.** Ele segue os WSDLs e o MOD e é testado contra um servidor local com TLS mútuo. Se você testar, conte o resultado numa issue.
- Certificado **A3** (token ou cartão) ainda não é suportado, só A1.
- Os eventos ainda não têm tipos TypeScript campo a campo. A conferência é feita pelo XSD em tempo de execução.
- Não há consulta e download de eventos já enviados (`WsConsultarIdentificadoresEventos` / `WsSolicitarDownloadEventos`).

## Esquemas XSD

Os XSDs em [`schemas/`](schemas) são os oficiais, sem modificação, publicados pelo Governo Federal sob CC BY-ND 3.0. Eles **não** estão sob a licença MIT do projeto; veja [`schemas/NOTICE.md`](schemas/NOTICE.md). Quando sair um pacote novo, os arquivos são substituídos e o catálogo é regenerado com `npm run eventos`.

## Desenvolvimento

```bash
npm install
npm run check   # typecheck, testes, catálogo de eventos e build
```

Os testes rodam com Node.js 22 ou mais recente. O pacote publicado funciona a partir do Node.js 20. Os certificados em `test/fixtures` são autoassinados e só servem para os testes.

## Licença

[MIT](LICENSE), exceto os arquivos em `schemas/` (veja acima).
