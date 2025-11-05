# Abogado de RD — API Oficial
Consultas jurídicas, artículos legales y redacción de documentos procesales en tiempo real.

Proyecto institucional de César Augusto Saviñón Guzmán (ALSRD SRL).

## Endpoints

- `GET /api/codigo_procesal?articulo=59` → Devuelve artículo del CPP (Ley 76-02, ref. 10-15 y 361-22).
- `GET /api/codigo_penal?articulo=302` → Devuelve artículo del Código Penal.
- `POST /api/documento` (JSON: { "tipo": "...", "detalles": "..." }) → Genera escrito procesal.
- `GET /api/jurisprudencia?tema=xxxx` → Resultados de jurisprudencia (enlaces de referencia).
- `POST /api/admin_upsert` (Headers: x-api-key: <clave>) → Agrega/actualiza artículos en /data/*.json

## Configuración en Vercel
1. Suba este repo a GitHub y haga Deploy en Vercel.
2. (Opcional) Configure la variable de entorno `ADMIN_API_KEY` para el endpoint admin.
3. La especificación para ChatGPT Actions estará en: `/api/openapi` o el archivo raíz `openapi.json`.

## Notas
- Los archivos en `data/` incluyen una base inicial. Agregue el resto de artículos con `/api/admin_upsert`.
- Este proyecto usa funciones serverless de Vercel (archivos en `/api`).

