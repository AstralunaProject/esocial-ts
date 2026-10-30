import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assinarEvento, carregarCertificado, gerarIdEvento, montarEvento } from "../src/index.ts";

const destino = process.argv[2] ?? "amostras";
mkdirSync(destino, { recursive: true });

const certificado = carregarCertificado(readFileSync(new URL("../test/fixtures/certificado-teste.pfx", import.meta.url)), "senha-teste");
const empregador = { tpInsc: 1 as const, nrInsc: "12ABC34501DE35" };
const evento = montarEvento("S-1000", {
  "@Id": gerarIdEvento(empregador),
  ideEvento: { tpAmb: 2, procEmi: 1, verProc: "esocial-ts" },
  ideEmpregador: { tpInsc: 1, nrInsc: "12ABC345" },
  infoEmpregador: {
    inclusao: {
      idePeriodo: { iniValid: "2026-11" },
      infoCadastro: { classTrib: "99", indCoop: 0, indConstr: 0, indDesFolha: 0, indOptRegEletron: 1 },
    },
  },
});
const assinado = assinarEvento(evento, certificado);
writeFileSync(join(destino, "s1000.xml"), assinado);
writeFileSync(join(destino, "s1000-adulterado.xml"), assinado.replace("<classTrib>99<", "<classTrib>01<"));
console.log(`amostras gravadas em ${destino}/`);
