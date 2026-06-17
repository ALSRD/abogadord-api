const { StringDecoder } = require("string_decoder");

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf-8");
    let buffer = "";

    req.on("data", (chunk) => {
      buffer += decoder.write(chunk);
    });

    req.on("end", () => {
      buffer += decoder.end();
      try {
        const data = JSON.parse(buffer || "{}");
        resolve(data);
      } catch (error) {
        reject(new Error("El cuerpo de la petición no es JSON válido"));
      }
    });

    req.on("error", () => reject(new Error("No se pudo leer el cuerpo de la petición")));
  });

const buildSteps = (outline) => [
  {
    id: 1,
    title: "Comprender el transcript",
    description:
      "Se analizó el transcript junto al prompt de sistema y el prompt de usuario para extraer la intención principal.",
    status: "complete",
  },
  {
    id: 2,
    title: "Crear outline detallado",
    description:
      "Se generó un outline con el contenido y los datos a mostrar en cada diapositiva a partir del transcript y los prompts.",
    status: "complete",
  },
  {
    id: 3,
    title: "Preparar campos por diapositiva",
    description: "Se estructuraron los campos en base de datos virtual para cada diapositiva.",
    status: "complete",
  },
  {
    id: 4,
    title: "Crear imágenes con Nano Banana Pro",
    description:
      "Se generaron descripciones visuales para cada diapositiva; puedes usarlas como prompt para tu modelo de imágenes.",
    status: "pending",
  },
  {
    id: 5,
    title: "Unificar en PDF",
    description:
      "Las imágenes y descripciones están listas para unificar en un PDF descargable.",
    status: "pending",
  },
].map((step) => ({ ...step, slides: outline.slides.length }));

const sentenceChunks = (text, max = 6) => {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, max);
};

const buildSlides = (transcript, stylePrompt) => {
  const baseSentences = sentenceChunks(transcript);

  if (!baseSentences.length) {
    return [
      {
        slideNumber: 1,
        title: "Resumen de la reunión",
        content:
          "No se encontraron frases en el transcript. Añade texto para generar contenido detallado.",
        visualDescription: "Portada minimalista en el estilo solicitado.",
        styleHint: stylePrompt || "Estilo limpio y profesional",
      },
    ];
  }

  return baseSentences.map((sentence, index) => ({
    slideNumber: index + 1,
    title: `Diapositiva ${index + 1}`,
    content: sentence,
    visualDescription: `Ilustración que refuerza: "${sentence}". Estilo: ${
      stylePrompt || "corporativo"
    }`,
    styleHint: stylePrompt || "Estilo limpio y profesional",
  }));
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Solo se admite POST" }));
    return;
  }

  try {
    const { systemPrompt, userPrompt, stylePrompt, transcript } = await parseBody(req);

    if (!systemPrompt || !userPrompt || !transcript) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: "Debes enviar systemPrompt, userPrompt y transcript para generar la presentación.",
        })
      );
      return;
    }

    const slides = buildSlides(transcript, stylePrompt);
    const outline = {
      title: userPrompt.slice(0, 120) || "Presentación generada",
      systemPrompt,
      userPrompt,
      stylePrompt: stylePrompt || "", 
      slides,
    };

    const steps = buildSteps(outline);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        summary: "Prototipo listo para convertir transcript en presentación",
        outline,
        steps,
        pdf: {
          fileName: "presentacion-generada.pdf",
          status: "pending",
          note: "Integra tu generador de PDF y modelo de imágenes para completar el proceso.",
        },
      })
    );
  } catch (error) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message }));
  }
};
