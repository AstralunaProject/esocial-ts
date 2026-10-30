import { SignedXml } from "xml-crypto";
import type { Certificado } from "./certificado.ts";
import { ErroEsocial } from "./erros.ts";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

function semDeclaracao(xml: string) {
  return xml.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, "");
}

/**
 * Assina o evento conforme o MOD §6.7: XMLDSig enveloped, C14N, RSA-SHA256,
 * Reference URI="" e KeyInfo apenas com X509Certificate.
 * A <Signature> é anexada como último filho de <eSocial>.
 */
export function assinarEvento(xml: string, certificado: Certificado, { agora = new Date() } = {}) {
  if (agora > certificado.validoAte) {
    throw new ErroEsocial(`certificado vencido em ${certificado.validoAte.toISOString().slice(0, 10)}`);
  }
  const documento = semDeclaracao(xml);
  if (documento.includes("<Signature")) throw new ErroEsocial("o evento já está assinado");

  const assinatura = new SignedXml({
    privateKey: certificado.chavePrivadaPem,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: RSA_SHA256,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certificado.certificadoBase64}</X509Certificate></X509Data>`,
  });
  assinatura.addReference({ xpath: "/*", transforms: [ENVELOPED, C14N], digestAlgorithm: SHA256, isEmptyUri: true });
  assinatura.computeSignature(documento, { location: { reference: "/*", action: "append" } });
  return assinatura.getSignedXml();
}

/** Confere a assinatura do evento com o certificado embutido em X509Certificate. */
export function verificarAssinatura(xml: string) {
  const documento = semDeclaracao(xml);
  const base64 = /<X509Certificate>([^<]+)<\/X509Certificate>/.exec(documento)?.[1];
  const assinaturaXml = /<Signature\b[\s\S]*<\/Signature>/.exec(documento)?.[0];
  if (!base64 || !assinaturaXml) return false;
  const pem = `-----BEGIN CERTIFICATE-----\n${base64.replace(/\s/g, "").replace(/.{64}/g, "$&\n")}\n-----END CERTIFICATE-----\n`;
  const verificador = new SignedXml({ publicCert: pem });
  verificador.loadSignature(assinaturaXml);
  try {
    return verificador.checkSignature(documento);
  } catch {
    return false;
  }
}
