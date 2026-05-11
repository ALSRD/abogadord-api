import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = process.argv[2] || path.join(__dirname, "../evals/rag-golden.json");
const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));

const legalReferencePattern = /\b(?:art(?:í|i)culo|art\.?|ley|sentencia|resoluci(?:ó|o)n|decreto|contrato|cl(?:á|a)usula)\s+[\w.-]+/gi;

function tokenize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/i)
    .filter((term) => term.length > 2);
}

function keywordScore(query, content) {
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return 0;

  const contentTerms = new Set(tokenize(content));
  const matchedTerms = queryTerms.filter((term) => contentTerms.has(term)).length;
  const legalRefs = query.match(legalReferencePattern) || [];
  const legalRefBoost = legalRefs.filter((reference) => content.toLowerCase().includes(reference.toLowerCase())).length * 0.18;

  return Math.min(matchedTerms / queryTerms.length + legalRefBoost, 1);
}

function evaluateCase(testCase) {
  const ranked = testCase.chunks
    .map((chunk) => ({ ...chunk, score: keywordScore(testCase.query, chunk.content) }))
    .sort((a, b) => b.score - a.score);
  const topIds = ranked.slice(0, 3).map((chunk) => chunk.id);
  const relevant = new Set(testCase.relevantChunkIds);
  const hits = topIds.filter((id) => relevant.has(id)).length;
  const reciprocalRank = ranked.findIndex((chunk) => relevant.has(chunk.id)) + 1;

  return {
    id: testCase.id,
    precisionAt3: hits / Math.min(3, ranked.length),
    recallAt3: hits / relevant.size,
    reciprocalRank: reciprocalRank ? 1 / reciprocalRank : 0,
    topIds
  };
}

const results = dataset.map(evaluateCase);
const average = (key) => results.reduce((sum, result) => sum + result[key], 0) / results.length;

console.log(JSON.stringify({
  cases: results,
  metrics: {
    mrr: Number(average("reciprocalRank").toFixed(4)),
    precisionAt3: Number(average("precisionAt3").toFixed(4)),
    recallAt3: Number(average("recallAt3").toFixed(4))
  }
}, null, 2));
