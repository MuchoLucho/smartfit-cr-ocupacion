const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

createApp({
  setup() {
    const sedesData = ref({});
    const sedesVisibles = ref([]);
    const loading = ref(true);
    let chartInstance = null;

    // Theme Management (Default to dark or saved preference)
    const isDark = ref(localStorage.getItem('theme') !== 'light');

    const updateThemeClass = () => {
      if (isDark.value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const toggleTheme = () => {
      isDark.value = !isDark.value;
      localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
    };

    // Calculate current copyright year
    const currentYear = new Date().getFullYear();

    // Horas del eje X (De 5 AM a 10 PM -> 22h máximo útil)
    const getHorasEjeX = () => {
      const ahora = new Date();
      const mes = ahora.getMonth() + 1;
      const dia = ahora.getDate();
      const mesDia = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const dayOfWeek = ahora.getDay();

      // Feriados Costa Rica 2026
      const feriados = [
        "01-01", // Año Nuevo
        "04-02", // Jueves Santo
        "04-03", // Viernes Santo
        "04-11", // Día de Juan Santamaría
        "05-01", // Día del Trabajo
        "07-25", // Anexión de Nicoya
        "08-02", // Virgen de los Ángeles
        "08-15", // Día de la Madre
        "08-31", // Día de la Persona Negra
        "09-15", // Independencia
        "12-01", // Abolición del Ejército
        "12-25"  // Navidad
      ];

      const esFindeOFeriado = dayOfWeek === 0 || dayOfWeek === 6 || feriados.includes(mesDia);
      
      if (esFindeOFeriado) {
        // On weekends and holidays, show only business hours (7 AM to 7 PM)
        return Array.from({ length: 13 }, (_, i) => i + 7); // Hours 7 to 19
      } else {
        // On weekdays, show full hours (5 AM to 10 PM)
        return Array.from({ length: 18 }, (_, i) => i + 5); // Hours 5 to 22
      }
    };
    
    const horasEjeX = getHorasEjeX();

    const COLORES = [
      '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6',
      '#6366f1', '#14b8a6', '#f43f5e', '#a855f7', '#06b6d4',
      '#0ea5e9', '#84cc16', '#eab308'
    ];

    // Helper para pasar horas de 24h a string AM/PM
    const formatAMPM = (horaInt) => {
      const ampm = horaInt >= 12 ? 'PM' : 'AM';
      let horabasic = horaInt % 12;
      horabasic = horabasic ? horabasic : 12; // el caso de las 12
      return `${String(horabasic).padStart(2, '0')}:00 ${ampm}`;
    };

    const fetchData = async () => {
      loading.value = true;
      try {
        const res = await fetch('/api/ocupacion');
        const json = await res.json();
        sedesData.value = json.sedes || {};

        if (sedesVisibles.value.length === 0) {
          sedesVisibles.value = Object.keys(sedesData.value).filter(
            slug => !sedesData.value[slug].error && sedesData.value[slug].provincia === 'Heredia'
          );
        }

        await nextTick();
        // Retraso seguro de renderizado para evitar problemas de montado del canvas
        setTimeout(() => {
          renderChart();
        }, 100);
      } catch (err) {
        console.error("Falla de comunicación con el backend:", err);
      } finally {
        loading.value = false;
      }
    };

    const toggleAll = (select) => {
      if (select) {
        sedesVisibles.value = Object.keys(sedesData.value).filter(slug => !sedesData.value[slug].error && sedesData.value[slug].provincia === 'Heredia');
      } else {
        sedesVisibles.value = [];
      }
    };

    // FAQ modal visibility
    const showFAQ = ref(false);
    const toggleFAQ = () => {
      showFAQ.value = !showFAQ.value;
    };

    const tableSearch = ref('');
    const provinceFilter = ref('');

    // Sort locations alphabetically by name
    const sortedSedes = computed(() => {
      return Object.entries(sedesData.value)
        .map(([slug, data]) => ({ slug, ...data }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    });

    // Filter and sort for the table view
    const filteredTableSedes = computed(() => {
      const query = tableSearch.value.toLowerCase().trim();
      const provFilter = provinceFilter.value;
      let sedes = Object.entries(sedesData.value)
        .map(([slug, data]) => ({ slug, ...data }));

      // Apply text search filter
      if (query) {
        sedes = sedes.filter(sede =>
          sede.nombre.toLowerCase().includes(query) ||
          (sede.provincia && sede.provincia.toLowerCase().includes(query))
        );
      }
      // Apply province dropdown filter
      if (provFilter) {
        sedes = sedes.filter(sede => sede.provincia === provFilter);
      }

      return sedes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    });


    // List of provinces for dropdown filter
    const provinceList = computed(() => {
      // Get unique province names from sedesData
      const provinces = Object.values(sedesData.value)
        .map(s => s.provincia)
        .filter(p => p);
      // Remove duplicates and sort
      return [...new Set(provinces)].sort((a, b) => a.localeCompare(b, 'es'));
    });

    const sedesPorProvincia = computed(() => {
      const grouped = {};
      Object.entries(sedesData.value).forEach(([slug, data]) => {
        const prov = data.provincia || 'Otras';
        if (!grouped[prov]) grouped[prov] = [];
        grouped[prov].push({ slug, ...data });
      });
      // Sort provinces alphabetically, then sedes alphabetically
      return Object.keys(grouped).sort().map(prov => {
        return {
          nombre: prov,
          sedes: grouped[prov].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        };
      });
    });

    const obtenerMejorHora = (horarios) => {
      if (!horarios || Object.keys(horarios).length === 0) return { hora: 'Cerrado', ocupacion: 0 };

      // Filtramos descartando explícitamente las 22:00h
      const horasValidas = Object.entries(horarios)
        .map(([h, v]) => ({ hora: parseInt(h), ocupacion: parseInt(v) }))
        .filter(item => item.ocupacion > 0 && item.hora <= 21);

      if (horasValidas.length === 0) return { hora: 'Cerrado', ocupacion: 0 };

      horasValidas.sort((a, b) => a.ocupacion - b.ocupacion);
      return { hora: formatAMPM(horasValidas[0].hora), ocupacion: horasValidas[0].ocupacion };
    };

    const obtenerTendencia = (horarios) => {
      if (!horarios || Object.keys(horarios).length === 0) {
        return {
          status: 'Sin datos',
          detalle: '—',
          badgeClass: 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
        };
      }

      const ahora = new Date();
      const currentHour = ahora.getHours();

      const mes = ahora.getMonth() + 1;
      const dia = ahora.getDate();
      const mesDia = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const dayOfWeek = ahora.getDay();

      // Feriados Costa Rica 2026
      const feriados = [
        "01-01", // Año Nuevo
        "04-02", // Jueves Santo
        "04-03", // Viernes Santo
        "04-11", // Día de Juan Santamaría
        "05-01", // Día del Trabajo
        "07-25", // Anexión de Nicoya
        "08-02", // Virgen de los Ángeles
        "08-15", // Día de la Madre
        "08-31", // Día de la Persona Negra
        "09-15", // Independencia
        "12-01", // Abolición del Ejército
        "12-25"  // Navidad
      ];

      const esFindeOFeriado = dayOfWeek === 0 || dayOfWeek === 6 || feriados.includes(mesDia);
      const minHour = esFindeOFeriado ? 7 : 5;
      const maxHour = esFindeOFeriado ? 19 : 22;

      if (currentHour < minHour || currentHour >= maxHour) {
        return {
          status: 'Cerrado 🛑',
          detalle: `Abre a las ${formatAMPM(minHour)}`,
          badgeClass: 'bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20'
        };
      }

      const horasValidas = Object.entries(horarios)
        .map(([h, v]) => ({ hora: parseInt(h), ocupacion: parseInt(v) }))
        .filter(item => item.ocupacion > 0);

      if (horasValidas.length === 0) {
        return {
          status: 'Sin datos',
          detalle: 'Sin datos de operación',
          badgeClass: 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
        };
      }

      const val0 = horarios[currentHour] !== undefined ? parseInt(horarios[currentHour]) : 0;
      const val1 = horarios[currentHour + 1] !== undefined ? parseInt(horarios[currentHour + 1]) : undefined;
      const val2 = horarios[currentHour + 2] !== undefined ? parseInt(horarios[currentHour + 2]) : undefined;

      // 1. Decreases in the next hour
      if (val1 !== undefined && val1 < val0) {
        return {
          status: 'Bajando 📉',
          detalle: `Baja la próxima hora (${val0}% → ${val1}%)`,
          badgeClass: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 font-bold'
        };
      }

      // 2. Decreases in 2 hours
      const midVal = val1 !== undefined ? val1 : val0;
      if (val2 !== undefined && val2 < midVal) {
        return {
          status: 'Baja en 2h 📉',
          detalle: `Baja a las ${formatAMPM(currentHour + 2)} (${midVal}% → ${val2}%)`,
          badgeClass: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 font-bold'
        };
      }

      // 3. Not decreasing in 1 or 2 hours. Find when it starts to decrease.
      let horaDescenso = -1;
      for (let h = currentHour + 1; h <= maxHour; h++) {
        const prevVal = horarios[h - 1] !== undefined ? parseInt(horarios[h - 1]) : 0;
        const currVal = horarios[h] !== undefined ? parseInt(horarios[h]) : 0;
        if (currVal < prevVal) {
          horaDescenso = h;
          break;
        }
      }

      const esAumento = (val1 !== undefined && val1 > val0) || (val2 !== undefined && val2 > midVal);
      const statusLabel = esAumento ? 'Subiendo 📈' : 'Estable ➡️';
      const badgeStyle = esAumento
        ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 font-bold'
        : 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 font-bold';

      if (horaDescenso !== -1) {
        return {
          status: statusLabel,
          detalle: `Empieza a bajar a las ${formatAMPM(horaDescenso)}`,
          badgeClass: badgeStyle
        };
      }

      return {
        status: statusLabel,
        detalle: 'No baja antes del cierre',
        badgeClass: badgeStyle
      };
    };


    const renderChart = () => {
      const ctx = document.getElementById('trafficChart');
      if (!ctx) {
        console.error("No se encontró el elemento canvas en el DOM");
        return;
      }

      if (chartInstance) {
        chartInstance.destroy();
      }

      const datasets = Object.keys(sedesData.value)
        .filter(slug => sedesVisibles.value.includes(slug))
        .map((slug, index) => {
          const dataSede = sedesData.value[slug];
          const dataPoints = horasEjeX.map(h => dataSede.horarios[h] !== undefined ? dataSede.horarios[h] : null);

          return {
            label: dataSede.nombre,
            data: dataPoints,
            borderColor: COLORES[index % COLORES.length],
            backgroundColor: COLORES[index % COLORES.length] + '15',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 2
          };
        });

      // Adaptive theme configuration for Chart.js
      const isDarkTheme = isDark.value;
      const gridColor = isDarkTheme ? '#334155' : '#e2e8f0';
      const tickColor = isDarkTheme ? '#94a3b8' : '#475569';
      const tooltipBg = isDarkTheme ? '#1e293b' : '#ffffff';
      const tooltipBorder = isDarkTheme ? '#475569' : '#e2e8f0';
      const tooltipBody = isDarkTheme ? '#f1f5f9' : '#0f172a';

      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: horasEjeX.map(h => formatAMPM(h)),
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: tickColor,
                usePointStyle: true,
                boxWidth: 8
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: tooltipBg,
              titleColor: '#fbbf24',
              bodyColor: tooltipBody,
              borderColor: tooltipBorder,
              borderWidth: 1
            }
          },
          scales: {
            y: {
              title: {
                display: true,
                text: 'Porcentaje de ocupación',
                color: tickColor,
                font: { size: 13, weight: '500' }
              },
              min: 0,
              max: 100,
              grid: { color: gridColor },
              ticks: { color: tickColor, callback: (value) => `${value}%` }
            },
            x: {
              grid: { color: gridColor },
              ticks: { color: tickColor }
            }
          }
        }
      });
    };

    watch(sedesVisibles, () => {
      if (chartInstance) {
        renderChart();
      }
    }, { deep: true });

    watch(isDark, () => {
      updateThemeClass();
      if (chartInstance) {
        renderChart();
      }
    });

    onMounted(() => {
      updateThemeClass();
      fetchData();
    });

    return {
      sedesData,
      sedesVisibles,
      loading,
      fetchData,
      toggleAll,
      obtenerMejorHora,
      obtenerTendencia,
      isDark,
      toggleTheme,
      currentYear,
      sortedSedes,
      sedesPorProvincia,
      tableSearch,
      provinceFilter,
      provinceList,
      filteredTableSedes,
      showFAQ,
      toggleFAQ
    };
  }
}).mount('#app');
