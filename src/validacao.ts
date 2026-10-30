import { readFileSync } from "node:fs";
import { validateXML } from "xmllint-wasm";
import { EVENTOS, VERSAO_LEIAUTE } from "./eventos.ts";
import { codigoDoEvento } from "./evento.ts";

export interface ErroDeValidacao {
  linha: number | null;
  mensagem: string;
}

export interface ResultadoValidacao {
  valido: boolean;
  erros: ErroDeValidacao[];
}

const PASTA_EVENTOS = new URL(`../schemas/eventos/${VERSAO_LEIAUTE}/`, import.meta.url);
const PASTA_COMUNICACAO = new URL("../schemas/comunicacao/", import.meta.url);
const ASSINATURA_AUSENTE = /Missing child element\(s\)\. Expected is \( \{http:\/\/www\.w3\.org\/2000\/09\/xmldsig#\}Signature \)/;

const cache = new Map<string, string>();
function xsd(pasta: URL, arquivo: string) {
  const chave = pasta.href + arquivo;
  let conteudo = cache.get(chave);
  if (conteudo === undefined) {
    conteudo = readFileSync(new URL(arquivo, pasta), "utf8").replace(/^﻿/, "");
    cache.set(chave, conteudo);
  }
  return { fileName: arquivo, contents: conteudo };
}

function legivel(mensagem: string) {
  return mensagem
    .replace(/^Schemas validity error : /, "")
    .replace(/\{http:\/\/www\.esocial\.gov\.br\/schema\/[^}]+\}/g, "")
    .trim();
}

async function validar(xml: string, schema: { fileName: string; contents: string }, preload: { fileName: string; contents: string }[]) {
  const resultado = await validateXML({ xml: [{ fileName: "documento.xml", contents: xml }], schema: [schema], preload });
  return resultado.errors.map((e) => ({ linha: e.loc?.lineNumber ?? null, mensagem: legivel(e.message) }));
}

/**
 * Valida um evento contra o XSD oficial do leiaute.
 * Antes da assinatura, a ausência de <Signature> não é contada como erro.
 */
export async function validarEvento(xml: string): Promise<ResultadoValidacao> {
  const codigo = codigoDoEvento(xml);
  const erros = await validar(xml, xsd(PASTA_EVENTOS, `${EVENTOS[codigo].raiz}.xsd`), [
    xsd(PASTA_EVENTOS, "tipos.xsd"),
    xsd(PASTA_EVENTOS, "xmldsig-core-schema.xsd"),
  ]);
  const assinado = xml.includes("<Signature");
  const relevantes = assinado ? erros : erros.filter((e) => !ASSINATURA_AUSENTE.test(e.mensagem));
  return { valido: relevantes.length === 0, erros: relevantes };
}

/** Valida o envelope do lote (EnvioLoteEventos v1.1.1). O conteúdo de cada evento é validado à parte. */
export async function validarLote(xml: string): Promise<ResultadoValidacao> {
  const erros = await validar(xml, xsd(PASTA_COMUNICACAO, "EnvioLoteEventos-v1_1_1.xsd"), []);
  return { valido: erros.length === 0, erros };
}
