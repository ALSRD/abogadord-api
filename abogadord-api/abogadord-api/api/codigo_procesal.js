const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  const articulo = (req.query.articulo || req.query.a || "").toString().trim();
  if (!articulo) {
    return res.status(400).json({ error: "Falta el parámetro 'articulo' (?articulo=59)" });
  }
  try {
    const dbPath = path.join(process.cwd(), "data", "cpp.json");
    const raw = fs.readFileSync(dbPath, "utf-8");
    const data = JSON.parse(raw);
    const found = data[articulo];
    if (!found) {
      return res.status(404).json({ error: "Artículo no encontrado en la base local. Use el endpoint admin para agregarlo o actualizarlo.", articulo });
    }
    res.status(200).json(found);
  } catch (e) {
    res.status(500).json({ error: "Error leyendo la base de datos local", detalle: e.message });
  }
};