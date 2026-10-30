import { ErroEsocial } from "./erros.ts";
import { EVENTOS, VERSAO_LEIAUTE, type CodigoEvento } from "./eventos.ts";
import { paraXml, type ObjetoXml } from "./xml.ts";

export function namespaceDoEvento(codigo: CodigoEvento) {
  return `http://www.esocial.gov.br/schema/evt/${EVENTOS[codigo].raiz}/${VERSAO_LEIAUTE}`;
}

/**
 * Monta o XML de um evento, sem declaração XML (eventos dentro do lote não podem tê-la).
 *
 * @example
 * montarEvento("S-1000", {
 *   "@Id": gerarIdEvento(empregador),
 *   ideEvento: { tpAmb: 2, procEmi: 1, verProc: "meu-erp 1.0" },
 *   ideEmpregador: { tpInsc: 1, nrInsc: "12345678" },
 *   infoEmpregador: { inclusao: { ... } },
 * });
 */
export function montarEvento(codigo: CodigoEvento, conteudo: ObjetoXml) {
  const evento = EVENTOS[codigo];
  if (!evento) throw new ErroEsocial(`evento desconhecido: ${codigo}`);
  const id = conteudo["@Id"];
  if (typeof id !== "string" || !/^ID[12][A-Z0-9]{12}\d{21}$/.test(id)) {
    throw new ErroEsocial(`${codigo}: "@Id" ausente ou fora do padrão; use gerarIdEvento()`);
  }
  const { "@Id": _, ...corpo } = conteudo;
  const interno = paraXml(evento.raiz, { "@Id": id, ...corpo });
  return `<eSocial xmlns="${namespaceDoEvento(codigo)}">${interno}</eSocial>`;
}

/** Descobre o código do evento (ex.: "S-2200") pelo namespace do XML. */
export function codigoDoEvento(xml: string): CodigoEvento {
  const ns = /<eSocial\b[^>]*\sxmlns="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/(\w+)\/v_S_\d{2}_\d{2}_\d{2}"/.exec(xml)?.[1];
  const codigo = (Object.keys(EVENTOS) as CodigoEvento[]).find((c) => EVENTOS[c].raiz === ns);
  if (!codigo) throw new ErroEsocial("namespace de evento do eSocial não encontrado no XML");
  return codigo;
}

/** Lê o atributo Id do elemento do evento. */
export function idDoEvento(xml: string) {
  const id = /<evt\w+\s[^>]*\bId="(ID[12][A-Z0-9]{12}\d{21})"/.exec(xml)?.[1];
  if (!id) throw new ErroEsocial("Id do evento não encontrado no XML");
  return id;
}
