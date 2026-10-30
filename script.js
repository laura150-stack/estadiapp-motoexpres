const ESQUEMA = [
      "id_servicio", "fecha", "hora_llegada", "dia_semana", "sede",
      "mecanico", "id_cliente", "tipo_cliente", "tipo_vehiculo", "tipo_servicio",
      "tiempo_diagnostico_min", "tiempo_reparacion_h", "repuestos_usados",
      "costo_repuestos_usd", "costo_mano_obra_usd", "costo_total_usd",
      "satisfaccion", "recomendaria", "requirio_garantia", "metodo_pago", "canal_reserva"
    ];

    let DATA = null;

    function showScreen(sc) {
      document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
      document.getElementById('screen-' + sc).style.display = 'block';
      document.querySelectorAll('.nav button').forEach(b => b.removeAttribute('aria-current'));
      const btn = document.getElementById('nav-' + sc);
      if (btn) btn.setAttribute('aria-current', 'page');

      if (sc === 'm2') calcM2();
      if (sc === 'm3') calcM3();
    }

    function handleFileSelect(evt) {
      const file = evt.target.files[0];
      if (!file) return;

      document.getElementById('top-filename').textContent = file.name;
      document.getElementById('error-container').innerHTML = '';

      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'csv') {
        Papa.parse(file, {
          header: true, dynamicTyping: true, skipEmptyLines: true,
          complete: function (res) { validateAndLoad(res.data, file.name); }
        });
      } else if (ext === 'xlsx') {
        const reader = new FileReader();
        reader.onload = function (e) {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const sheet = wb.SheetNames.includes('datos') ? 'datos' : wb.SheetNames[0];
          const json = XLSX.utils.sheet_to_json(wb.Sheets[sheet]);
          validateAndLoad(json, file.name);
        };
        reader.readAsArrayBuffer(file);
      }
    }

    function validateAndLoad(rows, filename) {
      DATA = null;
      document.getElementById('kpi-filas').textContent = '-';
      document.getElementById('kpi-desde').textContent = '-';
      document.getElementById('kpi-hasta').textContent = '-';
      document.getElementById('kpi-mecs').textContent = '-';
      document.getElementById('kpi-clientes').textContent = '-';
      document.getElementById('sedes-tags').innerHTML = '<i>No hay sedes cargadas.</i>';
      document.getElementById('preview-header').innerHTML = '';
      document.getElementById('preview-body').innerHTML = '<tr><td colspan="21">Cargue un archivo válido.</td></tr>';

      const succContainer = document.getElementById('success-message-container');
      if (succContainer) succContainer.innerHTML = '';
      const errContainer = document.getElementById('error-container');
      if (errContainer) errContainer.innerHTML = '';

      if (!rows || rows.length === 0) {
        showErrors(["El archivo está vacío."]);
        return;
      }

      const cols = Object.keys(rows[0]);
      let errs = [];

      const missing = ESQUEMA.filter(c => !cols.includes(c));
      if (missing.length > 0) errs.push(`Faltan columnas obligatorias: ${missing.join(', ')}`);

      let emptyCount = 0, dups = 0, mathBad = 0;
      let ids = new Set();

      rows.forEach(r => {
        ESQUEMA.forEach(c => {
          if (r[c] === null || r[c] === undefined || r[c] === '') emptyCount++;
        });
        if (ids.has(r.id_servicio)) dups++;
        ids.add(r.id_servicio);

        if (Math.abs((r.costo_repuestos_usd + r.costo_mano_obra_usd) - r.costo_total_usd) > 0.01) {
          mathBad++;
        }
      });

      if (emptyCount > 0) errs.push(`Se encontraron ${emptyCount} celdas vacías.`);
      if (dups > 0) errs.push(`Se encontraron ${dups} identificadores 'id_servicio' duplicados.`);
      if (mathBad > 0) errs.push(`Existen ${mathBad} filas donde costo_total_usd no descuadra.`);

      if (errs.length > 0) {
        showErrors(errs);
        limpiarModulosAnalisis(); // <-- ¡ESTO ES LO QUE FALTABA! Limpia M2 y M3 de inmediato
        return;
    }

      DATA = rows;

      if (succContainer) {
        succContainer.innerHTML = `
        <div style="border-left: 4px solid var(--teal); background: var(--teal-soft); padding: 12px 14px; border-radius: 0 8px 8px 0; font-size: 13px; margin-top: 14px; color: var(--ink);">
          <b style="color: var(--teal);">${filename}:</b> los 21 encabezados coinciden con el esquema (MotoExpres S.A.S.).
        </div>
      `;
      }

      populateSedesFilter(rows);

      document.getElementById('chk-cols').textContent = '21 de 21';
      document.getElementById('chk-empty').textContent = '0 vacías';
      document.getElementById('chk-dups').textContent = '0 duplicadas';
      document.getElementById('chk-id').textContent = rows.length + ' únicos';
      document.getElementById('valid-interp').innerHTML = `<b style="color:var(--green)">Archivo válido.</b> Cumple rigurosamente el esquema oficial.`;

      document.getElementById('kpi-filas').textContent = rows.length.toLocaleString();
      document.getElementById('kpi-cols').textContent = '21';

      const fechas = rows.map(r => r.fecha).sort();
      document.getElementById('kpi-desde').textContent = fechas[0] || '-';
      document.getElementById('kpi-hasta').textContent = fechas[fechas.length - 1] || '-';

      const mecs = new Set(rows.map(r => r.mecanico));
      const sedes = new Set(rows.map(r => r.sede));
      const clientes = new Set(rows.map(r => r.id_cliente));

      document.getElementById('kpi-mecs').textContent = mecs.size;
      document.getElementById('kpi-clientes').textContent = clientes.size.toLocaleString();

      document.getElementById('sedes-tags').innerHTML = Array.from(sedes).map(s => `<span class="pill">${s}</span>`).join('');

      document.getElementById('preview-header').innerHTML = ESQUEMA.map(c => `<th>${c}</th>`).join('');
      document.getElementById('preview-body').innerHTML = rows.slice(0, 10).map(r => `
      <tr>${ESQUEMA.map(c => `<td class="mono">${r[c]}</td>`).join('')}</tr>
    `).join('');

      calcM2();
      calcM3();
    }

    function showErrors(list) {
      document.getElementById('valid-interp').innerHTML = `<b style="color:var(--red)">Archivo rechazado.</b> Ver detalles abajo.`;
      document.getElementById('error-container').innerHTML = `
      <div class="err-box">
        <b>El archivo no cumple con el esquema:</b>
        <ul>${list.map(e => `<li>${e}</li>`).join('')}</ul>
      </div>
    `;
    }

    function limpiarModulosAnalisis() {
        
    document.querySelectorAll('#screen-m2 .kpi .v, [id^="m2-card-"]').forEach(el => {
        el.innerText = '-';
    });
    
    const chartCont = document.getElementById('bar-chart-container');
    if (chartCont) chartCont.innerHTML = '<span style="color: var(--muted); font-size: 13px;">Sin datos válidos.</span>';
    
    const boxCont = document.getElementById('boxplot-container');
    if (boxCont) boxCont.innerHTML = '<span style="color: var(--muted); font-size: 13px;">Sin datos válidos.</span>';

    const histBox = document.getElementById('histogram-box');
    if (histBox) histBox.innerHTML = '<span style="color: var(--muted); margin:auto;">No hay datos para el histograma</span>';

    const statsTable = document.getElementById('m2-stats-table');
    if (statsTable) statsTable.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--muted);">Esperando datos...</td></tr>';

    const m2Interp = document.getElementById('m2-interp');
    if (m2Interp) m2Interp.innerHTML = '<b>Lectura:</b> Cargue un archivo en M1 para ver la interpretación analítica.';

    // --- LIMPIAR MÓDULO 3 ---
    const kpiPa = document.getElementById('m3-kpi-pa');
    const kpiPb = document.getElementById('m3-kpi-pb');
    const kpiPanb = document.getElementById('m3-kpi-panb');
    const kpiPaub = document.getElementById('m3-kpi-paub');
    if (kpiPa) kpiPa.innerText = '-';
    if (kpiPb) kpiPb.innerText = '-';
    if (kpiPanb) kpiPanb.innerText = '-';
    if (kpiPaub) kpiPaub.innerText = '-';

    const tablaContingencia = document.getElementById('m3-tabla-contingencia');
    if (tablaContingencia) {
        tablaContingencia.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--muted);">Cargue datos para calcular...</td></tr>`;
    }

    const barrasGarantia = document.getElementById('m3-bars-garantia');
    if (barrasGarantia) {
        barrasGarantia.innerHTML = `<i style="color:var(--muted); font-size:12px;">Sin datos cargados.</i>`;
    }

    const bayesAntesVal = document.getElementById('m3-bayes-antes-val');
    const bayesDespuesVal = document.getElementById('m3-bayes-despues-val');
    const bayesInterp = document.getElementById('m3-bayes-interp');
    if (bayesAntesVal) bayesAntesVal.innerText = "-%";
    if (bayesDespuesVal) bayesDespuesVal.innerText = "-%";
    if (bayesInterp) {
        bayesInterp.innerHTML = `<b>Lectura:</b> Cargue datos para analizar el cambio de probabilidad con Bayes.`;
    }

    const tablaIndependencia = document.getElementById('m3-tabla-independencia');
    if (tablaIndependencia) {
        tablaIndependencia.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:10px; color:var(--muted);">Cargue datos para la prueba...</td></tr>`;
    }
}

    function testInvalidFile() {
      showErrors([
        "Falta la columna 'costo_total_usd' (llegó como 'costo').",
        "1 celda vacía en la columna 'sede' (fila 6).",
        "1 fila duplicada (fila 61 repite la fila 11)."
      ]);
    }

    function populateSedesFilter(rows) {
      const sedes = Array.from(new Set(rows.map(r => r.sede))).filter(Boolean);
      const selSede = document.getElementById('sel-sede');
      selSede.innerHTML = '<option value="Todas">Todas las sedes</option>' + sedes.map(s => `<option value="${s}">${s}</option>`).join('');
    }


    function calcM2() {
      if (!DATA || DATA.length === 0) return;

      const v = document.getElementById('sel-var').value;
      const sedeFiltro = document.getElementById('sel-sede').value;

      let filteredData = DATA;
      if (sedeFiltro !== 'Todas') {
        filteredData = DATA.filter(r => r.sede === sedeFiltro);
      }

      const vals = filteredData.map(r => Number(r[v])).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const n = vals.length;
      if (n === 0) return;

      const sum = vals.reduce((a, b) => a + b, 0);
      const media = sum / n;
      const mediana = n % 2 === 0 ? (vals[n / 2 - 1] + vals[n / 2]) / 2 : vals[Math.floor(n / 2)];

      const min = vals[0];
      const max = vals[n - 1];

      const variance = vals.reduce((a, b) => a + Math.pow(b - media, 2), 0) / (n - 1);
      const std = Math.sqrt(variance);
      const cv = media !== 0 ? (std / media) * 100 : 0;

      const q1 = vals[Math.floor(n * 0.25)];
      const q3 = vals[Math.floor(n * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      const atipicos = vals.filter(val => val < lowerBound || val > upperBound).length;

      const m3 = vals.reduce((a, b) => a + Math.pow(b - media, 3), 0) / n;
      const sesgo = std > 0 ? (m3 / Math.pow(std, 3)) * (Math.sqrt(n * (n - 1)) / (n - 2)) : 0;

      document.getElementById('m2-kpi-media').textContent = media.toFixed(2);
      document.getElementById('m2-kpi-mediana').textContent = mediana.toFixed(2);
      document.getElementById('m2-kpi-std').textContent = std.toFixed(2);
      document.getElementById('m2-kpi-cv').textContent = cv.toFixed(1) + ' %';
      document.getElementById('m2-kpi-sesgo').textContent = sesgo.toFixed(2);
      document.getElementById('m2-kpi-atipicos').textContent = atipicos;

      document.getElementById('m2-stats-table').innerHTML = `
      <tr><td><b>n</b></td><td class="mono" style="text-align:right;">${n.toLocaleString()}</td></tr>
      <tr><td><b>Media</b></td><td class="mono" style="text-align:right;">${media.toFixed(2)}</td></tr>
      <tr><td><b>Mediana</b></td><td class="mono" style="text-align:right;">${mediana.toFixed(2)}</td></tr>
      <tr><td><b>Desviación estándar</b></td><td class="mono" style="text-align:right;">${std.toFixed(2)}</td></tr>
      <tr><td><b>Coeficiente de variación</b></td><td class="mono" style="text-align:right;">${cv.toFixed(1)} %</td></tr>
      <tr><td><b>Q1 · Q3</b></td><td class="mono" style="text-align:right;">${q1.toFixed(2)} · ${q3.toFixed(2)}</td></tr>
      <tr><td><b>IQR</b></td><td class="mono" style="text-align:right;">${iqr.toFixed(2)}</td></tr>
      <tr><td><b>Mínimo · Máximo</b></td><td class="mono" style="text-align:right;">${min.toFixed(2)} · ${max.toFixed(2)}</td></tr>
      <tr><td><b>Sesgo</b></td><td class="mono" style="text-align:right;">${sesgo.toFixed(2)}</td></tr>
      <tr><td><b>Atípicos</b></td><td class="mono" style="text-align:right;">${atipicos}</td></tr>
    `;

      let interpretacion = "";
      if (sesgo > 0.5) {
        interpretacion = `La variable es sesgada a la derecha (sesgo ${sesgo.toFixed(2)}): la mediana (${mediana.toFixed(2)}) representa mejor el caso típico que la media (${media.toFixed(2)}).`;
      } else if (sesgo < -0.5) {
        interpretacion = `La variable es sesgada a la izquierda (sesgo ${sesgo.toFixed(2)}): la mediana (${mediana.toFixed(2)}) es un estadístico de tendencia central más robusto que la media (${media.toFixed(2)}).`;
      } else {
        interpretacion = `La distribución es relativamente simétrica (sesgo ${sesgo.toFixed(2)}); media y mediana se alinean cercanamente alrededor del centro de los datos.`;
      }
      document.getElementById('m2-interp').innerHTML = `<b>Lectura:</b> ${interpretacion}`;

      document.getElementById('hist-title').textContent = `Histograma de ${v}`;

      renderFrecuenciasServicio(filteredData);
      renderBoxplotsPorServicio(filteredData, v);
      renderHistograma(vals, v);
      renderTarjetasInferiores(filteredData);
    }

    function renderTarjetasInferiores(rows) {
      if (!rows || rows.length === 0) return;

      try {
        const sedesCosto = {};
        rows.forEach(r => {
          const s = r.sede || 'N/A';
          if (!sedesCosto[s]) sedesCosto[s] = [];
          const val = Number(r.costo_total_usd);
          if (!isNaN(val)) sedesCosto[s].push(val);
        });

        let bestSede = '-';
        let maxMediaSede = -1;
        Object.entries(sedesCosto).forEach(([s, vals]) => {
          if (vals.length > 0) {
            const m = vals.reduce((a, b) => a + b, 0) / vals.length;
            if (m > maxMediaSede) { maxMediaSede = m; bestSede = s; }
          }
        });

        const elSede = document.getElementById('m2-card-sede');
        const elSedeVal = document.getElementById('m2-card-sede-val');

        if (elSede) elSede.textContent = bestSede;
        if (elSedeVal) elSedeVal.textContent = maxMediaSede >= 0 ? `${maxMediaSede.toFixed(2)} USD` : '-';

        const mecs = {};
        rows.forEach(r => {
          const m = r.mecanico;
          if (!m) return;
          if (!mecs[m]) mecs[m] = [];
          const val = Number(r.costo_total_usd);
          if (!isNaN(val)) mecs[m].push(val);
        });

        let bestMec = '-';
        let minCV = Infinity;

        Object.entries(mecs).forEach(([m, vals]) => {
          if (vals.length === 0) return;
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          if (mean === 0) return;

          let cv = 0;
          if (vals.length > 1) {
            const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length - 1);
            const std = Math.sqrt(variance);
            cv = (std / mean) * 100;
          }

          if (cv < minCV) {
            minCV = cv;
            bestMec = m;
          }
        });

        const elMec = document.getElementById('m2-card-mec');
        const elMecVal = document.getElementById('m2-card-mec-val');
        if (elMec) elMec.textContent = bestMec;
        if (elMecVal) elMecVal.textContent = minCV !== Infinity ? `CV ${minCV.toFixed(1)} %` : '-';

        const sats = rows.map(r => Number(r.satisfaccion)).filter(n => !isNaN(n));
        const elSat = document.getElementById('m2-card-sat');
        const elSatVal = document.getElementById('m2-card-sat-val');

        if (sats.length > 0) {
          const satMean = sats.reduce((a, b) => a + b, 0) / sats.length;
          const freq = {};
          sats.forEach(s => freq[s] = (freq[s] || 0) + 1);
          let moda = sats[0], maxF = 0;
          Object.entries(freq).forEach(([s, f]) => { if (f > maxF) { maxF = f; moda = s; } });

          if (elSat) elSat.textContent = `moda ${moda}`;
          if (elSatVal) elSatVal.textContent = `media ${satMean.toFixed(2)}`;
        } else {
          if (elSat) elSat.textContent = '-';
          if (elSatVal) elSatVal.textContent = '-';
        }
      } catch (e) {
        console.error("EXCEPCIÓN EN RENDER TARJETAS INFERIORES:", e);
      }
    }


    function renderFrecuenciasServicio(rows) {
      const cont = document.getElementById('bar-chart-container');
      const counts = {};
      rows.forEach(r => {
        const s = r.tipo_servicio || 'Desconocido';
        counts[s] = (counts[s] || 0) + 1;
      });

      const total = rows.length;
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

      cont.innerHTML = sorted.map(([serv, count]) => {
        const pct = ((count / total) * 100).toFixed(1);
        return `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
            <span>${serv}</span>
            <span class="mono">${count} - ${pct}%</span>
          </div>
          <div style="background:var(--surface-2); border-radius:4px; height:10px; width:100%; overflow:hidden;">
            <div style="background:var(--teal); height:100%; width:${pct}%;"></div>
          </div>
        </div>
      `;
      }).join('');
    }

    function renderBoxplotsPorServicio(rows, varName) {
      const cont = document.getElementById('boxplot-container');
      const grupos = {};
      rows.forEach(r => {
        const g = r.tipo_servicio || 'General';
        if (!grupos[g]) grupos[g] = [];
        const val = Number(r[varName]);
        if (!isNaN(val)) grupos[g].push(val);
      });

      const html = Object.entries(grupos).map(([serv, vals]) => {
        if (vals.length === 0) return '';
        vals.sort((a, b) => a - b);
        const min = vals[0];
        const max = vals[vals.length - 1];
        const q1 = vals[Math.floor(vals.length * 0.25)];
        const med = vals[Math.floor(vals.length * 0.5)];
        const q3 = vals[Math.floor(vals.length * 0.75)];

        return `
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span style="width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${serv}</span>
          <div style="flex-grow:1; position:relative; height:16px; margin:0 10px; background:rgba(255,255,255,0.05); border-radius:4px;">
            <div style="position:absolute; left:${(min / max) * 100}%; width:${((max - min) / max) * 100}%; height:2px; background:var(--muted); top:7px;"></div>
            <div style="position:absolute; left:${(q1 / max) * 100}%; width:${((q3 - q1) / max) * 100}%; height:12px; background:var(--teal); opacity:0.8; top:2px; border-radius:2px;"></div>
            <div style="position:absolute; left:${(med / max) * 100}%; width:2px; height:14px; background:var(--amber); top:1px;"></div>
          </div>
          <span class="mono" style="width:50px; text-align:right; font-size:11px;">${med.toFixed(0)}</span>
        </div>
      `;
      }).join('');

      cont.innerHTML = html || '<i>No hay suficientes datos para generar boxplots.</i>';
    }

    function renderHistograma(vals, v) {
      const container = document.getElementById('histogram-box');
      if (!vals || vals.length === 0) {
        container.innerHTML = '<span style="color:var(--muted); margin:auto;">No hay datos para el histograma</span>';
        return;
      }

      const min = vals[0];
      const max = vals[vals.length - 1];

      if (min === max) {
        container.innerHTML = '<span style="color:var(--muted); margin:auto;">Los valores son idénticos, no se puede histogramar</span>';
        return;
      }

      // Dividir en 8 intervalos (bins)
      const numBins = 8;
      const binWidth = (max - min) / numBins;
      const bins = Array(numBins).fill(0);

      vals.forEach(val => {
        let binIndex = Math.floor((val - min) / binWidth);
        if (binIndex >= numBins) binIndex = numBins - 1; // por si cae exactamente en el max
        if (binIndex < 0) binIndex = 0;
        bins[binIndex]++;
      });

      const maxFreq = Math.max(...bins);

      // Dibujar las barras dentro del contenedor
      container.innerHTML = bins.map((freq, i) => {
        const binMin = min + i * binWidth;
        const binMax = binMin + binWidth;
        const heightPct = maxFreq > 0 ? (freq / maxFreq) * 100 : 0;

        return `
        <div style="display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; flex:1; padding:0 2px;" title="Rango: ${binMin.toFixed(0)} - ${binMax.toFixed(0)} | Frecuencia: ${freq}">
          <div style="font-size:9px; color:var(--muted); margin-bottom:2px;">${freq}</div>
          <div style="background:var(--teal); width:100%; height:${heightPct}%; border-radius:3px 3px 0 0; min-height:4px;"></div>
          <div style="font-size:9px; color:var(--muted); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center;">${binMin.toFixed(0)}</div>
        </div>
      `;
      }).join('');
    }

    function calcM3() {
      if (!DATA || DATA.length === 0) return;

      const totalN = DATA.length;

      // 1. Probabilidades Básicas y Regla de la Suma
      const countA = DATA.filter(r => String(r.tipo_vehiculo || '').toLowerCase().includes('moto')).length;
      const countB = DATA.filter(r => Number(r.satisfaccion) >= 4).length;
      const countAnB = DATA.filter(r => String(r.tipo_vehiculo || '').toLowerCase().includes('moto') && Number(r.satisfaccion) >= 4).length;

      const pA = countA / totalN;
      const pB = countB / totalN;
      const pAnB = countAnB / totalN;
      const pAuB = pA + pB - pAnB; // Regla de la suma

      document.getElementById('m3-kpi-pa').textContent = pA.toFixed(4);
      document.getElementById('m3-kpi-pb').textContent = pB.toFixed(4);
      document.getElementById('m3-kpi-panb').textContent = pAnB.toFixed(4);
      document.getElementById('m3-kpi-paub').textContent = pAuB.toFixed(4);

      // 2. TABLA DE CONTINGENCIA Y BARRAS: Mecánico x Requirió Garantía
      const mecs = {};
      let totalGarantias = 0;

      DATA.forEach(r => {
        const m = r.mecanico || 'Sin Asignar';
        const garantia = String(r.requirio_garantia || r.garantia || '').toLowerCase();
        const esSi = (garantia === 'sí' || garantia === 'si' || garantia === 'true' || garantia === '1');

        if (!mecs[m]) mecs[m] = { si: 0, no: 0, total: 0 };

        if (esSi) {
          mecs[m].si++;
          totalGarantias++;
        } else {
          mecs[m].no++;
        }
        mecs[m].total++;
      });

      let htmlContingencia = '';
      let htmlBarras = '';
      let maxP = 0;

      Object.entries(mecs).forEach(([m, obj]) => {
        const pCond = obj.total > 0 ? (obj.si / obj.total) : 0;
        if (pCond > maxP) maxP = pCond;

        htmlContingencia += `
          <tr style="border-bottom:1px solid #222;">
            <td style="padding:8px; font-weight:600; color:#FFF;">${m}</td>
            <td style="padding:8px; text-align:center;">${obj.si}</td>
            <td style="padding:8px; text-align:center;">${obj.no}</td>
            <td style="padding:8px; text-align:center; font-weight:600;">${obj.total}</td>
            <td style="padding:8px; text-align:right; color:#4ecca3; font-weight:bold;">${pCond.toFixed(4)}</td>
          </tr>
        `;
      });

      document.getElementById('m3-tabla-contingencia').innerHTML = htmlContingencia;

      // Renderizar Barras de P(Garantía | Mecánico)
      const maxAncho = maxP > 0 ? maxP : 1;
      Object.entries(mecs).forEach(([m, obj]) => {
        const pCond = obj.total > 0 ? (obj.si / obj.total) : 0;
        const widthPct = (pCond / maxAncho) * 100;

        htmlBarras += `
          <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
            <div style="width:110px; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m}</div>
            <div style="flex:1; background:#161625; border-radius:4px; height:18px; overflow:hidden;">
              <div style="background:#4ecca3; width:${widthPct}%; height:100%; border-radius:4px;"></div>
            </div>
            <div style="width:45px; text-align:right; font-weight:bold; color:#4ecca3;">${pCond.toFixed(3)}</div>
          </div>
        `;
      });

      document.getElementById('m3-bars-garantia').innerHTML = htmlBarras;

      // 3. TEOREMA DE BAYES: ¿De dónde viene una garantía?
      let targetMec = Object.keys(mecs)[0] || 'Mecánico';
      let maxRate = -1;

      Object.entries(mecs).forEach(([m, obj]) => {
        const rate = obj.total > 0 ? (obj.si / obj.total) : 0;
        if (rate > maxRate) {
          maxRate = rate;
          targetMec = m;
        }
      });

      const pPrior = mecs[targetMec] ? (mecs[targetMec].total / totalN) : 0;
      const pGarantiaDadaMec = maxRate;
      const pGarantiaGlobal = totalN > 0 ? (totalGarantias / totalN) : 0;

      const pPosterior = pGarantiaGlobal > 0 ? (pGarantiaDadaMec * pPrior) / pGarantiaGlobal : 0;
      const factor = pPrior > 0 ? (pPosterior / pPrior).toFixed(1) : '1.0';

      document.getElementById('m3-bayes-antes-label').textContent = `ANTES · P(${targetMec.toUpperCase()})`;
      document.getElementById('m3-bayes-antes-val').textContent = `${(pPrior * 100).toFixed(1)} %`;

      document.getElementById('m3-bayes-despues-label').textContent = `DESPUÉS · P(${targetMec.toUpperCase()} | GARANTÍA)`;
      document.getElementById('m3-bayes-despues-val').textContent = `${(pPosterior * 100).toFixed(1)} %`;

      document.getElementById('m3-bayes-interp').innerHTML = `
        <b>Lectura:</b> Saber que hubo garantía multiplica por <b>${factor}</b> la probabilidad de que la reparación haya sido realizada por <b>${targetMec}</b>.
      `;

      // 4. PRUEBA DE INDEPENDENCIA: Regla |P(A|B) - P(A)| < 0.02
      const testPairs = [
        {
          condLabel: 'P(Satisf ≥ 4 | Moto)',
          uncondLabel: 'P(Satisf ≥ 4)',
          calcCond: () => {
            const motos = DATA.filter(r => String(r.tipo_vehiculo || '').toLowerCase().includes('moto'));
            return motos.length > 0 ? motos.filter(r => Number(r.satisfaccion) >= 4).length / motos.length : 0;
          },
          calcUncond: () => pB,
          desc: 'Tener una moto'
        },
        {
          condLabel: 'P(Recomienda | Nequi)',
          uncondLabel: 'P(Recomienda)',
          calcCond: () => {
            const nequi = DATA.filter(r => String(r.metodo_pago || '').toLowerCase().includes('nequi'));
            return nequi.length > 0 ? nequi.filter(r => String(r.recomendaria || '').toLowerCase().includes('sí') || String(r.recomendaria || '').toLowerCase().includes('si')).length / nequi.length : 0;
          },
          calcUncond: () => {
            return DATA.filter(r => String(r.recomendaria || '').toLowerCase().includes('sí') || String(r.recomendaria || '').toLowerCase().includes('si')).length / totalN;
          },
          desc: 'Pagar con Nequi'
        },
        {
          condLabel: 'P(Satisf ≥ 4 | Garantía)',
          uncondLabel: 'P(Satisf ≥ 4)',
          calcCond: () => {
            const garantias = DATA.filter(r => String(r.requirio_garantia || r.garantia || '').toLowerCase().includes('sí') || String(r.requirio_garantia || r.garantia || '').toLowerCase().includes('si'));
            return garantias.length > 0 ? garantias.filter(r => Number(r.satisfaccion) >= 4).length / garantias.length : 0;
          },
          calcUncond: () => pB,
          desc: 'Haber requerido garantía'
        }
      ];

      let htmlIndep = '';

      testPairs.forEach(pair => {
        const pCond = pair.calcCond();
        const pUncond = pair.calcUncond();
        const diff = pCond - pUncond;
        const absDiff = Math.abs(diff);

        // Regla de corte según la rúbrica: |P(A|B) - P(A)| < 0.02
        const esIndep = absDiff < 0.02;

        let veredictoText = '';
        let badgeBg = '';
        let badgeColor = '';

        if (esIndep) {
          veredictoText = 'prácticamente independientes';
          badgeBg = 'rgba(78, 204, 163, 0.2)';
          badgeColor = '#4ecca3';
        } else {
          const efecto = diff > 0 ? 'aumenta' : 'disminuye';
          veredictoText = `dependientes (${pair.desc} ${efecto} la probabilidad)`;
          badgeBg = 'rgba(235, 130, 60, 0.2)';
          badgeColor = '#eb823c';
        }

        htmlIndep += `
          <tr style="border-bottom:1px solid #222;">
            <td style="padding:8px; font-weight:600; color:#FFF;">${pair.condLabel}</td>
            <td style="padding:8px; text-align:center; color:#4ecca3; font-weight:bold;">${pCond.toFixed(4)}</td>
            <td style="padding:8px; color:#888;">${pair.uncondLabel}</td>
            <td style="padding:8px; text-align:center; color:#FFF;">${pUncond.toFixed(4)}</td>
            <td style="padding:8px; text-align:right;">
              <span style="background:${badgeBg}; color:${badgeColor}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; display:inline-block;">
                ${veredictoText}
              </span>
            </td>
          </tr>
        `;
      });

      document.getElementById('m3-tabla-independencia').innerHTML = htmlIndep;
    }