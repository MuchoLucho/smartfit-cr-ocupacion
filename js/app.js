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

    // Horas del eje X (De 5 AM a 9 PM -> 21h máximo útil)
    const horasEjeX = Array.from({ length: 17 }, (_, i) => i + 5);

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
            slug => !sedesData.value[slug].error
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
        sedesVisibles.value = Object.keys(sedesData.value).filter(slug => !sedesData.value[slug].error);
      } else {
        sedesVisibles.value = [];
      }
    };

    // Sort locations alphabetically by name
    const sortedSedes = computed(() => {
      return Object.entries(sedesData.value)
        .map(([slug, data]) => ({ slug, ...data }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
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
            legend: { display: false },
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
      isDark, 
      toggleTheme, 
      currentYear, 
      sortedSedes 
    };
  }
}).mount('#app');
