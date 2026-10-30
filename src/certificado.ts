import forge from "node-forge";
import { ErroEsocial } from "./erros.ts";

export interface Certificado {
  /** Conteúdo original do arquivo .pfx/.p12, usado também na conexão TLS. */
  pfx: Buffer;
  senha: string;
  chavePrivadaPem: string;
  certificadoPem: string;
  /** Certificado em base64 (DER), como vai em X509Certificate. */
  certificadoBase64: string;
  titular: string;
  /** CNPJ ou CPF extraído do nome do titular, no padrão ICP-Brasil "NOME:DOCUMENTO". */
  documento: string | null;
  validoDe: Date;
  validoAte: Date;
}

function bagsDe(p12: forge.pkcs12.Pkcs12Pfx, tipo: string) {
  return p12.getBags({ bagType: tipo })[tipo] ?? [];
}

/** Carrega um certificado A1 (.pfx ou .p12). */
export function carregarCertificado(pfx: Buffer, senha: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString("binary")), senha);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new ErroEsocial(`não foi possível abrir o certificado (senha incorreta ou arquivo inválido): ${motivo}`);
  }

  const chaves = [...bagsDe(p12, forge.pki.oids.pkcs8ShroudedKeyBag!), ...bagsDe(p12, forge.pki.oids.keyBag!)];
  const chave = chaves.find((b) => b.key)?.key;
  if (!chave) throw new ErroEsocial("o arquivo não contém chave privada");

  const certificados = bagsDe(p12, forge.pki.oids.certBag!).flatMap((b) => (b.cert ? [b.cert] : []));
  const publica = forge.pki.setRsaPublicKey((chave as forge.pki.rsa.PrivateKey).n, (chave as forge.pki.rsa.PrivateKey).e);
  const doTitular = certificados.find((c) => forge.pki.publicKeyToPem(c.publicKey) === forge.pki.publicKeyToPem(publica));
  if (!doTitular) throw new ErroEsocial("nenhum certificado do arquivo corresponde à chave privada");

  const titular = String(doTitular.subject.getField("CN")?.value ?? "");
  const documento = /:([A-Z0-9]{12}\d{2}|\d{11})$/.exec(titular)?.[1] ?? null;
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(doTitular)).getBytes();

  return {
    pfx,
    senha,
    chavePrivadaPem: forge.pki.privateKeyToPem(chave),
    certificadoPem: forge.pki.certificateToPem(doTitular),
    certificadoBase64: forge.util.encode64(der),
    titular,
    documento,
    validoDe: doTitular.validity.notBefore,
    validoAte: doTitular.validity.notAfter,
  };
}
