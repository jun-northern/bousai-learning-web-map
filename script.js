(function () {
  "use strict";

  const DATASETS = {
    municipality: "data/municipality.geojson",
    tsunamiKushiro: "data/tsunami_kushiro.geojson",
    tsunamiNemuro: "data/tsunami_nemuro.geojson",
    evacuation: "data/evacuation_sites_tsunami.geojson",
    municipalityScenario: "data/disaster_scenario_municipality.csv"
  };

  const INITIAL_VIEW_BOUNDS = L.latLngBounds(
    [42.55, 142.95],
    [44.15, 146.35]
  );

  const INUNDATION_STYLES = new Map([
    ["～0.3m未満", { color: "#d8f0fb", label: "0.3m未満" }],
    ["0.3m以上 ～ 0.5m未満", { color: "#b7def3", label: "0.3m以上 0.5m未満" }],
    ["0.5m以上 ～ 1m未満", { color: "#8fc7e8", label: "0.5m以上 1m未満" }],
    ["1m以上 ～ 3m未満", { color: "#5aa6d6", label: "1m以上 3m未満" }],
    ["3m以上 ～ 5m未満", { color: "#2f85c4", label: "3m以上 5m未満" }],
    ["5m以上 ～ 10m未満", { color: "#1765ad", label: "5m以上 10m未満" }],
    ["10m以上 ～ 20m未満", { color: "#0b3f82", label: "10m以上 20m未満" }]
  ]);

  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loadingText");
  const errorPanel = document.getElementById("errorPanel");
  const compactPortraitQuery = window.matchMedia("(max-width: 720px) and (orientation: portrait)");
  const municipalityScenarios = new Map();

  const map = L.map("map", {
    preferCanvas: true,
    zoomControl: true
  });

  map.fitBounds(INITIAL_VIEW_BOUNDS, { padding: [12, 12] });

  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
    maxZoom: 18
  }).addTo(map);

  const municipalityLayer = L.geoJSON(null, {
    style: {
      color: "#263f52",
      fillColor: "#ffffff",
      fillOpacity: 0.04,
      opacity: 0.95,
      weight: 1.4
    },
    onEachFeature(feature, layer) {
      const p = feature.properties || {};
      const municipalityName = getMunicipalityName(p);
      const scenario = getMunicipalityScenario(municipalityName);
      const scenarioRows = createScenarioRows(scenario);
      layer.bindPopup(createMunicipalityPopup(p, municipalityName, scenarioRows));
    }
  });

  const tsunamiKushiroLayer = createInundationLayer();
  const tsunamiNemuroLayer = createInundationLayer();

  const siteIcon = L.divIcon({
    className: "",
    html: '<span class="site-icon site-icon--marker" aria-hidden="true"></span>',
    iconAnchor: [9, 9],
    iconSize: [18, 18],
    popupAnchor: [0, -10]
  });

  const evacuationSitesLayer = L.geoJSON(null, {
    pointToLayer(feature, latlng) {
      return L.marker(latlng, { icon: siteIcon });
    },
    onEachFeature(feature, layer) {
      const p = feature.properties || {};
      layer.bindPopup(createPopup("津波対応の指定緊急避難場所", [
        ["施設・場所名", p["施設・場所名"] || "名称不明"],
        ["住所", p["住所"] || ""],
        ["津波", p["津波"] === "1" ? "対応" : p["津波"] || ""],
        ["指定避難所との住所同一", p["指定避難所との住所同一"] === "1" ? "同一" : ""],
        ["備考", p["備考"] || ""]
      ]));
    }
  });

  const evacuationClusterLayer = L.markerClusterGroup({
    disableClusteringAtZoom: 17,
    maxClusterRadius: 90,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  });

  const overlays = {
    "市町村": municipalityLayer,
    "避難場所（クラスタ表示）": evacuationClusterLayer,
    "釧路地域津波浸水域": tsunamiKushiroLayer,
    "根室地域津波浸水域": tsunamiNemuroLayer
  };

  L.control.layers({}, overlays, { collapsed: compactPortraitQuery.matches }).addTo(map);
  addLegend();
  loadInitialLayers();

  const tsunamiLayerConfigs = [
    {
      label: "釧路地域津波浸水域",
      url: DATASETS.tsunamiKushiro,
      layer: tsunamiKushiroLayer,
      loadPromise: null,
      loaded: false
    },
    {
      label: "根室地域津波浸水域",
      url: DATASETS.tsunamiNemuro,
      layer: tsunamiNemuroLayer,
      loadPromise: null,
      loaded: false
    }
  ];

  map.on("overlayadd", (event) => {
    const config = tsunamiLayerConfigs.find((item) => item.layer === event.layer);
    if (!config || config.loaded || config.loadPromise) {
      return;
    }
    loadInundationLayer(config);
  });

  async function loadInitialLayers() {
    showLoading("市町村と避難場所を読み込んでいます...");

    const results = await Promise.allSettled([
      loadMunicipalityLayer(),
      loadEvacuationLayer()
    ]);

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      showError("地図データの一部を読み込めませんでした。ファイルの配置やローカルサーバーの状態を確認してください。");
      failed.forEach((result) => console.error(result.reason));
    }

    map.fitBounds(INITIAL_VIEW_BOUNDS, { padding: [12, 12] });
    hideLoading();
  }

  async function loadInundationLayer(config) {
    showLoading(`${config.label}を読み込み中です...`);
    clearError();

    config.loadPromise = loadLayer(config.url, config.layer, false)
      .then(() => {
        config.loaded = true;
      })
      .catch((error) => {
        console.error(error);
        map.removeLayer(config.layer);
        showError(`${config.label}の読み込みに失敗しました。時間をおいて再読み込みしてください。`);
      })
      .finally(() => {
        config.loadPromise = null;
        hideLoading();
      });

    return config.loadPromise;
  }

  function createInundationLayer() {
    return L.geoJSON(null, {
      interactive: false,
      style(feature) {
        const rank = feature.properties && feature.properties.A40_003;
        const style = INUNDATION_STYLES.get(rank);
        const color = style ? style.color : "#6aaed6";
        return {
          color,
          fillColor: color,
          fillOpacity: 0.38,
          opacity: 0.55,
          weight: 0.5
        };
      }
    });
  }

  async function loadLayer(url, layer, addToMap) {
    const geojson = await fetchGeoJson(url);
    layer.addData(geojson);
    if (addToMap) {
      layer.addTo(map);
    }
  }

  async function loadMunicipalityLayer() {
    try {
      await loadMunicipalityScenarios();
    } catch (error) {
      console.warn("Municipality scenario CSV could not be loaded.", error);
    }

    return loadLayer(DATASETS.municipality, municipalityLayer, true);
  }

  async function loadEvacuationLayer() {
    const geojson = await fetchGeoJson(DATASETS.evacuation);
    evacuationSitesLayer.addData(geojson);
    evacuationClusterLayer.addLayer(evacuationSitesLayer);
    evacuationClusterLayer.addTo(map);
  }

  async function fetchGeoJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} を読み込めませんでした（HTTP ${response.status}）。`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new Error(`${url} のJSON解析に失敗しました。ファイルの文字コードや形式を確認してください。`);
    }
  }

  async function loadMunicipalityScenarios() {
    const response = await fetch(DATASETS.municipalityScenario);
    if (!response.ok) {
      throw new Error(`${DATASETS.municipalityScenario} could not be loaded: HTTP ${response.status}`);
    }

    const rows = parseCsv(await response.text());
    rows.forEach((row) => {
      const areaName = row.area_name;
      if (!areaName) {
        return;
      }
      addMunicipalityScenarioKey(areaName, row);
      addMunicipalityScenarioKey(createShiftJisMojibake(areaName), row);
    });
  }

  function addMunicipalityScenarioKey(key, row) {
    const normalized = normalizeKey(key);
    if (normalized) {
      municipalityScenarios.set(normalized, row);
    }
  }

  function parseCsv(text) {
    const records = [];
    let field = "";
    let record = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        record.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i += 1;
        }
        record.push(field);
        records.push(record);
        field = "";
        record = [];
      } else {
        field += char;
      }
    }

    if (field !== "" || record.length > 0) {
      record.push(field);
      records.push(record);
    }

    const headers = records.shift();
    if (!headers) {
      return [];
    }

    return records
      .filter((items) => items.some((item) => item.trim() !== ""))
      .map((items) => headers.reduce((row, header, index) => {
        row[header.trim()] = (items[index] || "").trim();
        return row;
      }, {}));
  }

  function createShiftJisMojibake(value) {
    if (!window.TextEncoder || !window.TextDecoder) {
      return "";
    }

    try {
      return new TextDecoder("shift_jis").decode(new TextEncoder().encode(value));
    } catch (error) {
      console.warn("Could not create mojibake key for municipality scenario.", error);
      return "";
    }
  }

  function normalizeKey(value) {
    return String(value || "").trim().replace(/\s+/g, "");
  }

  function getMunicipalityName(properties) {
    const candidates = [
      properties.area_name,
      properties.N03_004,
      properties.join_key,
      properties.municipality,
      properties.municipality_name,
      properties.city_name,
      properties.name,
      properties.NAME
    ];

    return candidates.find((value) => String(value || "").trim() !== "") || "";
  }

  function getMunicipalityScenario(municipalityName) {
    return municipalityScenarios.get(normalizeKey(municipalityName));
  }

  function createMunicipalityPopup(properties, municipalityName, scenarioRows) {
    return createPopup(municipalityName || "市町村", [
      ["市町村名", municipalityName],
      ["都道府県", properties.N03_001 || properties.pref_name || ""],
      ["振興局等", properties.N03_002 || ""],
      ["行政区域コード", properties.N03_007 || ""],
      ...scenarioRows
    ]);
  }

  function createScenarioRows(scenario) {
    if (!scenario) {
      return [];
    }

    return [
      ["想定震度", createSeismicIntensityDisplay(scenario.expected_shindo)],
      ["津波到達目安", scenario.tsunami_arrival_note],
      ["停電への備え目安", scenario.power_restore_est],
      ["学習メモ", scenario.learning_memo],
      ["出典", scenario.source_note]
    ];
  }

  function createSeismicIntensityDisplay(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const intensity = getSeismicIntensityMeta(text);
    if (!intensity) {
      return text;
    }

    return {
      html: [
        `<span class="seismic-value seismic-display">`,
        `<span class="seismic-badge ${intensity.className}" aria-label="${escapeHtml(text)}">${intensity.label}</span>`,
        `<span>${escapeHtml(text)}</span>`,
        `</span>`
      ].join(""),
      text
    };
  }

  function getSeismicIntensityMeta(value) {
    const normalized = String(value || "")
      .replace(/[－ー−―]/g, "-")
      .replace(/[＋]/g, "+")
      .replace(/\s+/g, "")
      .replace(/震度/g, "");

    if (/7/.test(normalized)) {
      return { label: "7", className: "intensity-7" };
    }

    if (/6(強|\+)/.test(normalized)) {
      return { label: "6+", className: "intensity-6p" };
    }

    if (/6(弱|-)/.test(normalized)) {
      return { label: "6&minus;", className: "intensity-6m" };
    }

    if (/5(強|\+)/.test(normalized)) {
      return { label: "5+", className: "intensity-5p" };
    }

    if (/5(弱|-)/.test(normalized)) {
      return { label: "5&minus;", className: "intensity-5m" };
    }

    return null;
  }

  function showLoading(message) {
    loading.classList.remove("is-hidden");
    loadingText.textContent = message;
  }

  function hideLoading() {
    loading.classList.add("is-hidden");
  }

  function showError(message) {
    errorPanel.hidden = false;
    errorPanel.innerHTML = `<strong>${escapeHtml(message)}</strong>`;
  }

  function clearError() {
    errorPanel.hidden = true;
    errorPanel.textContent = "";
  }

  function addLegend() {
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = [
        '<button class="legend-toggle" type="button" aria-expanded="false">凡例を開く</button>',
        '<div class="legend-content">',
        "<h2>凡例</h2>",
        '<p class="legend-note">防災学習用です。実際の避難判断は自治体などの最新情報を確認してください。</p>',
        '<div class="legend-row"><span class="legend-boundary" aria-hidden="true"></span><span class="legend-label">市町村の境界</span></div>',
        '<div class="legend-row"><span class="legend-swatch" style="background:#8fc7e8"></span><span class="legend-label">津波浸水域</span></div>',
        ...Array.from(INUNDATION_STYLES.values()).map(({ color, label }) => (
          `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span class="legend-label">${escapeHtml(label)}</span></div>`
        )),
        '<div class="legend-row"><span class="site-icon" aria-hidden="true"></span><span class="legend-label">津波避難場所</span></div>',
        '<div class="legend-row"><span class="legend-cluster" aria-hidden="true">10</span><span class="legend-label">避難場所クラスタ</span></div>',
        "</div>"
      ].join("");

      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      const toggle = div.querySelector(".legend-toggle");
      toggle.addEventListener("click", () => {
        const isOpen = div.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.textContent = isOpen ? "凡例を閉じる" : "凡例を開く";
      });

      return div;
    };
    legend.addTo(map);
  }

  function createPopup(title, rows) {
    const body = rows
      .filter(([, value]) => hasPopupValue(value))
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${formatPopupValue(value)}</td></tr>`)
      .join("");

    return [
      `<div class="popup-title">${escapeHtml(title)}</div>`,
      `<table class="popup-table">${body}</table>`
    ].join("");
  }

  function hasPopupValue(value) {
    if (value === undefined || value === null) {
      return false;
    }

    if (typeof value === "object" && value.html !== undefined) {
      return String(value.text || value.html).trim() !== "";
    }

    return String(value).trim() !== "";
  }

  function formatPopupValue(value) {
    if (value && typeof value === "object" && value.html !== undefined) {
      return value.html;
    }

    return escapeHtml(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}());
