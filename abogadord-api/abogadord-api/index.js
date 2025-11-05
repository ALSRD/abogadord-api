const http = require("http");
const url = require("url");

const openapi = require("./api/openapi");
const cpp = require("./api/codigo_procesal");
const cp = require("./api/codigo_penal");
const doc = require("./api/documento");
const jur = require("./api/jurisprudencia");

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === "/api/openapi") return openapi(req, res);
  if (parsed.pathname === "/api/codigo_procesal") { req.query = parsed.query; return cpp(req, res); }
  if (parsed.pathname === "/api/codigo_penal") { req.query = parsed.query; return cp(req, res); }
  if (parsed.pathname === "/api/jurisprudencia") { req.query = parsed.query; return jur(req, res); }
  if (parsed.pathname === "/api/documento") return doc(req, res);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Abogado de RD — API Oficial");
});

server.listen(3000, () => console.log("Local: http://localhost:3000"));