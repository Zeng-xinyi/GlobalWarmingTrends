/* --- START OF FILE temperature-map.js --- */

const MAP_WIDTH = 960;
const MAP_HEIGHT = 480;
const WORLD_TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const TEMPERATURE_DATA_URL = 'data/temperature_data.zip';

const projection = d3
  .geoEquirectangular()
  .scale(153)
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
const geoPath = d3.geoPath(projection);

// Color scale for temperature
const colorScale = d3.scaleSequential(d3.interpolateInferno)
  .domain([230, 310]);

const revealedCountries = new Set();
let tooltip, overlayLayer, heatmapSvg;

// --- 修改部分：数据变量 ---
let allTemperatureData = null; // 存放温度字典: { "2015-01-01": [240, 242...], ... }
let screenCoords = [];         // 存放预计算的屏幕坐标: [{x:100, y:200}, ...]
let timePoints = [];
// -----------------------



async function init() {
  try {
    const [worldTopo] = await Promise.all([
      d3.json(WORLD_TOPOJSON_URL)
    ]);

    const countries = topojson.feature(worldTopo, worldTopo.objects.countries);

    setupLayers();
    renderCountries(countries);
    addLegend();
    setupTooltip();

    await loadTemperatureData();

    console.log('Map initialized');
  } catch (err) {
    console.error('Failed to initialize map:', err);
    document.getElementById('map').innerHTML = 
      '<p style="color: red; padding: 2rem;">Failed to load map data.</p>';
  }
}

// Load and parse temperature data from zip
async function loadTemperatureData() {
  try {
    document.getElementById('current-time-display').textContent = 'Loading...';
    
    const response = await fetch(TEMPERATURE_DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    
    const jsonFile = zip.file("temperature_data.json")
    
    if (!jsonFile) {
      throw new Error("Data file not found in zip");
    }
    
    const jsonString = await jsonFile.async("string");
    const parsedData = JSON.parse(jsonString);
    

    const rawCoords = parsedData.coords; 
    screenCoords = rawCoords.map(d => {
      const p = projection(d);

      return p ? { x: p[0], y: p[1] } : null;
    });


    allTemperatureData = parsedData.temperatures || parsedData.data;
    

    
    timePoints = Object.keys(allTemperatureData).sort();
    
    const slider = document.getElementById('time-slider');
    slider.max = timePoints.length - 1;
    slider.value = 0;

    slider.oninput = function() {
        window.requestAnimationFrame(() => {
            renderHeatmap(+this.value);
        });
    };
    
    renderHeatmap(0);
    
    console.log("Temperature data loaded successfully.");
  } catch (error) {
    console.error("Error loading temperature data:", error);
    document.getElementById('current-time-display').textContent = 'Failed to load data';
  }
}

// Render heatmap for a given time index
function renderHeatmap(timeIndex) {
  const currentTime = timePoints[timeIndex];
  document.getElementById('current-time-display').textContent = currentTime;
  
  const currentTemps = allTemperatureData[currentTime];
  

  const renderData = [];
  for (let i = 0; i < screenCoords.length; i++) {
      if (screenCoords[i]) {
          renderData.push({
              x: screenCoords[i].x,
              y: screenCoords[i].y,
              val: currentTemps[i]
          });
      }
  }
  // -----------------------
  
  const circles = heatmapSvg.selectAll(".data-point")
    .data(renderData); // 移除key函数以提高速度
  
  circles.exit().remove();
  
  // Enter + Update
  circles.enter()
    .append("circle")
    .attr("class", "data-point")
    .attr("r", 3)
    .attr("stroke", "none")
    .merge(circles)
    .attr("cx", d => d.x) // 直接使用预计算的X
    .attr("cy", d => d.y) // 直接使用预计算的Y
    .attr("fill", d => colorScale(d.val));
}

function setupLayers() {
  heatmapSvg = d3
    .select('#map')
    .append('svg')
    .attr('id', 'heatmap-svg')
    .attr('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  overlayLayer = d3
    .select('#map')
    .append('svg')
    .attr('id', 'overlay-layer')
    .attr('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
}

function renderCountries(countries) {
  const defs = overlayLayer.append('defs');
  const clipPath = defs.append('clipPath').attr('id', 'sphere-clip');
  clipPath
    .append('path')
    .datum({ type: 'Sphere' })
    .attr('d', geoPath);
  
  const mask = defs.append('mask').attr('id', 'ocean-mask');
  
  mask.append('path')
    .datum({ type: 'Sphere' })
    .attr('d', geoPath)
    .attr('fill', 'white');
  
  mask.selectAll('path.country-mask')
    .data(countries.features)
    .join('path')
    .attr('class', 'country-mask')
    .attr('d', geoPath)
    .attr('fill', 'black');
  
  const oceanGroup = overlayLayer.append('g').attr('class', 'ocean-group');
  oceanGroup
    .append('path')
    .datum({ type: 'Sphere' })
    .attr('class', 'ocean-background')
    .attr('d', geoPath)
    .attr('mask', 'url(#ocean-mask)')
    .style('fill', '#a8d8ea')
    .style('pointer-events', 'none');
  
  const countryMasks = overlayLayer.append('g').attr('class', 'country-masks');
  countryMasks
    .selectAll('path.country')
    .data(countries.features)
    .join('path')
    .attr('class', 'country')
    .attr('d', geoPath)
    .on('mouseenter', handleMouseEnter)
    .on('mouseleave', handleMouseLeave)
    .on('click', handleClick);
  
  const countryBorders = overlayLayer.append('g').attr('class', 'country-borders');
  countryBorders
    .selectAll('path.country-border')
    .data(countries.features)
    .join('path')
    .attr('class', 'country-border')
    .attr('d', geoPath)
    .style('fill', 'none')
    .style('stroke', '#94a3b8')
    .style('stroke-width', '0.5px')
    .style('pointer-events', 'none');
}

function handleMouseEnter(event, feature) {
  const countryId = getCountryId(feature);
  const countryName = getCountryName(feature);

  tooltip
    .style('opacity', 1)
    .html(`<strong>${countryName}</strong><br/>Click to toggle mask`);

  if (!revealedCountries.has(countryId)) {
    d3.select(event.target).classed('country--hover', true);
  }
}

function handleMouseLeave(event, feature) {
  const countryId = getCountryId(feature);

  tooltip.style('opacity', 0);

  if (!revealedCountries.has(countryId)) {
    d3.select(event.target).classed('country--hover', false);
  }
}

function handleClick(event, feature) {
  const countryId = getCountryId(feature);
  const countryName = getCountryName(feature);
  const element = d3.select(event.target);

  if (revealedCountries.has(countryId)) {
    revealedCountries.delete(countryId);
    element.classed('country--revealed', false);
    removeFromSelectionList(countryId);
  } else {
    revealedCountries.add(countryId);
    element.classed('country--revealed', true);
    addToSelectionList(countryId, countryName);
  }
  
  updateBorderStyle(countryId, revealedCountries.has(countryId));
}

function addToSelectionList(id, name) {
  const list = document.getElementById('selection-list');
  const item = document.createElement('li');
  item.className = 'selection-list__item';
  item.dataset.countryId = id;
  item.innerHTML = `
    <span>${name}</span>
    <button onclick="removeCountry('${id}')" style="background:none;border:none;cursor:pointer;color:#ef4444;">✕</button>
  `;
  list.appendChild(item);
}

function removeFromSelectionList(id) {
  const item = document.querySelector(`li[data-country-id="${id}"]`);
  if (item) {
    item.remove();
  }
}

function updateBorderStyle(countryId, isRevealed) {
  overlayLayer
    .select('.country-borders')
    .selectAll('path.country-border')
    .filter(d => getCountryId(d) === countryId)
    .style('stroke', isRevealed ? '#3b82f6' : '#94a3b8')
    .style('stroke-width', isRevealed ? '1.2px' : '0.5px');
}

window.removeCountry = function(id) {
  revealedCountries.delete(id);

  overlayLayer
    .select('.country-masks')
    .selectAll('path.country')
    .filter(d => getCountryId(d) === id)
    .classed('country--revealed', false)
    .classed('country--hover', false); 

  updateBorderStyle(id, false);

  removeFromSelectionList(id);

  updateMapVisuals();
};

function updateMapVisuals() {
  overlayLayer
    .selectAll('path.country')
    .classed('country--revealed', d => revealedCountries.has(getCountryId(d)))
    .classed('country--hover', false);
}

function setupTooltip() {
  tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('position', 'absolute')
    .style('opacity', 0);

  overlayLayer.on('mousemove', event => {
    tooltip
      .style('left', `${event.pageX + 12}px`)
      .style('top', `${event.pageY - 8}px`);
  });
}

function addLegend() {
  const mapWrapper = document.querySelector('.map-wrapper');
  const legend = document.createElement('div');
  legend.className = 'legend';
  
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 200, 0);

  const infernoColors = [
    { stop: 0, color: '#000004' },
    { stop: 0.25, color: '#57106e' },
    { stop: 0.5, color: '#bc3754' },
    { stop: 0.75, color: '#f98e09' },
    { stop: 1, color: '#fcffa4' }
  ];
  infernoColors.forEach(c => gradient.addColorStop(c.stop, c.color));
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 200, 20);
  
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(0, 0, 200, 20);
  
  const labelDiv = document.createElement('div');
  labelDiv.style.display = 'flex';
  labelDiv.style.justifyContent = 'space-between';
  labelDiv.style.width = '200px';
  labelDiv.style.fontSize = '0.75rem';
  labelDiv.style.color = '#475569';
  labelDiv.style.marginTop = '4px';
  labelDiv.innerHTML = '<span>230K (-43C)</span><span>310K (37C)</span>';
  
  const container = document.createElement('div');
  container.appendChild(canvas);
  container.appendChild(labelDiv);
  legend.appendChild(container);
  
  mapWrapper.appendChild(legend);
}

function getCountryId(feature) {
  return (
    feature.properties?.iso_a3 ||
    feature.properties?.adm0_a3 ||
    feature.id ||
    String(feature.properties?.name || 'unknown')
  );
}

function getCountryName(feature) {
  return feature.properties?.name || 'Unknown';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}