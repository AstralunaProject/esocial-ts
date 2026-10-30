import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const PASTA = new URL("../schemas/eventos/v_S_01_03_00/", import.meta.url);
const DESTINO = new URL("../src/eventos.ts", import.meta.url);
const VERSAO = "v_S_01_03_00";

const eventos: { codigo: string; raiz: string; nome: string }[] = [];
for (const arquivo of readdirSync(PASTA).filter((a) => a.startsWith("evt")).sort()) {
  const xsd = readFileSync(new URL(arquivo, PASTA), "utf8");
  const doc = /<xs:documentation>(S-\d{4}) - ([^<]+)<\/xs:documentation>/.exec(xsd);
  if (!doc) throw new Error(`código do evento não encontrado em ${arquivo}`);
  eventos.push({ codigo: doc[1]!, raiz: arquivo.replace(/\.xsd$/, ""), nome: doc[2]!.trim() });
}
eventos.sort((a, b) => a.codigo.localeCompare(b.codigo));

const linhas = eventos.map((e) => `  "${e.codigo}": { raiz: "${e.raiz}", nome: ${JSON.stringify(e.nome)} },`);
const conteudo = `// Gerado por scripts/eventos.ts a partir de schemas/eventos/${VERSAO}. Não edite à mão.

export const VERSAO_LEIAUTE = "${VERSAO}";

export const EVENTOS = {
${linhas.join("\n")}
} as const;

export type CodigoEvento = keyof typeof EVENTOS;
`;

if (process.argv.includes("--check")) {
  if (readFileSync(DESTINO, "utf8") !== conteudo) {
    console.error("src/eventos.ts está desatualizado. Rode: npm run eventos");
    process.exitCode = 1;
  }
} else {
  writeFileSync(DESTINO, conteudo);
  console.log(`${eventos.length} eventos gravados em src/eventos.ts`);
}
