import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assinarEvento, verificarAssinatura } from "../src/assinatura.ts";
import { ErroEsocial } from "../src/erros.ts";
import { montarLote } from "../src/lote.ts";
import { validarLote } from "../src/validacao.ts";
import { certificado, EMPREGADOR, s1000 } from "./helpers.ts";

const cert = certificado();
const assinado = (seq = 1) => assinarEvento(s1000(seq), cert);
const base = { grupo: 1 as const, empregador: EMPREGADOR, transmissor: { tpInsc: 1 as const, nrInsc: "12ABC34501DE35" } };

describe("montarLote", () => {
  it("gera lote válido no XSD com os eventos intactos", async () => {
    const eventos = [assinado(1), assinado(2)];
    const lote = montarLote({ ...base, eventos });
    assert.deepEqual(await validarLote(lote), { valido: true, erros: [] });
    assert.match(lote, /<envioLoteEventos grupo="1"><ideEmpregador><tpInsc>1<\/tpInsc><nrInsc>12ABC345<\/nrInsc><\/ideEmpregador>/);
    assert.match(lote, /<ideTransmissor><tpInsc>1<\/tpInsc><nrInsc>12ABC34501DE35<\/nrInsc><\/ideTransmissor>/);
    for (const evento of eventos) assert.ok(lote.includes(evento));
    const dentro = /<evento Id="ID[^"]+">([\s\S]*?)<\/evento>/.exec(lote)![1]!;
    assert.equal(verificarAssinatura(dentro), true);
  });

  it("remove a declaração XML de cada evento", () => {
    const lote = montarLote({ ...base, eventos: [`<?xml version="1.0" encoding="UTF-8"?>${assinado()}`] });
    assert.ok(!lote.includes("<?xml"));
  });

  it("aplica as regras do MOD", () => {
    assert.throws(() => montarLote({ ...base, eventos: [] }), ErroEsocial);
    assert.throws(() => montarLote({ ...base, eventos: Array.from({ length: 51 }, (_, i) => assinado(i + 1)) }), /no máximo 50/);
    assert.throws(() => montarLote({ ...base, eventos: [s1000()] }), /não está assinado/);
    assert.throws(() => montarLote({ ...base, grupo: 3, eventos: [assinado()] }), /grupo 1/);
    assert.throws(() => montarLote({ ...base, eventos: [assinado(1), assinado(1)] }), /Id repetido/);
    assert.throws(() => montarLote({ ...base, empregador: { tpInsc: 1, nrInsc: "11222333000181" }, eventos: [assinado()] }), /difere do empregador/);
  });
});
