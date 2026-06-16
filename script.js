const header = document.querySelector(".site-header");
const tagSnapshot = document.getElementById("tagSnapshot");

function syncHeaderShadow() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 8);
}

syncHeaderShadow();
window.addEventListener("scroll", syncHeaderShadow, { passive: true });

function fallbackSnapshot() {
  const nodes = [];
  const edges = [];
  const colors = ["#f2f2f2", "#95b8ff", "#f4c46d", "#78ddc4", "#d7a7ff", "#ff9e7d", "#b0b0b0"];
  for (let cluster = 0; cluster < colors.length; cluster += 1) {
    const angle = -Math.PI / 2 + cluster * (Math.PI * 2 / colors.length);
    const cx = Math.cos(angle) * 0.46;
    const cy = Math.sin(angle) * 0.4;
    const centerIndex = nodes.length;
    nodes.push({ i: centerIndex, t: "cluster", c: colors[cluster], x: cx, y: cy, r: 11 });
    for (let index = 0; index < 26; index += 1) {
      const dotAngle = index * 2.399 + cluster;
      const radius = 0.04 + (index % 9) * 0.011;
      const dotIndex = nodes.length;
      nodes.push({
        i: dotIndex,
        t: index % 5 === 0 ? "project" : "tag",
        c: colors[cluster],
        x: cx + Math.cos(dotAngle) * radius,
        y: cy + Math.sin(dotAngle) * radius,
        r: index % 5 === 0 ? 4.4 : 2.8
      });
      edges.push({ s: centerIndex, t: dotIndex });
    }
  }
  return { nodes, edges };
}

async function loadTagSnapshot() {
  if (!tagSnapshot) return fallbackSnapshot();
  try {
    const response = await fetch("assets/tag-cloud-snapshot.json", { cache: "no-store" });
    if (!response.ok) throw new Error("snapshot unavailable");
    return response.json();
  } catch {
    return fallbackSnapshot();
  }
}

function drawTagSnapshot(canvas, snapshot, timestamp) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const nodes = snapshot.nodes || [];
  const scale = Math.min(width, height) * 0.78;
  const offsetX = width * 0.66;
  const offsetY = height * 0.48;
  const angle = Math.sin(timestamp / 150000 * Math.PI * 2) * (Math.PI / 180 * 2.4);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  function point(node) {
    const x = node.x * cos - node.y * sin;
    const y = node.x * sin + node.y * cos;
    return { x: offsetX + x * scale, y: offsetY + y * scale };
  }

  ctx.lineWidth = 1;
  for (const edge of (snapshot.edges || []).slice(0, 1000)) {
    const source = nodes[edge.s];
    const target = nodes[edge.t];
    if (!source || !target) continue;
    const a = point(source);
    const b = point(target);
    ctx.strokeStyle = "rgba(236, 240, 234, 0.075)";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const node of nodes) {
    const p = point(node);
    const radius = Math.max(1.4, node.r * (node.t === "cluster" ? 0.42 : 0.34));
    ctx.globalAlpha = node.t === "cluster" ? 0.7 : 0.54;
    ctx.fillStyle = node.c || "#d7d7d2";
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

async function startTagSnapshot() {
  if (!tagSnapshot) return;
  const snapshot = await loadTagSnapshot();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  function frame(timestamp) {
    drawTagSnapshot(tagSnapshot, snapshot, reduceMotion ? 0 : timestamp);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}

startTagSnapshot();
