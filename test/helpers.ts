import { readFileSync } from "node:fs";
import { carregarCertificado } from "../src/certificado.ts";
import { montarEvento } from "../src/evento.ts";
import { gerarIdEvento, type Inscricao } from "../src/id.ts";

export const fixture = (nome: string) => readFileSync(new URL(`fixtures/${nome}`, import.meta.url));
export const certificado = () => carregarCertificado(fixture("certificado-teste.pfx"), "senha-teste");

export const EMPREGADOR: Inscricao = { tpInsc: 1, nrInsc: "12.ABC.345/01DE-35" };

export function s1000(sequencial = 1) {
  return montarEvento("S-1000", {
    "@Id": gerarIdEvento(EMPREGADOR, { dataHora: new Date("2026-10-30T15:00:00Z"), sequencial }),
    ideEvento: { tpAmb: 2, procEmi: 1, verProc: "esocial-ts 0.1.0" },
    ideEmpregador: { tpInsc: 1, nrInsc: "12ABC345" },
    infoEmpregador: {
      inclusao: {
        idePeriodo: { iniValid: "2026-11" },
        infoCadastro: { classTrib: "99", indCoop: 0, indConstr: 0, indDesFolha: 0, indOptRegEletron: 1 },
      },
    },
  });
}
