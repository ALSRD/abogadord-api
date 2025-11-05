const fs = require("fs");
const path = require("path");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

module.exports = async (req, res) => {
  const apiKey = process.env.ADMIN_API_KEY || "";
  const provided = req.headers["x-api-key"] || "";
  if (!apiKey || provided !== apiKey) {
    return res.status(401).json({ error: "No autorizado. Configure ADMIN_API_KEY en Vercel y envíe x-api-key en el header." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Use POST." });
  }
  try {
    const body = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => (data += chunk));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    const payload = JSON.parse(body || "{}");
    const { codigo = "cpp", articulo, titulo, texto, fuente } = payload;
    if (!articulo || !texto) {
      return res.status(400).json({ error: "Se requieren 'articulo' (número) y 'texto'." });
    }
    const file = codigo === "penal" ? "penal.json" : "cpp.json";
    const dbPath = path.join(process.cwd(), "data", file);
    ensureDir(path.dirname(dbPath));
    let data = {};
    if (fs.existsSync(dbPath)) {
      data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    }
    data[articulo.toString()] = {
      articulo: Number(articulo),
      titulo: titulo || (codigo === "penal" ? "Artículo del Código Penal" : "Artículo del CPP"),
      texto,
      fuente: fuente || (codigo === "penal" ? "Código Penal Dominicano" : "Código Procesal Penal Dominicano (Ley 76-02)")
    };
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
    res.status(200).json({ ok: true, actualizado: data[articulo.toString()] });
  } catch (e) {
    res.status(500).json({ error: "Error actualizando artículo", detalle: e.message });
  }
};