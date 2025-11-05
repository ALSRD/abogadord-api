module.exports = async (req, res) => {
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
    const { tipo = "", detalles = "" } = JSON.parse(body || "{}");

    if (!tipo) {
      return res.status(400).json({ error: "Falta el campo 'tipo' en el cuerpo JSON." });
    }

    const titulo = tipo.toUpperCase();
    const texto = `
Honorable Juez(a) de la ${tipo.includes("apelación") ? "Corte de Apelación" : "Instrucción"}:

Quien suscribe, abogado/a defensor/a, comparece y EXPONE:

PRIMERO: Que ${detalles || "se detallan los hechos y circunstancias del caso conforme al CPP."}.

SEGUNDO: Que conforme al Código Procesal Penal (Ley 76-02 y sus reformas), se solicita ${tipo} por resultar idónea, proporcional y suficiente para asegurar la presencia del imputado, la investigación y el proceso.

TERCERO: Fundamento jurídico en los artículos 226 y siguientes del CPP (medidas de coerción), y jurisprudencia aplicable.

Por lo anteriormente expuesto, SOLICITO: Se ACOJA la ${tipo} solicitada.

En Santo Domingo, República Dominicana.
Firma:
`;

    res.status(200).json({ titulo, texto: texto.trim() });
  } catch (e) {
    res.status(500).json({ error: "Error generando documento", detalle: e.message });
  }
};