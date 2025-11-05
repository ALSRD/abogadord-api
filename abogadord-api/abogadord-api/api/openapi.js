const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  try {
    const specPath = path.join(process.cwd(), "openapi.json");
    const raw = fs.readFileSync(specPath, "utf-8");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(raw);
  } catch (e) {
    res.status(500).json({ error: "No se pudo cargar openapi.json", detalle: e.message });
  }
};