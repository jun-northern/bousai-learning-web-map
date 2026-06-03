(function () {
  "use strict";

  const DATASETS = {
    municipality: "data/municipality.geojson",
    inundation: "data/tsunami_inundation_light.geojson",
    evacuation: "data/evacuation_sites_tsunami.geojson"
  };

  const INUNDATION_COLORS = new Map([
    ["～0.3m未満", "#d8f0fb"],
    ["0.3m以上 ～ 0.5m未満", "#b7def3"],
    ["0.5m以上 ～ 1m未満", "#8fc7e8"],
    ["1m以上 ～ 3m未満", "#5aa6d6"],
    ["3m以上 ～ 5m未満", "#2f85c4"],
    ["5m以上 ～ 10m未満", "#1765ad"],
    ["10m以上 ～ 20m未満", "#0b3f82"]
  ]);

  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loadingText");
  const errorPanel = document.getElementById("errorPanel");

  const map = L.map("map", {
    preferCanvas: true,
    zoomControl: true
  }).setView([43.2, 143.9], 7);

  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
    maxZoom: 18
  }).addTo(map);

  const municipalityLayer = L.geoJSON(null, {
    style: {
      color: "#475766",
      fillColor: "#ffffff",
      fillOpacity: 0.06,
      opacity: 0.8,
      weight: 1
    },
    onEachFeature(feature, layer) {
      const p = feature.properties || {};
      layer.bindPopup(createPopup("市町村", [
        ["市町村名", p.N03_004 || p.join_key || "不明"],
        ["都道府県", p.N03_001 || p.pref_name || ""],
        ["振興局等", p.N03_002 || ""],
        ["行政区域コード", p.N03_007 || ""]
      ]));
    }
  });

  const inundationLayer = L.geoJSON(null, {
    style(feature) {
      const rank = feature.properties && feature.properties.A40_003;
      return {
        color: INUNDATION_COLORS.get(rank) || "#6aaed6",
        fillColor: INUNDATION_COLORS.get(rank) || "#6aaed6",
        fillOpacity: 0.48,
        opacity: 0.65,
        weight: 0.6
      };
    }
  });

  const siteIcon = L.divIcon({
    className: "",
    html: '<span class="site-icon" aria-hidden="true"></span>',
    iconAnchor: [12, 24],
    iconSize: [24, 24],
    popupAnchor: [0, -22]
  });

  const evacuationLayer = L.geoJSON(null, {
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

  const overlays = {
    "市町村": municipalityLayer,
    "津波浸水域": inundationLayer,
    "津波対応の指定緊急避難場所": evacuationLayer
  };

  L.control.layers({}, overlays, { collapsed: false }).addTo(map);
  addLegend();
  loadInitialLayers();

  let inundationLoadPromise = null;
  let inundationLoaded = false;

  map.on("overlayadd", (event) => {
    if (event.layer !== inundationLayer || inundationLoaded || inundationLoadPromise) {
      return;
    }
    loadInundationLayer();
  });

  async function loadInitialLayers() {
    showLoading("市町村と避難場所を読み込んでいます...");

    const results = await Promise.allSettled([
      loadLayer(DATASETS.municipality, municipalityLayer, true),
      loadLayer(DATASETS.evacuation, evacuationLayer, true)
    ]);

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      showError("地図データの一部を読み込めませんでした。ファイルの配置やローカルサーバーの状態を確認してください。");
      failed.forEach((result) => console.error(result.reason));
    }

    fitToAvailableBounds([municipalityLayer, evacuationLayer]);
    hideLoading();
  }

  async function loadInundationLayer() {
    showLoading("津波浸水域を読み込み中です");
    clearError();

    inundationLoadPromise = loadLayer(DATASETS.inundation, inundationLayer, false)
      .then(() => {
        inundationLoaded = true;
        if (map.hasLayer(inundationLayer)) {
          fitToAvailableBounds([municipalityLayer, evacuationLayer, inundationLayer]);
        }
      })
      .catch((error) => {
        console.error(error);
        map.removeLayer(inundationLayer);
        showError("津波浸水域の読み込みに失敗しました。時間をおいて再読み込みしてください。");
      })
      .finally(() => {
        inundationLoadPromise = null;
        hideLoading();
      });

    return inundationLoadPromise;
  }

  async function loadLayer(url, layer, addToMap) {
    const geojson = await fetchGeoJson(url);
    layer.addData(geojson);
    if (addToMap) {
      layer.addTo(map);
    }
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

  function fitToAvailableBounds(layers) {
    const bounds = layers
      .filter((layer) => layer.getLayers().length > 0)
      .map((layer) => layer.getBounds())
      .filter((boundsItem) => boundsItem.isValid());

    if (!bounds.length) {
      return;
    }

    const merged = bounds.reduce((acc, boundsItem) => acc.extend(boundsItem), bounds[0]);
    map.fitBounds(merged, { padding: [24, 24], maxZoom: 12 });
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
        "<h2>津波浸水深</h2>",
        ...Array.from(INUNDATION_COLORS.entries()).map(([label, color]) => (
          `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span></div>`
        )),
        '<div class="legend-row"><span class="site-icon" aria-hidden="true"></span><span>避難場所</span></div>'
      ].join("");
      return div;
    };
    legend.addTo(map);
  }

  function createPopup(title, rows) {
    const body = rows
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
      .join("");

    return [
      `<div class="popup-title">${escapeHtml(title)}</div>`,
      `<table class="popup-table">${body}</table>`
    ].join("");
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
