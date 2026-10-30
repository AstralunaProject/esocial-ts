import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assinarEvento, verificarAssinatura } from "../src/assinatura.ts";
import { carregarCertificado } from "../src/certificado.ts";
import { ErroEsocial } from "../src/erros.ts";
import { validarEvento } from "../src/validacao.ts";
import { certificado, fixture, s1000 } from "./helpers.ts";

describe("carregarCertificado", () => {
  it("lê PKCS#12 moderno (AES) e legado (3DES/RC2)", () => {
    for (const arquivo of ["certificado-teste.pfx", "certificado-legado.pfx"]) {
      const c = carregarCertificado(fixture(arquivo), "senha-teste");
      assert.equal(c.titular, "EMPRESA TESTE LTDA:12ABC34501DE35");
      assert.equal(c.documento, "12ABC34501DE35");
      assert.match(c.chavePrivadaPem, /BEGIN RSA PRIVATE KEY/);
    }
  });

  it("extrai o CPF de um e-CPF", () => {
    assert.equal(carregarCertificado(fixture("certificado-cpf.pfx"), "senha-teste").documento, "12345678909");
  });

  it("explica senha incorreta", () => {
    assert.throws(() => carregarCertificado(fixture("certificado-teste.pfx"), "errada"), /senha incorreta/);
  });
});

describe("assinarEvento", () => {
  const assinado = assinarEvento(s1000(), certificado());

  it("segue o padrão do MOD §6.7", () => {
    assert.match(assinado, /<\/evtInfoEmpregador><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/);
    assert.ok(assinado.endsWith("</Signature></eSocial>"));
    for (const trecho of [
      '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
      '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
      '<Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms>',
      '<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    ]) {
      assert.ok(assinado.includes(trecho), trecho);
    }
    assert.match(assinado, /<KeyInfo><X509Data><X509Certificate>[A-Za-z0-9+/=]+<\/X509Certificate><\/X509Data><\/KeyInfo>/);
    assert.ok(!assinado.includes("<?xml"));
  });

  it("não altera o conteúdo do evento", () => {
    assert.ok(assinado.startsWith(s1000().replace(/<\/eSocial>$/, "")));
  });

  it("passa no XSD com a assinatura", async () => {
    assert.deepEqual(await validarEvento(assinado), { valido: true, erros: [] });
  });

  it("verifica a assinatura e detecta adulteração", () => {
    assert.equal(verificarAssinatura(assinado), true);
    assert.equal(verificarAssinatura(assinado.replace("<classTrib>99<", "<classTrib>01<")), false);
    assert.equal(verificarAssinatura(s1000()), false);
  });

  it("aceita evento com declaração XML e recusa reassinar ou usar certificado vencido", () => {
    assert.ok(verificarAssinatura(assinarEvento(`<?xml version="1.0" encoding="UTF-8"?>${s1000()}`, certificado())));
    assert.throws(() => assinarEvento(assinado, certificado()), ErroEsocial);
    assert.throws(() => assinarEvento(s1000(), certificado(), { agora: new Date("2040-01-01") }), /vencido/);
  });
});
