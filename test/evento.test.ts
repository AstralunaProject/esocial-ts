import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErroEsocial } from "../src/erros.ts";
import { codigoDoEvento, idDoEvento, montarEvento } from "../src/evento.ts";
import { EVENTOS } from "../src/eventos.ts";
import { validarEvento, validarLote } from "../src/validacao.ts";
import { s1000 } from "./helpers.ts";

describe("catálogo de eventos", () => {
  it("cobre os 50 eventos do leiaute S-1.3", () => {
    assert.equal(Object.keys(EVENTOS).length, 50);
    assert.equal(EVENTOS["S-2200"].raiz, "evtAdmissao");
    assert.equal(EVENTOS["S-2299"].raiz, "evtDeslig");
  });
});

describe("montarEvento", () => {
  it("usa o namespace do leiaute e o Id no elemento do evento", () => {
    const xml = s1000();
    assert.ok(xml.startsWith('<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00"><evtInfoEmpregador Id="ID112ABC345'));
    assert.ok(!xml.includes("<?xml"));
    assert.equal(codigoDoEvento(xml), "S-1000");
    assert.equal(idDoEvento(xml), "ID112ABC3450000002026103012000000001");
  });

  it("exige Id válido", () => {
    assert.throws(() => montarEvento("S-1000", { ideEvento: { tpAmb: 2 } }), ErroEsocial);
    assert.throws(() => montarEvento("S-1000", { "@Id": "ID1" }), ErroEsocial);
  });
});

describe("validarEvento", () => {
  it("aprova um S-1000 válido com CNPJ alfanumérico, antes da assinatura", async () => {
    assert.deepEqual(await validarEvento(s1000()), { valido: true, erros: [] });
  });

  it("aponta campo faltando com mensagem legível", async () => {
    const xml = s1000().replace("<classTrib>99</classTrib>", "");
    const { valido, erros } = await validarEvento(xml);
    assert.equal(valido, false);
    assert.match(erros[0]!.mensagem, /Element 'indCoop': This element is not expected\. Expected is \( classTrib \)/);
  });

  it("aponta valor fora do domínio", async () => {
    const { valido } = await validarEvento(s1000().replace("<tpAmb>2</tpAmb>", "<tpAmb>3</tpAmb>"));
    assert.equal(valido, false);
  });

  it("rejeita CNPJ com letras minúsculas, como o eSocial", async () => {
    const { valido } = await validarEvento(s1000().replace("<nrInsc>12ABC345</nrInsc>", "<nrInsc>12abc345</nrInsc>"));
    assert.equal(valido, false);
  });

  it("valida o envelope do lote", async () => {
    const { valido, erros } = await validarLote('<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1"><envioLoteEventos grupo="1"></envioLoteEventos></eSocial>');
    assert.equal(valido, false);
    assert.ok(erros.length > 0);
  });
});
