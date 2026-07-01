const SEDES = {
  "oxigeno": "Oxígeno",
  "c3-cariari": "C3 Cariari",
  "estadio": "Estadio",
  "la-ribera": "La Ribera",
  "city-mall-costa-rica": "City Mall",
  "paseo-de-las-flores": "Paseo de las Flores",
  "plaza-heredia": "Plaza Heredia",
  "multiplaza-escazu": "Multiplaza Escazú",
  "terrazas-lindora": "Terrazas Lindora",
  "santa-ana-trade-center": "Santa Ana Trade Center",
  "escazu": "Escazú Centro",
  "lincoln": "Lincoln Plaza",
  "rohrmoser": "Rohrmoser"
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  let resultado = {
    ultima_actualizacion: new Date().toISOString(),
    sedes: {}
  };

  try {
    await Promise.all(Object.keys(SEDES).map(async (slug) => {
      try {
        const url = `https://www.smartfit.cr/gimnasios/${slug}`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 10000
        });

        if (!response.ok) {
          resultado.sedes[slug] = { nombre: SEDES[slug], error: `HTTP ${response.status}`, horarios: {} };
          return;
        }

        const html = await response.text();

        const scripts = html.split(/<\/script>/i);
        let scriptObjetivo = null;

        for (const script of scripts) {
          if (script.includes("titleLabel") && script.includes("mainButtonLabel")) {
            scriptObjetivo = script;
            break;
          }
        }

        if (scriptObjetivo) {
          const match = scriptObjetivo.match(/JSON\.parse\('(.*?)'\)/);

          if (match && match[1]) {
            let jsonStr = match[1];

            // Limpieza de caracteres de escape
            jsonStr = jsonStr
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\')
              .replace(/\\'/g, "'");

            try {
              let dataDict = JSON.parse(jsonStr);

              if (typeof dataDict === 'string') {
                dataDict = JSON.parse(dataDict);
              }

              if (dataDict && dataDict.data) {
                resultado.sedes[slug] = {
                  nombre: SEDES[slug],
                  horarios: dataDict.data
                };
              } else {
                resultado.sedes[slug] = { nombre: SEDES[slug], error: "Estructura interna sin .data", horarios: {} };
              }
            } catch (parseError) {
              resultado.sedes[slug] = { nombre: SEDES[slug], error: `Error de parseo JSON: ${parseError.message}`, horarios: {} };
            }
          } else {
            resultado.sedes[slug] = { nombre: SEDES[slug], error: "No se pudo extraer el contenido de JSON.parse", horarios: {} };
          }
        } else {
          resultado.sedes[slug] = { nombre: SEDES[slug], error: "No se encontró el bloque <script> del gimnasio", horarios: {} };
        }

      } catch (e) {
        resultado.sedes[slug] = { nombre: SEDES[slug], error: `Excepcion de red: ${e.message}`, horarios: {} };
      }
    }));

    return res.status(200).json(resultado);

  } catch (globalError) {
    return res.status(500).json({ error: `Falla global: ${globalError.message}` });
  }
}