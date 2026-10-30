import { ErroEsocial } from "./erros.ts";
import { codigoDoEvento, idDoEvento } from "./evento.ts";
import { inscricaoDoEmpregador, type Inscricao } from "./id.ts";

export const NAMESPACE_LOTE = "http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1";
export const MAX_EVENTOS_POR_LOTE = 50;

/** 1 = eventos de tabela, 2 = não periódicos, 3 = periódicos. */
export type GrupoLote = 1 | 2 | 3;

export interface OpcoesLote {
  grupo: GrupoLote;
  empregador: Inscricao;
  transmissor: Inscricao;
  /** Eventos já assinados. São inseridos byte a byte, sem reserializar, para não invalidar a assinatura. */
  eventos: string[];
  naturezaJuridica?: string;
}

function grupoEsperado(codigo: string): GrupoLote | null {
  const n = Number(codigo.slice(2));
  if (n >= 1000 && n < 1200) return 1;
  if (n >= 1200 && n < 1300) return 3;
  if (n >= 2000 && n < 3000) return 2;
  return null;
}

function semDeclaracao(xml: string) {
  return xml.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, "").trim();
}

/** Monta o lote de envio (EnvioLoteEventos v1.1.1), pronto para o webservice. */
export function montarLote({ grupo, empregador, transmissor, eventos, naturezaJuridica }: OpcoesLote) {
  if (eventos.length === 0) throw new ErroEsocial("o lote precisa de ao menos um evento");
  if (eventos.length > MAX_EVENTOS_POR_LOTE) {
    throw new ErroEsocial(`o lote aceita no máximo ${MAX_EVENTOS_POR_LOTE} eventos (recebeu ${eventos.length})`);
  }
  const ideEmpregador = inscricaoDoEmpregador(empregador, naturezaJuridica);
  const ideTransmissor = { tpInsc: transmissor.tpInsc, nrInsc: transmissor.nrInsc.replace(/[.\/\-\s]/g, "").toUpperCase() };

  const vistos = new Set<string>();
  const itens = eventos.map((bruto, i) => {
    const xml = semDeclaracao(bruto);
    const codigo = codigoDoEvento(xml);
    const id = idDoEvento(xml);
    const posicao = `evento ${i + 1} (${codigo}, ${id})`;
    if (!xml.includes("<Signature")) throw new ErroEsocial(`${posicao}: não está assinado`);
    if (codigo.startsWith("S-5")) throw new ErroEsocial(`${posicao}: eventos S-5xxx são totalizadores devolvidos pelo eSocial, não são enviados`);
    const esperado = grupoEsperado(codigo);
    if (esperado !== null && esperado !== grupo) {
      throw new ErroEsocial(`${posicao}: pertence ao grupo ${esperado}, mas o lote é do grupo ${grupo}`);
    }
    const nrInsc = /<ideEmpregador>\s*<tpInsc>\d<\/tpInsc>\s*<nrInsc>([^<]+)<\/nrInsc>/.exec(xml)?.[1];
    if (nrInsc !== undefined && nrInsc !== ideEmpregador.nrInsc) {
      throw new ErroEsocial(`${posicao}: empregador ${nrInsc} difere do empregador do lote (${ideEmpregador.nrInsc})`);
    }
    if (vistos.has(id)) throw new ErroEsocial(`${posicao}: Id repetido no lote`);
    vistos.add(id);
    return `<evento Id="${id}">${xml}</evento>`;
  });

  return (
    `<eSocial xmlns="${NAMESPACE_LOTE}"><envioLoteEventos grupo="${grupo}">` +
    `<ideEmpregador><tpInsc>${ideEmpregador.tpInsc}</tpInsc><nrInsc>${ideEmpregador.nrInsc}</nrInsc></ideEmpregador>` +
    `<ideTransmissor><tpInsc>${ideTransmissor.tpInsc}</tpInsc><nrInsc>${ideTransmissor.nrInsc}</nrInsc></ideTransmissor>` +
    `<eventos>${itens.join("")}</eventos></envioLoteEventos></eSocial>`
  );
}
