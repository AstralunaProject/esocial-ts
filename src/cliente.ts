import { request } from "node:https";
import { DOMParser, type Element } from "@xmldom/xmldom";
import type { Certificado } from "./certificado.ts";
import { ErroEsocial } from "./erros.ts";

export type Ambiente = "producao" | "producao-restrita";

const ENDERECOS: Record<Ambiente, { envio: string; consulta: string }> = {
  producao: {
    envio: "https://webservices.envio.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
    consulta: "https://webservices.consulta.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
  },
  "producao-restrita": {
    envio: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
    consulta: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
  },
};

const SOAP = "http://schemas.xmlsoap.org/soap/envelope/";
const WS_ENVIO = "http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0";
const WS_CONSULTA = "http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0";
const NS_CONSULTA = "http://www.esocial.gov.br/schema/lote/eventos/envio/consulta/retornoProcessamento/v1_0_0";
const LIMITE_MENSAGEM = 750 * 1024;

export interface Ocorrencia {
  codigo: string;
  descricao: string;
  tipo: string;
  localizacao: string;
}

export interface RetornoEnvio {
  cdResposta: number;
  descResposta: string;
  protocoloEnvio: string | null;
  ocorrencias: Ocorrencia[];
  xml: string;
}

export interface RetornoEvento {
  id: string;
  cdResposta: number;
  descResposta: string;
  nrRecibo: string | null;
  ocorrencias: Ocorrencia[];
}

export interface RetornoConsulta {
  /** 101 = em processamento, 201 = sucesso, 202 = sucesso com advertências, 3xx/4xx = erro. */
  cdResposta: number;
  descResposta: string;
  /** Segundos sugeridos pelo eSocial antes de consultar de novo. */
  tempoEstimadoConclusao: number | null;
  eventos: RetornoEvento[];
  xml: string;
}

export interface OpcoesCliente {
  certificado: Certificado;
  ambiente: Ambiente;
  /** Cadeia ICP-Brasil (PEM) para validar o servidor, quando o sistema não a tiver instalada. */
  ca?: string | string[];
  timeoutMs?: number;
  /** Substitui os endereços oficiais, útil em testes. */
  enderecos?: { envio: string; consulta: string };
}

function filhos(pai: Element, nome: string) {
  const lista = pai.getElementsByTagNameNS("*", nome);
  return Array.from({ length: lista.length }, (_, i) => lista.item(i) as Element);
}

function texto(pai: Element, nome: string) {
  return filhos(pai, nome)[0]?.textContent?.trim() ?? null;
}

function ocorrenciasDe(pai: Element | undefined): Ocorrencia[] {
  if (!pai) return [];
  return filhos(pai, "ocorrencia").map((o) => ({
    codigo: texto(o, "codigo") ?? "",
    descricao: texto(o, "descricao") ?? "",
    tipo: texto(o, "tipo") ?? "",
    localizacao: texto(o, "localizacao") ?? "",
  }));
}

/** Envelope SOAP 1.1 só com namespaces padrão: nenhum prefixo vaza para a canonicalização dos eventos. */
function envelope(operacao: string, namespace: string, parametro: string, conteudo: string) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Envelope xmlns="${SOAP}"><Body><${operacao} xmlns="${namespace}"><${parametro}>${conteudo}</${parametro}></${operacao}></Body></Envelope>`
  );
}

export class ClienteEsocial {
  readonly #opcoes: OpcoesCliente;
  readonly #enderecos: { envio: string; consulta: string };

  constructor(opcoes: OpcoesCliente) {
    this.#opcoes = opcoes;
    this.#enderecos = opcoes.enderecos ?? ENDERECOS[opcoes.ambiente];
  }

  #postar(url: string, acao: string, corpo: string): Promise<string> {
    const bytes = Buffer.from(corpo, "utf8");
    if (bytes.length > LIMITE_MENSAGEM) {
      return Promise.reject(new ErroEsocial(`mensagem de ${Math.ceil(bytes.length / 1024)} kB excede o limite de 750 kB do eSocial`));
    }
    const { certificado, ca, timeoutMs = 60_000 } = this.#opcoes;
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: "POST",
          pfx: certificado.pfx,
          passphrase: certificado.senha,
          minVersion: "TLSv1.2",
          ...(ca ? { ca } : {}),
          timeout: timeoutMs,
          headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${acao}"`, "Content-Length": bytes.length },
        },
        (res) => {
          const partes: Buffer[] = [];
          res.on("data", (p: Buffer) => partes.push(p));
          res.on("end", () => {
            const resposta = Buffer.concat(partes).toString("utf8");
            const falha = /<(?:\w+:)?faultstring[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/.exec(resposta)?.[1];
            if (falha) return reject(new ErroEsocial(`falha SOAP: ${falha.trim()}`));
            if ((res.statusCode ?? 0) >= 400) return reject(new ErroEsocial(`HTTP ${res.statusCode} do eSocial`));
            resolve(resposta);
          });
        },
      );
      req.on("timeout", () => req.destroy(new ErroEsocial(`sem resposta do eSocial em ${timeoutMs} ms`)));
      req.on("error", reject);
      req.end(bytes);
    });
  }

  #ler(resposta: string, raiz: string) {
    const doc = new DOMParser().parseFromString(resposta, "text/xml");
    const lista = doc.getElementsByTagNameNS("*", raiz);
    const elemento = lista.item(0) as Element | null;
    if (!elemento) throw new ErroEsocial(`resposta do eSocial sem <${raiz}>`);
    return elemento;
  }

  /** Envia um lote montado com montarLote(). Guarde o protocolo para consultar o processamento. */
  async enviarLote(lote: string): Promise<RetornoEnvio> {
    const resposta = await this.#postar(
      this.#enderecos.envio,
      `${WS_ENVIO}/ServicoEnviarLoteEventos/EnviarLoteEventos`,
      envelope("EnviarLoteEventos", WS_ENVIO, "loteEventos", lote.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, "")),
    );
    const retorno = this.#ler(resposta, "retornoEnvioLoteEventos");
    const status = filhos(retorno, "status")[0];
    return {
      cdResposta: Number(texto(retorno, "cdResposta")),
      descResposta: texto(retorno, "descResposta") ?? "",
      protocoloEnvio: texto(retorno, "protocoloEnvio"),
      ocorrencias: ocorrenciasDe(status),
      xml: resposta,
    };
  }

  /** Consulta o processamento de um lote. Respeite tempoEstimadoConclusao entre as consultas. */
  async consultarLote(protocoloEnvio: string): Promise<RetornoConsulta> {
    const consulta = `<eSocial xmlns="${NS_CONSULTA}"><consultaLoteEventos><protocoloEnvio>${protocoloEnvio}</protocoloEnvio></consultaLoteEventos></eSocial>`;
    const resposta = await this.#postar(
      this.#enderecos.consulta,
      `${WS_CONSULTA}/ServicoConsultarLoteEventos/ConsultarLoteEventos`,
      envelope("ConsultarLoteEventos", WS_CONSULTA, "consulta", consulta),
    );
    const retorno = this.#ler(resposta, "retornoProcessamentoLoteEventos");
    const status = filhos(retorno, "status")[0];
    const tempo = status ? texto(status, "tempoEstimadoConclusao") : null;
    return {
      cdResposta: Number(status ? texto(status, "cdResposta") : NaN),
      descResposta: (status ? texto(status, "descResposta") : null) ?? "",
      tempoEstimadoConclusao: tempo === null ? null : Number(tempo),
      eventos: filhos(retorno, "evento").map((ev) => {
        const proc = filhos(ev, "processamento")[0];
        return {
          id: ev.getAttribute("Id") ?? "",
          cdResposta: Number(proc ? texto(proc, "cdResposta") : NaN),
          descResposta: (proc ? texto(proc, "descResposta") : null) ?? "",
          nrRecibo: texto(ev, "nrRecibo"),
          ocorrencias: ocorrenciasDe(proc),
        };
      }),
      xml: resposta,
    };
  }
}
