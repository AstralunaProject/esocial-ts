import assert from "node:assert/strict";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import type { TLSSocket } from "node:tls";
import { after, before, describe, it } from "node:test";
import { assinarEvento, verificarAssinatura } from "../src/assinatura.ts";
import { ClienteEsocial } from "../src/cliente.ts";
import { ErroEsocial } from "../src/erros.ts";
import { montarLote } from "../src/lote.ts";
import { certificado, EMPREGADOR, fixture, s1000 } from "./helpers.ts";

const RETORNO_ENVIO = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><EnviarLoteEventosResponse xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0"><EnviarLoteEventosResult><eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/retornoEnvio/v1_1_0"><retornoEnvioLoteEventos><ideEmpregador><tpInsc>1</tpInsc><nrInsc>12ABC345</nrInsc></ideEmpregador><ideTransmissor><tpInsc>1</tpInsc><nrInsc>12ABC34501DE35</nrInsc></ideTransmissor><status><cdResposta>201</cdResposta><descResposta>Lote Recebido com Sucesso.</descResposta></status><dadosRecepcaoLote><dhRecepcao>2026-10-30T12:00:01</dhRecepcao><versaoAplicativoRecepcao>1.0</versaoAplicativoRecepcao><protocoloEnvio>1.2.202610.0000000000000000001</protocoloEnvio></dadosRecepcaoLote></retornoEnvioLoteEventos></eSocial></EnviarLoteEventosResult></EnviarLoteEventosResponse></s:Body></s:Envelope>`;

const RETORNO_CONSULTA = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ConsultarLoteEventosResponse xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0"><ConsultarLoteEventosResult><eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/retornoProcessamento/v1_3_0"><retornoProcessamentoLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote processado com sucesso.</descResposta></status><retornoEventos><evento Id="ID112ABC3450000002026103012000000001"><retornoEvento><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="ID1"><processamento><cdResposta>202</cdResposta><descResposta>Sucesso com advertências.</descResposta><ocorrencias><ocorrencia><tipo>2</tipo><codigo>1234</codigo><descricao>Advertência de teste</descricao><localizacao>/eSocial/evtInfoEmpregador</localizacao></ocorrencia></ocorrencias></processamento><recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo></retornoEvento></eSocial></retornoEvento></evento></retornoEventos></retornoProcessamentoLoteEventos></eSocial></ConsultarLoteEventosResult></ConsultarLoteEventosResponse></s:Body></s:Envelope>`;

interface Recebido { acao: string; corpo: string; cliente: string }

describe("ClienteEsocial", () => {
  let servidor: Server;
  let base = "";
  const recebidos: Recebido[] = [];
  let respostaForcada: string | null = null;

  before(async () => {
    servidor = createServer({ pfx: fixture("servidor.pfx"), passphrase: "senha-teste", requestCert: true, rejectUnauthorized: false }, (req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        const corpo = Buffer.concat(partes).toString("utf8");
        const cliente = String((req.socket as TLSSocket).getPeerCertificate().subject?.CN ?? "");
        recebidos.push({ acao: String(req.headers.soapaction), corpo, cliente });
        res.writeHead(200, { "Content-Type": "text/xml" });
        res.end(respostaForcada ?? (req.url?.includes("consulta") ? RETORNO_CONSULTA : RETORNO_ENVIO));
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    base = `https://localhost:${(servidor.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((ok) => servidor.close(() => ok())));

  const cliente = () =>
    new ClienteEsocial({
      certificado: certificado(),
      ambiente: "producao-restrita",
      ca: fixture("servidor.pem").toString(),
      enderecos: { envio: `${base}/envio`, consulta: `${base}/consulta` },
    });

  it("envia o lote com TLS mútuo e SOAP 1.1 sem prefixos de namespace", async () => {
    const evento = assinarEvento(s1000(), certificado());
    const lote = montarLote({ grupo: 1, empregador: EMPREGADOR, transmissor: { tpInsc: 1, nrInsc: "12ABC34501DE35" }, eventos: [evento] });
    const retorno = await cliente().enviarLote(lote);

    assert.equal(retorno.cdResposta, 201);
    assert.equal(retorno.protocoloEnvio, "1.2.202610.0000000000000000001");
    const pedido = recebidos.at(-1)!;
    assert.equal(pedido.cliente, "EMPRESA TESTE LTDA:12ABC34501DE35");
    assert.equal(pedido.acao, '"http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0/ServicoEnviarLoteEventos/EnviarLoteEventos"');
    assert.ok(pedido.corpo.startsWith('<?xml version="1.0" encoding="UTF-8"?><Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Body><EnviarLoteEventos xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0"><loteEventos><eSocial'));
    assert.doesNotMatch(pedido.corpo, /xmlns:\w+=/);
    assert.ok(pedido.corpo.includes(evento));
    const extraido = /<evento Id="[^"]+">([\s\S]*?)<\/evento>/.exec(pedido.corpo)![1]!;
    assert.equal(verificarAssinatura(extraido), true);
  });

  it("consulta o processamento e lê recibos e ocorrências", async () => {
    const retorno = await cliente().consultarLote("1.2.202610.0000000000000000001");
    assert.equal(retorno.cdResposta, 201);
    assert.deepEqual(retorno.eventos, [
      {
        id: "ID112ABC3450000002026103012000000001",
        cdResposta: 202,
        descResposta: "Sucesso com advertências.",
        nrRecibo: "1.1.0000000000000000001",
        ocorrencias: [{ codigo: "1234", descricao: "Advertência de teste", tipo: "2", localizacao: "/eSocial/evtInfoEmpregador" }],
      },
    ]);
    const pedido = recebidos.at(-1)!;
    assert.match(pedido.corpo, /<consulta><eSocial xmlns="http:\/\/www\.esocial\.gov\.br\/schema\/lote\/eventos\/envio\/consulta\/retornoProcessamento\/v1_0_0"><consultaLoteEventos><protocoloEnvio>1\.2\.202610\.0000000000000000001<\/protocoloEnvio>/);
  });

  it("transforma SOAP Fault em ErroEsocial", async () => {
    respostaForcada = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring xml:lang="pt-BR">Certificado inválido</faultstring></s:Fault></s:Body></s:Envelope>`;
    try {
      await assert.rejects(cliente().consultarLote("1"), (e: unknown) => e instanceof ErroEsocial && /Certificado inválido/.test(e.message));
    } finally {
      respostaForcada = null;
    }
  });

  it("recusa mensagem acima de 750 kB antes de enviar", async () => {
    await assert.rejects(cliente().enviarLote(`<eSocial>${"x".repeat(800 * 1024)}</eSocial>`), /750 kB/);
  });
});
