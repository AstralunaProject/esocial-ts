import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErroEsocial } from "../src/erros.ts";
import { criarGeradorDeId, gerarIdEvento, inscricaoDoEmpregador } from "../src/id.ts";

const quando = new Date("2014-02-02T15:42:47Z");

describe("gerarIdEvento", () => {
  it("segue o formato do exemplo do MOD §8.3", () => {
    assert.match("ID2333901700001892014020213424700001", /^ID\d[A-Z0-9]{12}\d{21}$/);
    assert.equal(gerarIdEvento({ tpInsc: 2, nrInsc: "333.901.700-00" }, { dataHora: quando }), "ID2333901700000002014020213424700001");
  });

  it("converte para o horário de Brasília, inclusive com horário de verão", () => {
    const inverno = gerarIdEvento({ tpInsc: 1, nrInsc: "11222333000181" }, { dataHora: new Date("2026-07-01T03:00:00Z") });
    assert.equal(inverno.slice(17, 31), "20260701000000");
    const verao2014 = gerarIdEvento({ tpInsc: 1, nrInsc: "11222333000181" }, { dataHora: quando });
    assert.equal(verao2014.slice(17, 31), "20140202134247");
  });

  it("usa o CNPJ base com zeros à direita e o horário de Brasília", () => {
    assert.equal(gerarIdEvento({ tpInsc: 1, nrInsc: "11.222.333/0001-81" }, { dataHora: quando }), "ID1112223330000002014020213424700001");
  });

  it("aceita CNPJ alfanumérico, normalizando para maiúsculas", () => {
    assert.equal(gerarIdEvento({ tpInsc: 1, nrInsc: "12.abc.345/01de-35" }, { dataHora: quando, sequencial: 42 }), "ID112ABC3450000002014020213424700042");
  });

  it("usa o CNPJ completo para as naturezas jurídicas do MOD", () => {
    const id = gerarIdEvento({ tpInsc: 1, nrInsc: "12ABC34501DE35" }, { dataHora: quando, naturezaJuridica: "101-5" });
    assert.equal(id, "ID112ABC34501DE352014020213424700001");
  });

  it("rejeita documento e sequencial inválidos", () => {
    assert.throws(() => gerarIdEvento({ tpInsc: 1, nrInsc: "123" }), ErroEsocial);
    assert.throws(() => gerarIdEvento({ tpInsc: 2, nrInsc: "1234567890A" }), ErroEsocial);
    assert.throws(() => gerarIdEvento({ tpInsc: 1, nrInsc: "11222333000181" }, { sequencial: 100000 }), ErroEsocial);
    assert.throws(() => gerarIdEvento({ tpInsc: 1, nrInsc: "11222333000181" }, { sequencial: 0 }), ErroEsocial);
  });

  it("todo Id gerado tem 36 posições e segue o padrão do XSD", () => {
    for (const nrInsc of ["11222333000181", "12ABC34501DE35", "12ABC345"]) {
      assert.match(gerarIdEvento({ tpInsc: 1, nrInsc }), /^ID\d[A-Z0-9]{12}\d{21}$/);
    }
  });
});

describe("criarGeradorDeId", () => {
  it("incrementa o sequencial no mesmo segundo e reinicia no seguinte", () => {
    const gerar = criarGeradorDeId({ tpInsc: 1, nrInsc: "11222333000181" });
    const a = gerar(quando);
    const b = gerar(new Date(quando.getTime() + 300));
    const c = gerar(new Date(quando.getTime() + 1000));
    assert.equal(a.slice(-5), "00001");
    assert.equal(b.slice(-5), "00002");
    assert.equal(c.slice(-5), "00001");
    assert.notEqual(a, b);
  });
});

describe("inscricaoDoEmpregador", () => {
  it("devolve o número como vai no ideEmpregador", () => {
    assert.deepEqual(inscricaoDoEmpregador({ tpInsc: 1, nrInsc: "12.ABC.345/01DE-35" }), { tpInsc: 1, nrInsc: "12ABC345" });
    assert.deepEqual(inscricaoDoEmpregador({ tpInsc: 2, nrInsc: "123.456.789-09" }), { tpInsc: 2, nrInsc: "12345678909" });
    assert.deepEqual(inscricaoDoEmpregador({ tpInsc: 1, nrInsc: "12ABC34501DE35" }, "1015"), { tpInsc: 1, nrInsc: "12ABC34501DE35" });
  });
});
