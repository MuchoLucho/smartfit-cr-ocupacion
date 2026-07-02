const SEDES = {
  "oxigeno": { nombre: "Oxígeno", provincia: "Heredia" },
  "c3-cariari": { nombre: "C3 Cariari", provincia: "Heredia" },
  "la-ribera": { nombre: "La Ribera", provincia: "Heredia" },
  "paseo-de-las-flores": { nombre: "Paseo de las Flores", provincia: "Heredia" },
  "plaza-heredia": { nombre: "Plaza Heredia", provincia: "Heredia" },
  "estadio": { nombre: "Estadio", provincia: "Heredia" },

  "city-mall-costa-rica": { nombre: "City Mall", provincia: "Alajuela" },
  "la-trinidad": { nombre: "La Trinidad", provincia: "Alajuela" },
  "higuerones": { nombre: "Higuerones", provincia: "Alajuela" },

  "paseo-metropoli": { nombre: "Paseo Metrópoli", provincia: "Cartago" },

  "multiplaza-escazu": { nombre: "Multiplaza Escazú", provincia: "San José" },
  "escazu": { nombre: "Escazú Centro", provincia: "San José" },
  "terrazas-lindora": { nombre: "Terrazas Lindora", provincia: "San José" },
  "santa-ana-trade-center": { nombre: "Santa Ana Trade Center", provincia: "San José" },
  "lincoln": { nombre: "Lincoln Plaza", provincia: "San José" },
  "rohrmoser": { nombre: "Rohrmoser", provincia: "San José" },
  "el-encuentro-alajuelita": { nombre: "El Encuentro Alajuelita", provincia: "San José" },
  "zona-centro": { nombre: "Zona Centro", provincia: "San José" },
  "san-sebastian-1": { nombre: "San Sebastian", provincia: "San José" },
  "expreso-desamparados": { nombre: "Expreso Desamparados", provincia: "San José" },
  "multicentro-desamparados": { nombre: "Multicentro Desamparados", provincia: "San José" },
  "plaza-de-la-cultura": { nombre: "Plaza de la Cultura", provincia: "San José" },
  "expreso-tibas": { nombre: "Expreso Tibás", provincia: "San José" },
  "san-pedro-1": { nombre: "San Pedro", provincia: "San José" },
  "guadalupe-1": { nombre: "Guadalupe", provincia: "San José" },
  "curridabat": { nombre: "Curridabat", provincia: "San José" }
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
          resultado.sedes[slug] = { nombre: SEDES[slug].nombre, provincia: SEDES[slug].provincia, error: `HTTP ${response.status}`, horarios: {} };
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
                  nombre: SEDES[slug].nombre,
                  provincia: SEDES[slug].provincia,
                  horarios: dataDict.data
                };
              } else {
                resultado.sedes[slug] = { nombre: SEDES[slug].nombre, provincia: SEDES[slug].provincia, error: "Estructura interna sin .data", horarios: {} };
              }
            } catch (parseError) {
              resultado.sedes[slug] = { nombre: SEDES[slug].nombre, provincia: SEDES[slug].provincia, error: `Error de parseo JSON: ${parseError.message}`, horarios: {} };
            }
          } else {
            resultado.sedes[slug] = { nombre: SEDES[slug].nombre, provincia: SEDES[slug].provincia, error: "No se pudo extraer el contenido de JSON.parse", horarios: {} };
          }
        } else {
          resultado.sedes[slug] = { nombre: SEDES[slug].nombre, provincia: SEDES[slug].provincia, error: "No se encontró el bloque <script> del gimnasio", horarios: {} };
        }

      } catch (e) {
        resultado.sedes[slug] = { nombre: SEDES[slug].nombre, provincia: SEDES[slug].provincia, error: `Excepcion de red: ${e.message}`, horarios: {} };
      }
    }));

    return res.status(200).json(resultado);

  } catch (globalError) {
    return res.status(500).json({ error: `Falla global: ${globalError.message}` });
  }
}