const state = {
  data: null,
  bars: [],
  strokes: [],
  start: 0,
  count: 220,
  hoverIndex: null,
  dragging: false,
  dragX: 0,
  dragStart: 0,
  dpr: window.devicePixelRatio || 1,
};

const canvas = document.getElementById("chart");
const wrap = document.getElementById("canvasWrap");
const tooltip = document.getElementById("tooltip");
const slider = document.getElementById("panSlider");
const details = document.getElementById("barDetails");

const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function num(value) {
  return Number.parseFloat(value || 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dateShort(time) {
  return time.slice(5, 16);
}

function byStroke(no) {
  return state.strokes.find((item) => item.strokeNo === no);
}

function markerColor(marker) {
  if (marker === "red") return "#dc2626";
  if (marker === "green") return "#16a34a";
  if (marker === "yellow") return "#f4c430";
  return null;
}

function priceOnStroke(bar, stroke) {
  if (!bar || !stroke || stroke.startIndex == null || stroke.endIndex == null) return null;
  const span = stroke.endIndex - stroke.startIndex;
  if (span === 0) return stroke.endPrice;
  const ratio = (bar.index - stroke.startIndex) / span;
  if (ratio < 0 || ratio > 1) return null;
  return stroke.startPrice + ratio * (stroke.endPrice - stroke.startPrice);
}

function visibleBars() {
  return state.bars.slice(state.start, state.start + state.count);
}

function canvasMetrics() {
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  const width = rect.width;
  const height = rect.height;
  return {
    width,
    height,
    dpr,
    left: 68,
    right: 78,
    top: 24,
    bottom: 42,
    volumeHeight: Math.max(92, height * 0.18),
    gap: 20,
  };
}

function draw() {
  if (!state.data) return;
  const m = canvasMetrics();
  const ctx = canvas.getContext("2d");
  ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
  ctx.clearRect(0, 0, m.width, m.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, m.width, m.height);

  const bars = visibleBars();
  if (!bars.length) return;

  const priceBottom = m.height - m.bottom - m.volumeHeight - m.gap;
  const priceTop = m.top;
  const volumeTop = priceBottom + m.gap;
  const volumeBottom = m.height - m.bottom;
  const plotWidth = m.width - m.left - m.right;
  const priceHeight = priceBottom - priceTop;
  const step = plotWidth / Math.max(1, bars.length - 1);
  const candleWidth = Math.max(2, Math.min(10, step * 0.62));
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  const pad = Math.max((high - low) * 0.06, 8);
  const yMax = high + pad;
  const yMin = low - pad;
  const maxVol = Math.max(...bars.map((b) => b.volume), 1);

  const xFor = (index) => m.left + (index - state.start) * step;
  const yFor = (price) => priceTop + ((yMax - price) / (yMax - yMin)) * priceHeight;

  ctx.strokeStyle = "#d8e0ea";
  ctx.lineWidth = 1;
  ctx.strokeRect(m.left, priceTop, plotWidth, priceHeight);
  ctx.strokeRect(m.left, volumeTop, plotWidth, volumeBottom - volumeTop);

  ctx.font = "12px Arial";
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "left";
  ctx.fillText("Price", m.left, 16);
  ctx.fillText("Volume", m.left, volumeTop - 7);

  ctx.strokeStyle = "#edf2f7";
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "right";
  for (let i = 0; i <= 6; i += 1) {
    const price = yMin + ((yMax - yMin) * i) / 6;
    const y = yFor(price);
    ctx.beginPath();
    ctx.moveTo(m.left, y);
    ctx.lineTo(m.width - m.right, y);
    ctx.stroke();
    ctx.fillText(fmt.format(price), m.width - 8, y + 4);
  }

  const dayMarks = [];
  let lastDay = "";
  bars.forEach((bar) => {
    const day = bar.time.slice(5, 10);
    if (day !== lastDay) {
      dayMarks.push(bar.index);
      lastDay = day;
    }
  });
  ctx.textAlign = "center";
  ctx.strokeStyle = "#f1f5f9";
  ctx.fillStyle = "#64748b";
  const skip = dayMarks.length > 14 ? 2 : 1;
  dayMarks.forEach((index, markNo) => {
    const x = xFor(index);
    ctx.beginPath();
    ctx.moveTo(x, priceTop);
    ctx.lineTo(x, volumeBottom);
    ctx.stroke();
    if (markNo % skip === 0) {
      ctx.fillText(state.bars[index].time.slice(5, 10), x, volumeBottom + 20);
    }
  });

  bars.forEach((bar) => {
    const x = xFor(bar.index);
    const up = bar.close >= bar.open;
    const color = up ? "#d62828" : "#148f4f";
    const yHigh = yFor(bar.high);
    const yLow = yFor(bar.low);
    const yOpen = yFor(bar.open);
    const yClose = yFor(bar.close);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();
    const bodyTop = Math.min(yOpen, yClose);
    const bodyBottom = Math.max(yOpen, yClose);
    if (bodyBottom - bodyTop < 1) {
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, 1);
    } else {
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyBottom - bodyTop);
    }

    const volHeight = (bar.volume / maxVol) * (volumeBottom - volumeTop);
    ctx.globalAlpha = 0.82;
    ctx.fillRect(x - candleWidth / 2, volumeBottom - volHeight, candleWidth, volHeight);
    ctx.globalAlpha = 1;
  });

  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  let started = false;
  state.strokes.forEach((stroke) => {
    const points = [
      [stroke.startIndex, stroke.startPrice],
      [stroke.endIndex, stroke.endPrice],
    ];
    points.forEach(([index, price]) => {
      if (index == null || index < state.start || index > state.start + state.count - 1) return;
      const x = xFor(index);
      const y = yFor(price);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
  });
  ctx.stroke();
  ctx.lineWidth = 1;

  bars.forEach((bar) => {
    const color = markerColor(bar.rsiMarker);
    if (!color) return;
    const stroke = byStroke(bar.strokeNo);
    const markerPrice = priceOnStroke(bar, stroke);
    if (markerPrice == null) return;
    const x = xFor(bar.index);
    const y = yFor(markerPrice);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.lineWidth = bar.rsiMarker === "red" ? 3 : 2.5;
    const radius = bar.rsiMarker === "red" ? 7 : bar.rsiMarker === "green" ? 6 : 5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });

  if (state.hoverIndex != null) {
    const bar = state.bars[state.hoverIndex];
    if (bar && bar.index >= state.start && bar.index < state.start + state.count) {
      const x = xFor(bar.index);
      const y = yFor(bar.close);
      ctx.strokeStyle = "#0f172a";
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(x, priceTop);
      ctx.lineTo(x, volumeBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.left, y);
      ctx.lineTo(m.width - m.right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0f172a";
      ctx.fillText(fmt.format(bar.close), m.width - 8, y - 6);
    }
  }
}

function updateSummary() {
  const summary = state.data.summary;
  document.getElementById("rangeLabel").textContent = `${summary.start_time} - ${summary.end_time}`;
  document.getElementById("updatedLabel").textContent = `网页数据生成：${state.data.updatedAt}`;
  document.getElementById("totalAmp").textContent = `${fmt.format(num(summary.total_space_points))} 点`;
  document.getElementById("strokeCount").textContent = `${summary.stroke_count} 笔`;
  document.getElementById("avgStroke").textContent = `${fmt.format(num(summary.avg_space_points))} 点`;
  document.getElementById("minStroke").textContent = `${fmt.format(num(summary.min_space_points))} 点`;
  document.getElementById("maxStroke").textContent = `${fmt.format(num(summary.max_space_points))} 点`;
  updateWindowInfo();
}

function updateWindowInfo() {
  const first = state.bars[state.start];
  const last = state.bars[Math.min(state.bars.length - 1, state.start + state.count - 1)];
  document.getElementById("windowInfo").textContent = first && last ? `${dateShort(first.time)} - ${dateShort(last.time)}` : "--";
}

function updateDetails(index) {
  const bar = state.bars[index];
  const slots = details.querySelectorAll("dd");
  if (!bar) {
    slots.forEach((slot) => {
      slot.textContent = "--";
    });
    return;
  }
  const stroke = byStroke(bar.strokeNo);
  slots[0].textContent = bar.time;
  slots[1].textContent = `O ${fmt.format(bar.open)} / H ${fmt.format(bar.high)} / L ${fmt.format(bar.low)} / C ${fmt.format(bar.close)}`;
  slots[2].textContent = `${fmt.format(bar.volume)}，持仓 ${fmt.format(bar.openInterest)}`;
  slots[3].textContent = `${fmt.format(bar.rsi6)}${bar.rsiMarker ? `，${bar.rsiMarker === "red" ? "红圈" : bar.rsiMarker === "green" ? "绿圈" : "黄圈"}` : ""}`;
  slots[4].textContent = stroke ? `第 ${stroke.strokeNo} 笔，${stroke.direction === "up" ? "向上" : "向下"}` : "未归属已确认一笔";
  slots[5].textContent = stroke ? `${dateShort(stroke.startTime)} -> ${dateShort(stroke.endTime)}` : "--";
  slots[6].textContent = stroke ? `${fmt.format(stroke.spacePoints)} 点，${pctFmt.format(stroke.spacePct)}%` : "--";
}

function showTooltip(index, clientX, clientY) {
  const bar = state.bars[index];
  if (!bar) return;
  const stroke = byStroke(bar.strokeNo);
  tooltip.hidden = false;
  tooltip.innerHTML = `
    <strong>${bar.time}</strong>
    <p>开 ${fmt.format(bar.open)}　高 ${fmt.format(bar.high)}　低 ${fmt.format(bar.low)}　收 ${fmt.format(bar.close)}</p>
    <p>RSI(6) ${fmt.format(bar.rsi6)}${bar.rsiMarker ? `　${bar.rsiMarker === "red" ? "红圈" : bar.rsiMarker === "green" ? "绿圈" : "黄圈"}` : ""}</p>
    <p>成交量 ${fmt.format(bar.volume)}　持仓 ${fmt.format(bar.openInterest)}</p>
    <p>${stroke ? `第 ${stroke.strokeNo} 笔 ${stroke.direction === "up" ? "向上" : "向下"}，振幅 ${fmt.format(stroke.spacePoints)} 点` : "未归属已确认一笔"}</p>
  `;
  const wrapRect = wrap.getBoundingClientRect();
  const left = clamp(clientX - wrapRect.left + 14, 10, wrapRect.width - tooltip.offsetWidth - 12);
  const top = clamp(clientY - wrapRect.top + 14, 10, wrapRect.height - tooltip.offsetHeight - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function indexFromEvent(event) {
  const m = canvasMetrics();
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const plotWidth = m.width - m.left - m.right;
  const rel = clamp(x - m.left, 0, plotWidth);
  const offset = Math.round((rel / plotWidth) * Math.max(1, state.count - 1));
  return clamp(state.start + offset, 0, state.bars.length - 1);
}

function setStart(value) {
  state.start = clamp(Math.round(value), 0, Math.max(0, state.bars.length - state.count));
  slider.value = String(state.start);
  updateWindowInfo();
  draw();
}

function setCount(nextCount, anchorIndex = state.start + Math.floor(state.count / 2)) {
  const oldCount = state.count;
  state.count = clamp(Math.round(nextCount), 36, state.bars.length);
  const ratio = oldCount ? (anchorIndex - state.start) / oldCount : 0.5;
  const nextStart = anchorIndex - ratio * state.count;
  slider.max = String(Math.max(0, state.bars.length - state.count));
  setStart(nextStart);
}

function bindEvents() {
  window.addEventListener("resize", draw);
  slider.addEventListener("input", () => setStart(Number(slider.value)));
  document.getElementById("zoomIn").addEventListener("click", () => setCount(state.count * 0.72));
  document.getElementById("zoomOut").addEventListener("click", () => setCount(state.count * 1.38));
  document.getElementById("resetView").addEventListener("click", () => {
    state.count = state.bars.length;
    slider.max = "0";
    setStart(0);
  });

  canvas.addEventListener("mousemove", (event) => {
    if (state.dragging) {
      const m = canvasMetrics();
      const dx = event.clientX - state.dragX;
      const plotWidth = m.width - m.left - m.right;
      const barsDelta = Math.round((-dx / plotWidth) * state.count);
      setStart(state.dragStart + barsDelta);
      return;
    }
    const index = indexFromEvent(event);
    state.hoverIndex = index;
    updateDetails(index);
    showTooltip(index, event.clientX, event.clientY);
    draw();
  });

  canvas.addEventListener("mouseleave", () => {
    if (!state.dragging) {
      tooltip.hidden = true;
      state.hoverIndex = null;
      draw();
    }
  });

  canvas.addEventListener("mousedown", (event) => {
    state.dragging = true;
    state.dragX = event.clientX;
    state.dragStart = state.start;
    wrap.style.cursor = "grabbing";
  });

  window.addEventListener("mouseup", () => {
    state.dragging = false;
    wrap.style.cursor = "crosshair";
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const anchor = indexFromEvent(event);
      const factor = event.deltaY < 0 ? 0.82 : 1.18;
      setCount(state.count * factor, anchor);
    },
    { passive: false },
  );
}

async function init() {
  if (window.IM2609_DATA) {
    state.data = window.IM2609_DATA;
  } else {
    const response = await fetch("./im2609-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`读取数据失败：${response.status}`);
    state.data = await response.json();
  }
  state.bars = state.data.bars;
  state.strokes = state.data.strokes;
  state.count = Math.min(260, state.bars.length);
  state.start = Math.max(0, state.bars.length - state.count);
  slider.max = String(Math.max(0, state.bars.length - state.count));
  slider.value = String(state.start);
  updateSummary();
  updateDetails(state.bars.length - 1);
  bindEvents();
  draw();
}

init().catch((error) => {
  wrap.innerHTML = `<div class="hint">网页数据读取失败：${error.message}</div>`;
});
