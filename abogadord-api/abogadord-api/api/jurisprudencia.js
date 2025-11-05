module.exports = (req, res) => {
  const tema = (req.query.tema || "general").toString();
  // Datos de ejemplo: se recomienda reemplazar con enlaces reales del PJ (pj.gob.do) o tu base.
  const resultados = [
    {
      titulo: `SCJ, Sala Penal — Sentencia sobre ${tema}`,
      resumen: "Criterios de valoración probatoria y suficiencia del testimonio de la víctima conforme a la sana crítica.",
      link: "https://pj.gob.do/jurisprudencia"
    },
    {
      titulo: `Corte de Apelación — ${tema}`,
      resumen: "Control de legalidad de medidas de coerción y requisitos de motivación del auto.",
      link: "https://pj.gob.do/"
    }
  ];
  res.status(200).json(resultados);
};