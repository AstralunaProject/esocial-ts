import { ErroEsocial } from "./erros.ts";

/**
 * Conteúdo de um elemento XML como objeto JavaScript.
 * - chaves são nomes de elementos, na ordem exigida pelo XSD;
 * - chaves iniciadas por "@" são atributos;
 * - arrays geram o elemento repetido;
 * - null, undefined, "" e grupos que ficam vazios são omitidos, como exige o MOD.
 */
export type ValorXml = string | number | bigint | null | undefined | ValorXml[] | ObjetoXml;
export interface ObjetoXml {
  [chave: string]: ValorXml;
}

const NOME = /^[A-Za-z_][\w.-]*$/;

function escaparTexto(valor: string) {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escaparAtributo(valor: string) {
  return escaparTexto(valor).replace(/"/g, "&quot;");
}

function textoDe(valor: string | number | bigint, caminho: string) {
  if (typeof valor === "number" && !Number.isFinite(valor)) {
    throw new ErroEsocial(`${caminho}: número inválido (${valor})`);
  }
  return String(valor).trim();
}

function elemento(nome: string, valor: ValorXml, caminho: string): string {
  if (!NOME.test(nome)) throw new ErroEsocial(`${caminho}: nome de elemento inválido`);
  if (valor === null || valor === undefined) return "";
  if (Array.isArray(valor)) return valor.map((v, i) => elemento(nome, v, `${caminho}[${i}]`)).join("");
  if (typeof valor === "object") {
    let atributos = "";
    let filhos = "";
    for (const [chave, filho] of Object.entries(valor)) {
      if (chave.startsWith("@")) {
        if (filho === null || filho === undefined || filho === "") continue;
        if (typeof filho === "object") throw new ErroEsocial(`${caminho}/${chave}: atributo precisa ser texto ou número`);
        atributos += ` ${chave.slice(1)}="${escaparAtributo(textoDe(filho, `${caminho}/${chave}`))}"`;
      } else {
        filhos += elemento(chave, filho, `${caminho}/${chave}`);
      }
    }
    return filhos === "" ? "" : `<${nome}${atributos}>${filhos}</${nome}>`;
  }
  if (typeof valor === "boolean") throw new ErroEsocial(`${caminho}: use "S"/"N" em vez de booleano`);
  const texto = textoDe(valor, caminho);
  return texto === "" ? "" : `<${nome}>${escaparTexto(texto)}</${nome}>`;
}

/** Serializa um objeto em XML compacto, sem declaração, comentários ou espaços entre tags. */
export function paraXml(nome: string, valor: ObjetoXml, namespace?: string) {
  const raiz = namespace ? { "@xmlns": namespace, ...valor } : valor;
  return elemento(nome, raiz, nome);
}
