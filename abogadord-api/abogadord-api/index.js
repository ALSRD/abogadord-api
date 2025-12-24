const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");

const openapi = require("./api/openapi");
const cpp = require("./api/codigo_procesal");
const cp = require("./api/codigo_penal");
const doc = require("./api/documento");
const jur = require("./api/jurisprudencia");
const presentation = require("./api/presentation");

const publicDir = path.join(__dirname, "public");

const sendFile = (res, filePath, contentType = "text/html; charset=utf-8") => {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Archivo no encontrado");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.end(data);
  });
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/") {
    const filePath = path.join(publicDir, "index.html");
    return sendFile(res, filePath);
  }

  if (parsed.pathname.startsWith("/public/")) {
    const filePath = path.join(publicDir, parsed.pathname.replace("/public/", ""));
    const ext = path.extname(filePath);
    const contentType = ext === ".css" ? "text/css" : "application/javascript";
    return sendFile(res, filePath, contentType);
  }

  if (parsed.pathname === "/api/openapi") return openapi(req, res);
  if (parsed.pathname === "/api/codigo_procesal") { req.query = parsed.query; return cpp(req, res); }
  if (parsed.pathname === "/api/codigo_penal") { req.query = parsed.query; return cp(req, res); }
  if (parsed.pathname === "/api/jurisprudencia") { req.query = parsed.query; return jur(req, res); }
  if (parsed.pathname === "/api/documento") return doc(req, res);
  if (parsed.pathname === "/api/presentation") return presentation(req, res);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Abogado de RD — API Oficial");
});

server.listen(3000, () => console.log("Local: http://localhost:3000"));
