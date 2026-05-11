import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = process.argv[2] || path.join(__dirname, "../evals/generation-golden.json");
const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));

function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function evaluateCase(testCase) {
  const answer = normalize(testCase.answer || "");
  const citationHits = (testCase.expectedCitationFiles || []).filter((file) => answer.includes(normalize(file))).length;
  const requiredHits = (testCase.mustContain || []).filter((phrase) => answer.includes(normalize(phrase))).length;
  const expectedCitationFiles = testCase.expectedCitationFiles || [];
  const citationAccuracy = expectedCitationFiles.length ? citationHits / expectedCitationFiles.length : 1;
  const requiredCount = Math.max((testCase.mustContain || []).length, 1);
  const groundedness = requiredHits / requiredCount;

  return {
    id: testCase.id,
    citationAccuracy,
    groundedness,
    passed: citationAccuracy >= 1 && groundedness >= 1
  };
}

const results = dataset.map(evaluateCase);
const average = (key) => results.reduce((sum, result) => sum + result[key], 0) / results.length;

console.log(JSON.stringify({
  cases: results,
  metrics: {
    citationAccuracy: Number(average("citationAccuracy").toFixed(4)),
    groundedness: Number(average("groundedness").toFixed(4)),
    passRate: Number((results.filter((result) => result.passed).length / results.length).toFixed(4))
  }
}, null, 2));
