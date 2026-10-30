import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErroEsocial } from "../src/erros.ts";
import { paraXml } from "../src/xml.ts";

describe("paraXml", () => {
  it("serializa na ordem das chaves, sem espaços entre tags", () => {
    assert.equal(paraXml("a", { b: 1, c: "x", d: { e: "y" } }), "<a><b>1</b><c>x</c><d><e>y</e></d></a>");
  });

  it("gera atributos, namespace e elementos repetidos", () => {
    assert.equal(paraXml("r", { "@Id": "ID1", item: ["a", "b"] }, "urn:x"), '<r xmlns="urn:x" Id="ID1"><item>a</item><item>b</item></r>');
  });

  it("omite valores vazios e grupos que ficam vazios (MOD §7.9.10)", () => {
    assert.equal(paraXml("a", { b: "", c: null, d: undefined, e: { f: "" }, g: "ok" }), "<a><g>ok</g></a>");
  });

  it("remove espaços nas pontas e escapa caracteres especiais", () => {
    assert.equal(paraXml("a", { b: "  Silva & Filhos <ME>  ", "@x": 'diz "oi"' }), '<a x="diz &quot;oi&quot;"><b>Silva &amp; Filhos &lt;ME&gt;</b></a>');
  });

  it("rejeita booleanos, números inválidos e nomes inválidos", () => {
    assert.throws(() => paraXml("a", { b: true as never }), ErroEsocial);
    assert.throws(() => paraXml("a", { b: Number.NaN }), ErroEsocial);
    assert.throws(() => paraXml("a", { "b c": "x" }), ErroEsocial);
  });
});
