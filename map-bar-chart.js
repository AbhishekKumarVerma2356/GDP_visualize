const svg = d3.select("#map");
const width = 960;
const height = 550;
const projection = d3
  .geoNaturalEarth1()
  .scale(160)
  .translate([width / 2, height / 2]);
const path = d3.geoPath().projection(projection);
const tooltip = d3.select("#tooltip");
const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
let worldData,
  dataByYear = {},
  currentMetric = "gdpPerCapita",
  currentYear = 2022;

const formatValue = (d) => {
  if (currentMetric === "gdp") {
    return d > 1e12
      ? `$${(d / 1e12).toFixed(2)}T`
      : d > 1e9
      ? `$${(d / 1e9).toFixed(1)}B`
      : `$${Math.round(d)}`;
  } else if (currentMetric === "population") {
    return d > 1e9
      ? `${(d / 1e9).toFixed(2)}B`
      : d > 1e6
      ? `${(d / 1e6).toFixed(1)}M`
      : d.toLocaleString();
  } else {
    return `$${Math.round(d).toLocaleString()}`;
  }
};

const metricLabel = (metric) =>
  ({
    gdp: "Total GDP",
    population: "Population",
    gdpPerCapita: "GDP per Capita",
  }[metric]);

function updateMap() {
  const yearData = dataByYear[currentYear];
  const values = Object.values(yearData)
    .map((d) => d[currentMetric])
    .filter((v) => v > 0);
  if (values.length === 0) return;

  const [minVal, maxVal] = d3.extent(values);
  colorScale.domain([minVal, maxVal]);

  svg
    .selectAll("path")
    .data(worldData.features)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("fill", (d) => {
      const code = d.id;
      const value = yearData[code]?.[currentMetric];
      return value ? colorScale(value) : "#ddd";
    })
    .on("mouseover", (event, d) => {
      const code = d.id;
      const entry = yearData[code];
      if (!entry || entry[currentMetric] == null) return;
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${d.properties.name}</strong><br>${metricLabel(
            currentMetric
          )}: ${formatValue(entry[currentMetric])}`
        );
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 30 + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0));

  renderBarChart();
}

Promise.all([
  d3.json(
    "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"
  ),
  d3.json("merged_gdp_pop.json"),
]).then(([geojson, dataset]) => {
  worldData = geojson;
  dataset.forEach((d) => {
    if (!dataByYear[d.year]) dataByYear[d.year] = {};
    dataByYear[d.year][d.code] = d;
  });

  // Populate Select2 for custom countries
  const uniqueCountries = Array.from(
    new Map(dataset.map((d) => [d.code, d.country]))
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const selectData = uniqueCountries.map(([code, name]) => ({
    id: code,
    text: `${code} - ${name}`,
  }));

  $("#customInput").select2({
    data: selectData,
    placeholder: "Select up to 5 countries",
    maximumSelectionLength: 5,
    width: "100%",
  });

  // Populate trend year dropdown
  const years = Array.from(new Set(dataset.map((d) => d.year))).sort(
    (a, b) => a - b
  );
  d3.select("#trendYear")
    .selectAll("option")
    .data(years)
    .enter()
    .append("option")
    .attr("value", (d) => d)
    .text((d) => d);

  updateMap();
});

d3.select("#metric").on("change", function () {
  currentMetric = this.value;
  updateMap();
});
d3.select("#year").on("input", function () {
  currentYear = +this.value;
  d3.select("#yearLabel").text(currentYear);
  updateMap();
});
d3.select("#barType").on("change", function () {
  const val = this.value;
  d3.select("#customCountries").classed("d-none", val !== "custom");
  renderBarChart();
});
$("#customInput").on("change", renderBarChart);

// Year change in trend chart
d3.select("#trendYear").on("change", function () {
  const selectedYear = +this.value;
  const code = d3.select("#trendChart").attr("data-country-code");
  if (code) {
    drawTrend(code, selectedYear);
    drawTrendGdpCap(code, selectedYear);
  }
});

const barSvg = d3.select("#barChart"),
  barMargin = { top: 30, right: 150, bottom: 50, left: 150 },
  barWidth = +barSvg.attr("width") - barMargin.left - barMargin.right,
  barHeight = +barSvg.attr("height") - barMargin.top - barMargin.bottom,
  barG = barSvg
    .append("g")
    .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

function renderBarChart() {
  const yearData = dataByYear[currentYear];
  let entries = Object.entries(yearData).map(([code, d]) => ({ ...d }));

  const mode = d3.select("#barType").property("value");
  if (mode === "top") {
    entries = entries
      .filter((d) => d.gdp)
      .sort((a, b) => b.gdp - a.gdp)
      .slice(0, 5);
  } else if (mode === "bottom") {
    entries = entries
      .filter((d) => d.gdp)
      .sort((a, b) => a.gdp - b.gdp)
      .slice(0, 5);
  } else {
    const input = $("#customInput").val() || [];
    entries = entries.filter((d) => input.includes(d.code)).slice(0, 5);
  }

  barG.selectAll("*").remove();
  const x = d3
    .scaleBand()
    .domain(entries.map((d) => d.country))
    .range([0, barWidth])
    .padding(0.2);
  const yLeft = d3
    .scaleLinear()
    .domain([0, d3.max(entries, (d) => d.population)])
    .nice()
    .range([barHeight, 0]);
  const yRight = d3
    .scaleLinear()
    .domain([0, d3.max(entries, (d) => d.gdp)])
    .nice()
    .range([barHeight, 0]);

  barG
    .append("g")
    .attr("transform", `translate(0,${barHeight})`)
    .call(d3.axisBottom(x));
  barG.append("g").call(d3.axisLeft(yLeft));
  barG
    .append("g")
    .attr("transform", `translate(${barWidth},0)`)
    .call(d3.axisRight(yRight));

  barG
    .append("text")
    .attr("x", barWidth / 2)
    .attr("y", barHeight + 40)
    .attr("text-anchor", "middle")
    .text("Countries");

  barG
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -80)
    .attr("x", -barHeight / 2)
    .attr("text-anchor", "middle")
    .text("Population");

  barG
    .append("text")
    .attr(
      "transform",
      `translate(${barWidth + 120}, ${barHeight / 2}) rotate(-90)`
    )
    .attr("text-anchor", "middle")
    .text("GDP (USD)");

  const barWidthHalf = x.bandwidth() / 2;
  barG
    .selectAll(".bar-pop")
    .data(entries)
    .enter()
    .append("rect")
    .attr("x", (d) => x(d.country))
    .attr("y", (d) => yLeft(d.population))
    .attr("width", barWidthHalf - 5)
    .attr("height", (d) => barHeight - yLeft(d.population))
    .attr("fill", "#69b3a2")
    .on("click", (event, d) => showTrend(d.code, currentYear, d.country))
    .append("title")
    .text(
      (d) =>
        `Population: ${Math.round(
          d.population
        )} \nGDP per Capital: $${Math.round(d.gdpPerCapita)}`
    );

  barG
    .selectAll(".bar-gdp")
    .data(entries)
    .enter()
    .append("rect")
    .attr("x", (d) => x(d.country) + barWidthHalf)
    .attr("y", (d) => yRight(d.gdp))
    .attr("width", barWidthHalf - 5)
    .attr("height", (d) => barHeight - yRight(d.gdp))
    .attr("fill", "#4a90e2")
    .on("click", (event, d) => showTrend(d.code, currentYear, d.country))
    .append("title")
    .text(
      (d) =>
        `GDP: $${Math.round(d.gdp)} \nGDP per Capital: $${Math.round(
          d.gdpPerCapita
        )}`
    );
}

function showTrend(code, year = currentYear, countryName = "") {
  d3.select("#trendYear").property("value", year);
  d3.select("#trendChartGDPpCap").property("value", year);
  drawTrend(code, year, countryName);
  drawTrendGdpCap(code, year, countryName);

  // Show modal only once
  const modal = new bootstrap.Modal(document.getElementById("trendModal"));
  modal.show();
}

function drawTrend(code, year, countryName = "") {
  d3.select(".modal-title").text(`5-Year Trend - ${countryName}`);
  const allYears = Object.keys(dataByYear)
    .map(Number)
    .sort((a, b) => a - b);
  const validYears = allYears.filter((y) => y <= year).slice(-5);
  const data = validYears.map((y) => {
    const d = dataByYear[y]?.[code];
    return { year: y, population: d?.population || 0, gdp: d?.gdp || 0 };
  });

  const svg = d3.select("#trendChart");
  svg.selectAll("*").remove();
  svg.attr("data-country-code", code);

  const margin = { top: 30, right: 120, bottom: 50, left: 120 },
    w = +svg.attr("width") - margin.left - margin.right,
    h = +svg.attr("height") - margin.top - margin.bottom,
    g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.year))
    .range([0, w])
    .padding(0.1);
  const yLeft = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.population)])
    .nice()
    .range([h, 0]);
  const yRight = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.gdp)])
    .nice()
    .range([h, 0]);

  g.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));
  g.append("g").call(d3.axisLeft(yLeft));
  g.append("g")
    .attr("transform", `translate(${w},0)`)
    .call(d3.axisRight(yRight));

  g.append("text")
    .attr("x", w / 2)
    .attr("y", h + 40)
    .attr("text-anchor", "middle")
    .text("Year");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -80)
    .attr("x", -h / 2)
    .attr("text-anchor", "middle")
    .text("Population");
  g.append("text")
    .attr("transform", `translate(${w + 120}, ${h / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text("GDP (USD)");

  const linePop = d3
    .line()
    .x((d) => x(d.year) + x.bandwidth() / 2)
    .y((d) => yLeft(d.population));
  const lineGdp = d3
    .line()
    .x((d) => x(d.year) + x.bandwidth() / 2)
    .y((d) => yRight(d.gdp));

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#69b3a2")
    .attr("stroke-width", 2)
    .attr("d", linePop);
  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#4a90e2")
    .attr("stroke-width", 2)
    .attr("d", lineGdp);

  const trendTooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  g.selectAll(".circle-pop")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.year) + x.bandwidth() / 2)
    .attr("cy", (d) => yLeft(d.population))
    .attr("r", 4)
    .attr("fill", "#69b3a2")
    .on("mouseover", (event, d) => {
      trendTooltip
        .style("opacity", 1)
        .html(
          `Year: ${d.year}<br>Population: ${d.population.toLocaleString()}`
        );
    })
    .on("mousemove", (event) => {
      trendTooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 30 + "px");
    })
    .on("mouseout", () => trendTooltip.style("opacity", 0));

  g.selectAll(".circle-gdp")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.year) + x.bandwidth() / 2)
    .attr("cy", (d) => yRight(d.gdp))
    .attr("r", 4)
    .attr("fill", "#4a90e2")
    .on("mouseover", (event, d) => {
      trendTooltip
        .style("opacity", 1)
        .html(`Year: ${d.year}<br>GDP: $${Math.round(d.gdp).toLocaleString()}`);
    })
    .on("mousemove", (event) => {
      trendTooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 30 + "px");
    })
    .on("mouseout", () => trendTooltip.style("opacity", 0));
}

function drawTrendGdpCap(code, year, countryName = "") {
  // d3.select(".modal-title").text(`5-Year Trend - ${countryName}`);
  const allYears = Object.keys(dataByYear)
    .map(Number)
    .sort((a, b) => a - b);
  const validYears = allYears.filter((y) => y <= year).slice(-5);
  const data = validYears.map((y) => {
    const d = dataByYear[y]?.[code];
    return { year: y, gdpPerCapita: d?.gdpPerCapita || 0 };
  });

  const svg = d3.select("#trendChartGDPpCap");
  svg.selectAll("*").remove();
  svg.attr("data-country-code", code);

  const margin = { top: 30, right: 50, bottom: 50, left: 100 },
    w = +svg.attr("width") - margin.left - margin.right,
    h = +svg.attr("height") - margin.top - margin.bottom,
    g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.year))
    .range([0, w])
    .padding(0.1);
  const yLeft = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.gdpPerCapita)])
    .nice()
    .range([h, 0]);

  g.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));
  g.append("g").call(d3.axisLeft(yLeft));

  g.append("text")
    .attr("x", w / 2)
    .attr("y", h + 40)
    .attr("text-anchor", "middle")
    .text("Year");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -50)
    .attr("x", -h / 2)
    .attr("text-anchor", "middle")
    .text("GDP per Cap (USD)");

  const lineGdpCap = d3
    .line()
    .x((d) => x(d.year) + x.bandwidth() / 2)
    .y((d) => yLeft(d.gdpPerCapita));

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#e2724aff")
    .attr("stroke-width", 2)
    .attr("d", lineGdpCap);

  const trendTooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  g.selectAll(".circle-pop")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.year) + x.bandwidth() / 2)
    .attr("cy", (d) => yLeft(d.gdpPerCapita))
    .attr("r", 4)
    .attr("fill", "#e2724aff")
    .on("mouseover", (event, d) => {
      trendTooltip
        .style("opacity", 1)
        .html(`Year: ${d.year}<br>GDP per Captial :${d.gdpPerCapita} $`);
    })
    .on("mousemove", (event) => {
      trendTooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 30 + "px");
    })
    .on("mouseout", () => trendTooltip.style("opacity", 0));
}
