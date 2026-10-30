import { ErroEsocial } from "./erros.ts";

export type TipoInscricao = 1 | 2;

export interface Inscricao {
  /** 1 = CNPJ, 2 = CPF */
  tpInsc: TipoInscricao;
  nrInsc: string;
}

const NATUREZAS_COM_CNPJ_COMPLETO = new Set(["1015", "1040", "1074", "1163"]);
const FORMATO_ID = /^ID[12][A-Z0-9]{12}\d{21}$/;

const partesBrasilia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function carimbo(data: Date) {
  const p = Object.fromEntries(partesBrasilia.formatToParts(data).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

/** Remove pontuação e normaliza letras do CNPJ alfanumérico para maiúsculas. */
export function limparInscricao(valor: string) {
  return valor.replace(/[.\/\-\s]/g, "").toUpperCase();
}

/**
 * Número de inscrição como vai no Id e no ideEmpregador: CNPJ base (8) ou completo (14) e CPF (11).
 * O CNPJ completo é exigido para as naturezas jurídicas 1015, 1040, 1074 e 1163 (MOD §8.3).
 */
export function inscricaoDoEmpregador({ tpInsc, nrInsc }: Inscricao, naturezaJuridica?: string): Inscricao {
  const numero = limparInscricao(nrInsc);
  if (tpInsc === 2) {
    if (!/^\d{11}$/.test(numero)) throw new ErroEsocial(`CPF inválido: ${nrInsc}`);
    return { tpInsc, nrInsc: numero };
  }
  if (/^[A-Z0-9]{8}$/.test(numero)) return { tpInsc, nrInsc: numero };
  if (!/^[A-Z0-9]{12}\d{2}$/.test(numero)) throw new ErroEsocial(`CNPJ inválido: ${nrInsc}`);
  const completo = naturezaJuridica !== undefined && NATUREZAS_COM_CNPJ_COMPLETO.has(naturezaJuridica.replace(/\D/g, ""));
  return { tpInsc, nrInsc: completo ? numero : numero.slice(0, 8) };
}

export interface OpcoesId {
  dataHora?: Date;
  sequencial?: number;
  naturezaJuridica?: string;
}

/**
 * Gera o Id do evento: "ID" + tpInsc + nrInsc (14, zeros à direita) + AAAAMMDDhhmmss + sequencial (5).
 * A data e hora usam o horário de Brasília, independente do fuso do servidor.
 */
export function gerarIdEvento(empregador: Inscricao, { dataHora = new Date(), sequencial = 1, naturezaJuridica }: OpcoesId = {}) {
  if (!Number.isInteger(sequencial) || sequencial < 1 || sequencial > 99999) {
    throw new ErroEsocial(`sequencial deve estar entre 1 e 99999: ${sequencial}`);
  }
  const { tpInsc, nrInsc } = inscricaoDoEmpregador(empregador, naturezaJuridica);
  const id = `ID${tpInsc}${nrInsc.padEnd(14, "0")}${carimbo(dataHora)}${String(sequencial).padStart(5, "0")}`;
  if (!FORMATO_ID.test(id)) throw new ErroEsocial(`Id gerado fora do padrão do eSocial: ${id}`);
  return id;
}

/**
 * Gerador que nunca repete Id: incrementa o sequencial dentro do mesmo segundo.
 */
export function criarGeradorDeId(empregador: Inscricao, opcoes: Pick<OpcoesId, "naturezaJuridica"> = {}) {
  let ultimo = "";
  let sequencial = 0;
  return (dataHora = new Date()) => {
    const atual = carimbo(dataHora);
    sequencial = atual === ultimo ? sequencial + 1 : 1;
    ultimo = atual;
    return gerarIdEvento(empregador, { ...opcoes, dataHora, sequencial });
  };
}
