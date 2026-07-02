/* ============================================================
   Bolos da Bru — gestão de vendas de bolo no pote
   Balcão, delivery e encomendas; dados em localStorage.
   ============================================================ */
"use strict";

/* ---------- Utilitários ---------- */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtMoney = (v) => BRL.format(v);
const fmtInt = (v) => v.toLocaleString("pt-BR");

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function uid() {
  return (crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO() { return toISODate(new Date()); }
function parseISODate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDateBR(iso) {
  const d = parseISODate(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDateShort(iso) {
  const d = parseISODate(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/* Criação de DOM segura: nomes de produtos/promoções entram sempre
   como texto, nunca como HTML. */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/* Conjunto de ícones vetoriais (line icons) no estilo traço fino. Herdam a cor
   via `currentColor`, então funcionam nos temas claro e escuro sem ajuste. As
   marcações são constantes (sem dados do usuário), montadas com DOMParser para
   garantir o namespace SVG correto. */
const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3"/>',
  package: '<path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  alert: '<path d="M12 4 3 19h18z"/><path d="M12 10v4M12 17h.01"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5"/>',
  tag: '<path d="M3.5 11.5v-7a1 1 0 0 1 1-1h7l9 9-8 8-9-9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  cart: '<circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/><path d="M2 3h3l2.2 12h11l1.8-8H6.2"/>',
  archive: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5.5 8.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8.5M10 12.5h4"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/>',
  truck: '<path d="M3 6.5h11v8.5H3zM14 10h3.5l3 3v2H14z"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5-5.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16 5a3.5 3.5 0 0 1 0 6M21.5 20c0-2.7-1.1-4.4-2.8-5.2"/>',
  message: '<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6H9z"/><path d="M9 11h6M9 14.5h6"/>',
  cloud: '<path d="M7.5 18.5a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.6 1.4A3.8 3.8 0 0 1 17 18.5z"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  store: '<path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3.5 10 5 4.5h14L20.5 10M9.5 20v-5.5h5V20"/>',
  cupcake: '<path d="M5.5 11h13l-1.5 8.5a1 1 0 0 1-1 .5H8a1 1 0 0 1-1-.5z"/><path d="M6 11a4 4 0 0 1 .6-7.4A4 4 0 0 1 12 2.5a4 4 0 0 1 5.4 1.1A4 4 0 0 1 18 11z"/>',
  cake: '<path d="M4 21h16"/><path d="M5.5 21v-7h13v7"/><path d="M5.5 14v-2.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V14"/><path d="M12 9.5V6.5"/><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/>',
};

function icon(name, cls = "icon") {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"`
    + ` stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
    + ` class="${cls}" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return document.importNode(
    new DOMParser().parseFromString(markup, "image/svg+xml").documentElement, true);
}

/* Cores de recheio por sabor — usadas para "pintar" a ilustração do pote.
   O nome do produto só é usado para escolher a paleta (nunca injetado no SVG). */
function flavorColors(name) {
  const n = (name || "").toLowerCase();
  const has = (...w) => w.some((x) => n.includes(x));
  if (has("red velvet", "velvet")) return { fill: "#b1304a", cream: "#f6e7d8" };
  if (has("morango")) return { fill: "#e0567f", cream: "#f7ead2" };
  if (has("nutella", "ninho")) return { fill: "#6f4326", cream: "#f6ead0" };
  if (has("chocolate", "brigadeiro", "prestígio", "prestigio")) return { fill: "#5a3826", cream: "#f3e6cd" };
  if (has("cenoura")) return { fill: "#d0812f", cream: "#5a3826" };
  if (has("maracujá", "maracuja", "limão", "limao", "abacaxi")) return { fill: "#f0c24a", cream: "#f7eed6" };
  if (has("coco", "leite")) return { fill: "#efe6d2", cream: "#c8a06a" };
  return { fill: "#c17a3c", cream: "#f5e6c8" };
}

let artUid = 0;
/* Ilustração de "bolo no pote": um pote de vidro com camadas na cor do sabor,
   um brilho no vidro e uma cereja. Vale como foto do produto sem depender de
   imagens externas. */
function productArtwork(name) {
  const { fill, cream } = flavorColors(name);
  const id = "jar" + (++artUid);
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-hidden="true">
      <defs><clipPath id="${id}"><rect x="21" y="27" width="38" height="39" rx="9"/></clipPath></defs>
      <rect x="26" y="12" width="28" height="9" rx="3" fill="#cbb089"/>
      <rect x="23" y="20" width="34" height="7" rx="3" fill="#e3d1aa"/>
      <rect x="21" y="27" width="38" height="39" rx="9" fill="#fbf7ee"/>
      <g clip-path="url(#${id})">
        <rect x="21" y="27" width="38" height="39" fill="${fill}"/>
        <rect x="21" y="44" width="38" height="8" fill="${cream}"/>
        <rect x="21" y="27" width="38" height="11" fill="${cream}"/>
        <path d="M21 40 q9 6 19 0 q10 -6 19 0 v-14 h-38 z" fill="${cream}"/>
      </g>
      <rect x="21" y="27" width="38" height="39" rx="9" fill="none" stroke="rgba(64,42,31,0.20)" stroke-width="1.5"/>
      <rect x="26" y="32" width="3.5" height="28" rx="1.75" fill="rgba(255,255,255,0.5)"/>
      <circle cx="40" cy="25" r="3.4" fill="#c0293f"/>
      <path d="M40 22 q2 -3 4 -3" fill="none" stroke="#3f7d3a" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  return document.importNode(
    new DOMParser().parseFromString(markup, "image/svg+xml").documentElement, true);
}

/* Redimensiona e comprime uma foto enviada, para caber no localStorage.
   Reduz para no máximo `maxDim` px no maior lado e exporta como JPEG. */
function processImage(file, maxDim, cb) {
  const reader = new FileReader();
  reader.onerror = () => cb(null);
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => cb(null);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      try { cb(canvas.toDataURL("image/jpeg", 0.82)); } catch { cb(null); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- Máscara de moeda (Real brasileiro) ----------
   Trata o que é digitado como centavos: "1500" vira "15,00". Todos os campos
   R$ usam type="text" e são lidos por readMoney(). */
function formatMoneyDigits(raw) {
  let digits = String(raw).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  while (digits.length < 3) digits = "0" + digits;
  const cents = digits.slice(-2);
  const intPart = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intPart},${cents}`;
}
function readMoney(input) {
  const digits = String(input.value).replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}
function setMoney(input, value) {
  input.value = formatMoneyDigits(Math.round((Number(value) || 0) * 100).toString());
}
function attachMoneyMask(input) {
  input.addEventListener("input", () => {
    if (input.dataset.money === "off") return; // desligado (ex.: promoção em %)
    const pos = input.value.length - input.selectionStart;
    input.value = formatMoneyDigits(input.value);
    const caret = Math.max(0, input.value.length - pos);
    try { input.setSelectionRange(caret, caret); } catch { /* ignora */ }
  });
  input.addEventListener("blur", () => {
    if (input.dataset.money !== "off" && input.value) input.value = formatMoneyDigits(input.value);
  });
}

/* ---------- Máscara de telefone (padrão brasileiro, 10 ou 11 dígitos) ----------
   Formata como (XX) XXXXX-XXXX e limita a 11 dígitos (DDD + número). */
function formatPhone(raw) {
  const d = String(raw).replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function attachPhoneMask(input) {
  input.addEventListener("input", () => { input.value = formatPhone(input.value); });
}

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- Persistência ---------- */

const STORE_KEY = "bolosdabru-v1";
const SESSION_KEY = "bolosdabru-session";

const CHANNEL_LABELS = { balcao: "Balcão", delivery: "Delivery", encomenda: "Encomenda" };

/* Perfis de acesso. IMPORTANTE: este login é do lado do cliente (front-end),
   pensado para separar a vitrine do cliente do painel da administradora e
   demonstrar controle de permissões. Não é segurança real — para isso é
   preciso um servidor com autenticação (ver roteiro na aba Dicas). */
const ACCOUNTS = {
  admin: { password: "bru2024", role: "admin", name: "Bru · Administradora" },
  cliente: { password: "cliente123", role: "cliente", name: "Cliente (visitante)" },
};
let currentRole = null;

const db = {
  products: [],
  sales: [],
  promos: [],
  subscribers: [],
  settings: { whatsapp: "" },
};

function saveDB() {
  // Em ambientes que bloqueiam localStorage (sandbox), o app segue em memória.
  // Retorna false se não persistiu (ex.: cota cheia por muitas fotos).
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    return true;
  } catch { return false; }
}

function loadDB() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch { /* sem persistência */ }
  // Primeiro acesso: o sistema começa vazio, pronto para os produtos reais.
  // Dados de exemplo só entram se a pessoa pedir (botão na tela inicial).
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    db.products = data.products || [];
    db.sales = data.sales || [];
    db.promos = data.promos || [];
    db.subscribers = data.subscribers || [];
    db.settings = Object.assign({ whatsapp: "" }, data.settings);
  } catch { /* dados corrompidos: recomeça vazio */ }
}

/* ---------- Dados de demonstração ---------- */

function seedDemoData() {
  // Gerador pseudo-aleatório com semente fixa: os números de demonstração
  // são estáveis entre recargas.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  db.products = [
    { id: "p1", name: "Chocolate com Morango", price: 15.0, cost: 6.5, stock: 14 },
    { id: "p2", name: "Ninho com Nutella",     price: 17.0, cost: 8.0, stock: 9 },
    { id: "p3", name: "Prestígio",             price: 14.0, cost: 5.8, stock: 3 },
    { id: "p4", name: "Cenoura com Chocolate", price: 13.0, cost: 5.0, stock: 18 },
    { id: "p5", name: "Maracujá",              price: 14.0, cost: 5.5, stock: 0 },
    { id: "p6", name: "Red Velvet",            price: 18.0, cost: 9.8, stock: 7 },
  ];

  const today = todayISO();
  db.promos = [
    {
      id: "promo1", name: "Semana do Ninho", productId: "p2",
      type: "percent", value: 10,
      start: addDays(today, -3), end: addDays(today, 4),
    },
    {
      id: "promo2", name: "Queima Maracujá", productId: "p5",
      type: "fixed", value: 2,
      start: addDays(today, -30), end: addDays(today, -10),
    },
  ];

  // Popularidade relativa de cada sabor no gerador de vendas.
  const popularity = { p1: 0.28, p2: 0.24, p3: 0.13, p4: 0.15, p5: 0.08, p6: 0.12 };
  const payments = ["Pix", "Pix", "Pix", "Cartão", "Cartão", "Dinheiro"];
  const customerNames = ["Mariana", "Carla", "João Pedro", "Fernanda", "Rafael", "Dona Lúcia"];
  const addresses = ["Centro", "Jardim América", "Vila Nova", "Santa Mônica"];

  db.sales = [];
  for (let back = 89; back >= 0; back--) {
    const dateISO = addDays(today, -back);
    const weekday = (parseISODate(dateISO).getDay() + 6) % 7; // 0=Seg … 6=Dom
    // Fim de semana vende mais; base cresce levemente ao longo do tempo.
    const weekendBoost = (weekday >= 4) ? 3 : 0;
    const growth = (89 - back) / 89; // 0 → 1
    const salesCount = Math.floor(rand() * 3 + 1 + weekendBoost + growth * 2);
    for (let s = 0; s < salesCount; s++) {
      const itemCount = rand() < 0.55 ? 1 : (rand() < 0.75 ? 2 : 3);
      const items = [];
      for (let i = 0; i < itemCount; i++) {
        let r = rand(), acc = 0, chosen = db.products[0];
        for (const p of db.products) {
          acc += popularity[p.id];
          if (r <= acc) { chosen = p; break; }
        }
        const qty = rand() < 0.7 ? 1 : 2;
        const existing = items.find((it) => it.productId === chosen.id);
        if (existing) { existing.qty += qty; continue; }
        items.push({
          productId: chosen.id, name: chosen.name,
          unitPrice: chosen.price, unitCost: chosen.cost,
          qty, discount: 0, promoName: null,
        });
      }
      // Aplica promoções vigentes na data da venda.
      for (const it of items) {
        const promo = bestPromoFor(it.productId, it.unitPrice, dateISO);
        if (promo) {
          it.discount = promo.discountPerUnit * it.qty;
          it.promoName = promo.name;
        }
      }
      // Canal: maioria balcão, parte delivery (com taxa) e parte encomenda
      // já concluída (entregue no próprio dia).
      const chRand = rand();
      let channel = "balcao", customer = null, deliveryFee = 0, deliveryDate = null;
      if (chRand < 0.22) {
        channel = "delivery";
        customer = {
          name: customerNames[Math.floor(rand() * customerNames.length)],
          phone: "", address: addresses[Math.floor(rand() * addresses.length)],
        };
        deliveryFee = [5, 6, 7, 8][Math.floor(rand() * 4)];
      } else if (chRand < 0.32) {
        channel = "encomenda";
        customer = {
          name: customerNames[Math.floor(rand() * customerNames.length)],
          phone: "", address: "",
        };
        deliveryDate = dateISO;
        deliveryFee = rand() < 0.5 ? 5 : 0;
      }
      const hour = String(9 + Math.floor(rand() * 11)).padStart(2, "0");
      const minute = String(Math.floor(rand() * 60)).padStart(2, "0");
      db.sales.push({
        id: uid(),
        dateISO,
        time: `${hour}:${minute}`,
        payment: payments[Math.floor(rand() * payments.length)],
        status: "ok",
        channel, customer, deliveryFee, deliveryDate,
        items,
      });
    }
  }

  // Encomendas ainda abertas: uma atrasada (para demonstrar o alerta),
  // as demais nos próximos dias.
  const pendingSeed = [
    { name: "Mariana", phone: "(11) 98888-1234", address: "Jardim América", days: -1, itemDefs: [["p1", 6]], fee: 8 },
    { name: "Seu João", phone: "(11) 97777-4321", address: "", days: 1, itemDefs: [["p2", 4], ["p6", 2]], fee: 0 },
    { name: "Escola Sol Nascente", phone: "(11) 96666-0000", address: "Centro", days: 2, itemDefs: [["p4", 10]], fee: 12 },
    { name: "Carla", phone: "(11) 95555-9090", address: "", days: 5, itemDefs: [["p1", 3], ["p3", 3]], fee: 0 },
  ];
  for (const o of pendingSeed) {
    db.sales.push({
      id: uid(),
      dateISO: addDays(today, Math.min(o.days, 0) - 2),
      time: "10:00",
      payment: "Pix",
      status: "pendente",
      channel: "encomenda",
      customer: { name: o.name, phone: o.phone, address: o.address },
      deliveryFee: o.fee,
      deliveryDate: addDays(today, o.days),
      items: o.itemDefs.map(([pid, qty]) => {
        const p = db.products.find((x) => x.id === pid);
        return {
          productId: pid, name: p.name, unitPrice: p.price, unitCost: p.cost,
          qty, discount: 0, promoName: null,
        };
      }),
    });
  }
}

/* ---------- Regras de negócio ---------- */

function promoStatus(promo, refISO = todayISO()) {
  if (refISO < promo.start) return "agendada";
  if (refISO > promo.end) return "expirada";
  return "ativa";
}

/* Melhor desconto aplicável a um produto numa data: maior valor por unidade
   entre as promoções vigentes que cobrem o produto (ou todos). */
function bestPromoFor(productId, unitPrice, dateISO = todayISO()) {
  let best = null;
  for (const promo of db.promos) {
    if (promoStatus(promo, dateISO) !== "ativa") continue;
    if (promo.productId && promo.productId !== productId) continue;
    const off = promo.type === "percent"
      ? unitPrice * promo.value / 100
      : Math.min(promo.value, unitPrice);
    if (!best || off > best.discountPerUnit) {
      best = { name: promo.name, discountPerUnit: Math.round(off * 100) / 100 };
    }
  }
  return best;
}

function saleSubtotal(sale) {
  return sale.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
}
function saleDiscount(sale) {
  return sale.items.reduce((s, it) => s + (it.discount || 0), 0);
}
function saleTotal(sale) {
  return saleSubtotal(sale) - saleDiscount(sale) + (sale.deliveryFee || 0);
}
/* A taxa de entrega não entra no lucro: assume-se que cobre o deslocamento. */
function saleProfit(sale) {
  return sale.items.reduce(
    (s, it) => s + (it.unitPrice - (it.unitCost || 0)) * it.qty - (it.discount || 0), 0);
}

/* Data em que a venda conta para os relatórios: encomendas contam no dia
   da entrega; balcão e delivery, no dia da venda. */
function saleDate(sale) {
  return (sale.channel === "encomenda" && sale.deliveryDate) ? sale.deliveryDate : sale.dateISO;
}

function validSales() {
  return db.sales.filter((s) => s.status === "ok");
}

function pendingOrders() {
  return db.sales.filter((s) => s.status === "pendente");
}

/* Vendas do período: últimos `days` dias incluindo hoje (0 = tudo). */
function salesInRange(days, endISO = todayISO()) {
  const sales = validSales();
  if (!days) return sales;
  const startISO = addDays(endISO, -(days - 1));
  return sales.filter((s) => saleDate(s) >= startISO && saleDate(s) <= endISO);
}

function soldUnitsByProduct(days) {
  const map = {};
  for (const sale of salesInRange(days)) {
    for (const it of sale.items) {
      map[it.productId] = (map[it.productId] || 0) + it.qty;
    }
  }
  return map;
}

/* ---------- Estado da interface ---------- */

const state = {
  rangeDays: 30,
  cart: [],          // carrinho do balcão: [{productId, qty}]
  shopCart: [],      // carrinho da loja (cliente): [{productId, qty}]
  editingProductId: null,
  editingPromoId: null,
  productImage: null, // foto pendente no formulário de produto (data URI ou null)
};

/* ---------- Tooltip compartilhado ---------- */

const tooltipEl = document.getElementById("tooltip");

function showTooltip(x, y, rows, title) {
  tooltipEl.textContent = "";
  if (title) tooltipEl.append(el("div", { class: "tt-title" }, title));
  for (const row of rows) {
    const line = el("div", { class: "tt-row" });
    if (row.color) line.append(el("span", { class: "tt-key", style: `background:${row.color}` }));
    line.append(el("span", { class: "tt-value" }, row.value));
    if (row.label) line.append(el("span", { class: "tt-label" }, row.label));
    tooltipEl.append(line);
  }
  tooltipEl.hidden = false;
  const pad = 14;
  const rect = tooltipEl.getBoundingClientRect();
  let left = x + pad, top = y + pad;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
  tooltipEl.style.left = `${Math.max(4, left)}px`;
  tooltipEl.style.top = `${Math.max(4, top)}px`;
}
function hideTooltip() { tooltipEl.hidden = true; }

/* ---------- Mini tabelas (visão alternativa dos gráficos) ---------- */

function miniTable(headers, rows) {
  return el("table", { class: "table" }, [
    el("thead", {}, el("tr", {}, headers.map((h, i) =>
      el("th", { class: i > 0 ? "num" : "" }, h)))),
    el("tbody", {}, rows.map((r) =>
      el("tr", {}, r.map((cell, i) => el("td", { class: i > 0 ? "num" : "" }, cell))))),
  ]);
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard() {
  renderKPIs();
  renderRevenueChart();
  renderTopProducts();
  renderWeekdayChart();
  renderPaymentChart();
  renderChannelChart();
}

function periodTotals(sales) {
  let revenue = 0, units = 0, profit = 0;
  for (const s of sales) {
    revenue += saleTotal(s);
    profit += saleProfit(s);
    units += s.items.reduce((a, it) => a + it.qty, 0);
  }
  return { revenue, units, profit, count: sales.length };
}

function renderKPIs() {
  const days = state.rangeDays;
  const current = periodTotals(salesInRange(days));

  let previous = null;
  if (days) {
    const prevEnd = addDays(todayISO(), -days);
    previous = periodTotals(salesInRange(days, prevEnd));
  }

  const ticket = current.count ? current.revenue / current.count : 0;
  const prevTicket = previous && previous.count ? previous.revenue / previous.count : null;

  const kpis = [
    { label: "Receita", value: fmtMoney(current.revenue), cur: current.revenue, prev: previous?.revenue },
    { label: "Vendas", value: fmtInt(current.count), cur: current.count, prev: previous?.count },
    { label: "Potes vendidos", value: fmtInt(current.units), cur: current.units, prev: previous?.units },
    { label: "Ticket médio", value: fmtMoney(ticket), cur: ticket, prev: prevTicket },
    { label: "Lucro estimado", value: fmtMoney(current.profit), cur: current.profit, prev: previous?.profit },
  ];

  const row = document.getElementById("kpi-row");
  row.textContent = "";
  for (const k of kpis) {
    const tile = el("div", { class: "kpi" }, [
      el("div", { class: "label" }, k.label),
      el("div", { class: "value" }, k.value),
    ]);
    if (previous && k.prev !== null && k.prev !== undefined) {
      let deltaText, cls = "";
      if (k.prev === 0) {
        deltaText = "sem base de comparação";
      } else {
        const pct = ((k.cur - k.prev) / k.prev) * 100;
        const arrow = pct >= 0 ? "▲" : "▼";
        cls = pct >= 0 ? "up" : "down";
        deltaText = `${arrow} ${Math.abs(pct).toFixed(1).replace(".", ",")}% vs período anterior`;
      }
      tile.append(el("div", { class: `delta ${cls}` }, deltaText));
    }
    row.append(tile);
  }

  // Encomendas abertas: independem do filtro de período — são trabalho futuro.
  const pending = pendingOrders();
  const pendingValue = pending.reduce((a, s) => a + saleTotal(s), 0);
  row.append(el("div", { class: "kpi" }, [
    el("div", { class: "label" }, "Encomendas abertas"),
    el("div", { class: "value" }, fmtInt(pending.length)),
    el("div", { class: "delta" }, pending.length
      ? `${fmtMoney(pendingValue)} a receber`
      : "nenhuma pendente"),
  ]));
}

/* ----- Receita por dia (linha + crosshair) ----- */

function dailySeries(days) {
  const effective = days || 90; // "Tudo" mostra os últimos 90 dias no gráfico
  const points = [];
  const byDay = {};
  for (const s of salesInRange(effective)) {
    const day = saleDate(s);
    if (!byDay[day]) byDay[day] = { revenue: 0, count: 0 };
    byDay[day].revenue += saleTotal(s);
    byDay[day].count += 1;
  }
  for (let back = effective - 1; back >= 0; back--) {
    const iso = addDays(todayISO(), -back);
    points.push({ iso, revenue: byDay[iso]?.revenue || 0, count: byDay[iso]?.count || 0 });
  }
  return points;
}

/* Escala do eixo Y com marcações em números redondos: escolhe o menor passo
   "bonito" (1/2/2,5/5 × potência de 10) que cubra o máximo em até 5 divisões. */
function niceScale(rawMax) {
  if (rawMax <= 0) return { max: 10, ticks: 2 };
  for (let mag = 1; mag <= 1e9; mag *= 10) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * mag;
      if (m === 2.5 && mag < 10) continue; // evita rótulos decimais
      const ticks = Math.ceil(rawMax / step);
      if (ticks <= 5) return { max: step * ticks, ticks };
    }
  }
  return { max: rawMax, ticks: 5 };
}

function renderRevenueChart() {
  const wrap = document.getElementById("revenue-chart");
  const sub = document.getElementById("revenue-chart-sub");
  const points = dailySeries(state.rangeDays);
  sub.textContent = state.rangeDays
    ? `Últimos ${state.rangeDays === 1 ? "1 dia" : state.rangeDays + " dias"}`
    : "Últimos 90 dias";
  wrap.textContent = "";

  const W = 760, H = 240;
  const padL = 46, padR = 16, padT = 14, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const scale = niceScale(Math.max(...points.map((p) => p.revenue), 1));
  const maxRevenue = scale.max;
  const xFor = (i) => points.length > 1 ? padL + (i / (points.length - 1)) * plotW : padL + plotW / 2;
  const yFor = (v) => padT + plotH - (v / maxRevenue) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Gráfico de linha da receita diária");

  const mk = (name, attrs) => {
    const node = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  // Linhas de grade + rótulos do eixo Y (números "redondos")
  const ticks = scale.ticks;
  for (let t = 0; t <= ticks; t++) {
    const value = (maxRevenue / ticks) * t;
    const y = yFor(value);
    svg.append(mk("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: t === 0 ? "baseline" : "gridline" }));
    const label = mk("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "axis-text" });
    label.textContent = value >= 1000 ? (value / 1000).toLocaleString("pt-BR") + " mil" : fmtInt(value);
    svg.append(label);
  }

  // Rótulos do eixo X (~5 marcações)
  const xLabelStep = Math.max(1, Math.round(points.length / 5));
  points.forEach((p, i) => {
    if (i % xLabelStep !== 0 && i !== points.length - 1) return;
    const label = mk("text", { x: xFor(i), y: H - 8, "text-anchor": "middle", class: "axis-text" });
    label.textContent = fmtDateShort(p.iso);
    svg.append(label);
  });

  const seriesColor = getComputedStyle(document.documentElement).getPropertyValue("--series-1").trim();
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim();

  if (points.length > 1) {
    const linePath = points.map((p, i) => `${i ? "L" : "M"}${xFor(i)},${yFor(p.revenue)}`).join(" ");
    const areaPath = `${linePath} L${xFor(points.length - 1)},${yFor(0)} L${xFor(0)},${yFor(0)} Z`;
    svg.append(mk("path", { d: areaPath, fill: seriesColor, "fill-opacity": "0.1" }));
    svg.append(mk("path", {
      d: linePath, fill: "none", stroke: seriesColor,
      "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
  }

  // Marcador do último ponto, com anel na cor da superfície
  const last = points[points.length - 1];
  svg.append(mk("circle", {
    cx: xFor(points.length - 1), cy: yFor(last.revenue), r: 4,
    fill: seriesColor, stroke: surface, "stroke-width": "2",
  }));

  // Camada de hover: crosshair encontra o X mais próximo
  const crosshair = mk("line", { y1: padT, y2: padT + plotH, class: "crosshair", visibility: "hidden" });
  const hoverDot = mk("circle", { r: 4, fill: seriesColor, stroke: surface, "stroke-width": "2", visibility: "hidden" });
  svg.append(crosshair, hoverDot);

  const overlay = mk("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "transparent" });
  overlay.style.cursor = "crosshair";
  overlay.addEventListener("pointermove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * W;
    const idx = points.length > 1
      ? Math.max(0, Math.min(points.length - 1, Math.round(((relX - padL) / plotW) * (points.length - 1))))
      : 0;
    const p = points[idx];
    crosshair.setAttribute("x1", xFor(idx));
    crosshair.setAttribute("x2", xFor(idx));
    crosshair.setAttribute("visibility", "visible");
    hoverDot.setAttribute("cx", xFor(idx));
    hoverDot.setAttribute("cy", yFor(p.revenue));
    hoverDot.setAttribute("visibility", "visible");
    showTooltip(ev.clientX, ev.clientY, [
      { color: seriesColor, value: fmtMoney(p.revenue), label: "receita" },
      { value: fmtInt(p.count), label: p.count === 1 ? "venda" : "vendas" },
    ], fmtDateBR(p.iso));
  });
  overlay.addEventListener("pointerleave", () => {
    crosshair.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    hideTooltip();
  });
  svg.append(overlay);
  wrap.append(svg);

  // Visão em tabela
  const tableWrap = document.getElementById("revenue-table");
  tableWrap.textContent = "";
  tableWrap.append(miniTable(
    ["Data", "Vendas", "Receita"],
    points.filter((p) => p.count > 0).map((p) => [fmtDateBR(p.iso), fmtInt(p.count), fmtMoney(p.revenue)]),
  ));
}

/* ----- Top produtos (barras horizontais) ----- */

function renderTopProducts() {
  const container = document.getElementById("top-products-chart");
  const sub = document.getElementById("top-products-sub");
  sub.textContent = state.rangeDays ? `Receita no período selecionado` : "Receita em todo o histórico";
  container.textContent = "";

  const byProduct = {};
  for (const sale of salesInRange(state.rangeDays)) {
    for (const it of sale.items) {
      if (!byProduct[it.productId]) byProduct[it.productId] = { name: it.name, revenue: 0, units: 0 };
      byProduct[it.productId].revenue += it.unitPrice * it.qty - (it.discount || 0);
      byProduct[it.productId].units += it.qty;
    }
  }
  const rows = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  if (!rows.length) {
    container.append(el("p", { class: "empty-msg" }, "Sem vendas no período."));
    document.getElementById("top-products-table").textContent = "";
    return;
  }
  const max = rows[0].revenue;
  for (const r of rows) {
    const row = el("div", { class: "hbar-row" }, [
      el("div", { class: "hbar-label", title: r.name }, r.name),
      el("div", { class: "hbar-track" },
        el("div", { class: "hbar-fill", style: `width:${(r.revenue / max) * 100}%` })),
      el("div", { class: "hbar-value" }, fmtMoney(r.revenue)),
    ]);
    row.addEventListener("pointermove", (ev) => {
      showTooltip(ev.clientX, ev.clientY, [
        { value: fmtMoney(r.revenue), label: "receita" },
        { value: fmtInt(r.units), label: "potes" },
      ], r.name);
    });
    row.addEventListener("pointerleave", hideTooltip);
    container.append(row);
  }

  const tableWrap = document.getElementById("top-products-table");
  tableWrap.textContent = "";
  tableWrap.append(miniTable(
    ["Produto", "Potes", "Receita"],
    rows.map((r) => [r.name, fmtInt(r.units), fmtMoney(r.revenue)]),
  ));
}

/* ----- Vendas por dia da semana (colunas) ----- */

function weekdayUnits(days) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const sale of salesInRange(days)) {
    const idx = (parseISODate(saleDate(sale)).getDay() + 6) % 7;
    totals[idx] += sale.items.reduce((a, it) => a + it.qty, 0);
  }
  return totals;
}

function renderWeekdayChart() {
  const container = document.getElementById("weekday-chart");
  container.textContent = "";
  const totals = weekdayUnits(state.rangeDays);
  const max = Math.max(...totals, 1);

  totals.forEach((v, i) => {
    const slot = el("div", { class: "col-slot" }, [
      el("div", { class: "col-track" }, [
        el("div", { class: "col-value-wrap", style: "display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:100%;height:100%" }, [
          el("div", { class: "col-value" }, fmtInt(v)),
          el("div", { class: "col-fill", style: `height:${(v / max) * 100}%` }),
        ]),
      ]),
      el("div", { class: "col-label" }, WEEKDAYS[i]),
    ]);
    slot.addEventListener("pointermove", (ev) => {
      showTooltip(ev.clientX, ev.clientY, [{ value: fmtInt(v), label: "potes vendidos" }], WEEKDAYS[i]);
    });
    slot.addEventListener("pointerleave", hideTooltip);
    container.append(slot);
  });

  const tableWrap = document.getElementById("weekday-table");
  tableWrap.textContent = "";
  tableWrap.append(miniTable(
    ["Dia", "Potes"],
    totals.map((v, i) => [WEEKDAYS[i], fmtInt(v)]),
  ));
}

/* ----- Barras de participação (pagamento e canais) ----- */

const PAYMENT_SLOTS = [
  { name: "Pix", varName: "--series-1" },
  { name: "Cartão", varName: "--series-2" },
  { name: "Dinheiro", varName: "--series-3" },
  { name: "A combinar", varName: "--series-4" },
];

const CHANNEL_SLOTS = [
  { name: "Balcão", varName: "--series-1" },
  { name: "Delivery", varName: "--series-2" },
  { name: "Encomenda", varName: "--series-3" },
];

/* Barra empilhada de participação na receita, com legenda e visão em tabela. */
function renderShareChart({ chartId, tableId, slots, totals, ariaLabel, tableHeader }) {
  const container = document.getElementById(chartId);
  const tableWrap = document.getElementById(tableId);
  container.textContent = "";
  tableWrap.textContent = "";

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (!total) {
    container.append(el("p", { class: "empty-msg" }, "Sem vendas no período."));
    return;
  }

  const styles = getComputedStyle(document.documentElement);
  const bar = el("div", { class: "stack-bar", role: "img", "aria-label": ariaLabel });
  const legend = el("div", { class: "legend" });

  for (const slot of slots) {
    const value = totals[slot.name] || 0;
    if (!value) continue;
    const color = styles.getPropertyValue(slot.varName).trim();
    const pct = (value / total) * 100;
    const seg = el("div", { class: "stack-seg", style: `width:${pct}%;background:${color}` });
    seg.addEventListener("pointermove", (ev) => {
      showTooltip(ev.clientX, ev.clientY, [
        { color, value: fmtMoney(value), label: `${pct.toFixed(1).replace(".", ",")}%` },
      ], slot.name);
    });
    seg.addEventListener("pointerleave", hideTooltip);
    bar.append(seg);

    legend.append(el("span", { class: "key" }, [
      el("span", { class: "swatch", style: `background:${color}` }),
      `${slot.name} · ${pct.toFixed(0)}%`,
    ]));
  }
  container.append(bar, legend);
  tableWrap.append(miniTable(
    [tableHeader, "Receita"],
    slots.filter((s) => totals[s.name]).map((s) => [s.name, fmtMoney(totals[s.name])]),
  ));
}

function renderPaymentChart() {
  const totals = {};
  for (const sale of salesInRange(state.rangeDays)) {
    totals[sale.payment] = (totals[sale.payment] || 0) + saleTotal(sale);
  }
  renderShareChart({
    chartId: "payment-chart", tableId: "payment-table",
    slots: PAYMENT_SLOTS, totals,
    ariaLabel: "Participação das formas de pagamento na receita",
    tableHeader: "Forma",
  });
}

function renderChannelChart() {
  const totals = {};
  for (const sale of salesInRange(state.rangeDays)) {
    const label = CHANNEL_LABELS[sale.channel || "balcao"];
    totals[label] = (totals[label] || 0) + saleTotal(sale);
  }
  renderShareChart({
    chartId: "channel-chart", tableId: "channel-table",
    slots: CHANNEL_SLOTS, totals,
    ariaLabel: "Participação dos canais de venda na receita",
    tableHeader: "Canal",
  });
}

/* ============================================================
   VENDAS (carrinho + histórico)
   ============================================================ */

function currentChannel() {
  return document.querySelector('input[name="channel"]:checked')?.value || "balcao";
}

/* Mostra/esconde os campos de cliente conforme o canal escolhido. */
function updateSaleFormUI() {
  const channel = currentChannel();
  document.getElementById("customer-fields").hidden = channel === "balcao";
  document.getElementById("due-date-row").hidden = channel !== "encomenda";
  document.getElementById("btn-confirm-sale").textContent =
    channel === "encomenda" ? "Registrar encomenda" : "Confirmar venda";
  const due = document.getElementById("sale-due-date");
  due.min = todayISO();
  if (!due.value || due.value < todayISO()) due.value = addDays(todayISO(), 1);
  renderSaleProductSelect();
  renderCart();
}

function renderSaleProductSelect() {
  const select = document.getElementById("sale-product");
  // Encomenda é produção sob demanda: sabores esgotados podem ser encomendados.
  const orderMode = currentChannel() === "encomenda";
  select.textContent = "";
  const sellable = orderMode ? db.products : db.products.filter((p) => p.stock > 0);
  if (!sellable.length) {
    select.append(el("option", { value: "" },
      orderMode ? "Nenhum produto cadastrado" : "Nenhum produto com estoque"));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const p of [...db.products].sort((a, b) => a.name.localeCompare(b.name))) {
    const suffix = p.stock === 0 ? (orderMode ? " (produzir)" : " (sem estoque)") : "";
    const opt = el("option", { value: p.id }, `${p.name} — ${fmtMoney(p.price)}${suffix}`);
    if (p.stock === 0 && !orderMode) opt.disabled = true;
    select.append(opt);
  }
}

function cartLines() {
  return state.cart.map((entry) => {
    const product = db.products.find((p) => p.id === entry.productId);
    const promo = bestPromoFor(product.id, product.price);
    const discount = promo ? promo.discountPerUnit * entry.qty : 0;
    return {
      product, qty: entry.qty,
      discount: Math.round(discount * 100) / 100,
      promoName: promo?.name || null,
      subtotal: product.price * entry.qty - discount,
    };
  });
}

function renderCart() {
  const tbody = document.querySelector("#cart-table tbody");
  const emptyMsg = document.getElementById("cart-empty");
  tbody.textContent = "";

  const lines = cartLines();
  emptyMsg.classList.toggle("hidden", lines.length > 0);
  document.getElementById("cart-table").classList.toggle("hidden", lines.length === 0);

  let subtotal = 0, discount = 0;
  for (const line of lines) {
    subtotal += line.product.price * line.qty;
    discount += line.discount;
    const nameCell = el("td", {}, line.product.name);
    if (line.promoName) nameCell.append(el("span", { class: "promo-tag" }, [icon("tag"), line.promoName]));
    tbody.append(el("tr", {}, [
      nameCell,
      el("td", { class: "num" }, fmtInt(line.qty)),
      el("td", { class: "num" }, fmtMoney(line.product.price)),
      el("td", { class: "num" }, line.discount ? "−" + fmtMoney(line.discount) : "—"),
      el("td", { class: "num" }, fmtMoney(line.subtotal)),
      el("td", {}, el("button", {
        class: "btn small ghost danger-text",
        onclick: () => {
          state.cart = state.cart.filter((c) => c.productId !== line.product.id);
          renderCart();
        },
      }, "Remover")),
    ]));
  }

  const fee = currentChannel() === "balcao"
    ? 0
    : Math.max(0, readMoney(document.getElementById("sale-fee")));
  document.getElementById("fee-line").hidden = fee <= 0;
  document.getElementById("cart-fee").textContent = fmtMoney(fee);
  document.getElementById("cart-subtotal").textContent = fmtMoney(subtotal);
  document.getElementById("cart-discount").textContent = discount ? "−" + fmtMoney(discount) : fmtMoney(0);
  document.getElementById("cart-total").textContent = fmtMoney(subtotal - discount + fee);
  document.getElementById("btn-confirm-sale").disabled = lines.length === 0;
}

function addToCart() {
  const select = document.getElementById("sale-product");
  const qtyInput = document.getElementById("sale-qty");
  const productId = select.value;
  const qty = Math.max(1, Math.floor(Number(qtyInput.value) || 1));
  const product = db.products.find((p) => p.id === productId);
  if (!product) { toast("Selecione um produto."); return; }

  const inCart = state.cart.find((c) => c.productId === productId);
  const already = inCart ? inCart.qty : 0;
  // Encomenda é produzida para a data: não depende do estoque pronto.
  if (currentChannel() !== "encomenda" && already + qty > product.stock) {
    toast(`Estoque insuficiente: restam ${product.stock - already} pote(s) de ${product.name}.`);
    return;
  }
  if (inCart) inCart.qty += qty;
  else state.cart.push({ productId, qty });
  qtyInput.value = 1;
  renderCart();
}

function confirmSale() {
  const lines = cartLines();
  if (!lines.length) return;

  const channel = currentChannel();
  const customer = {
    name: document.getElementById("sale-customer").value.trim(),
    phone: document.getElementById("sale-phone").value.trim(),
    address: document.getElementById("sale-address").value.trim(),
  };
  const fee = channel === "balcao"
    ? 0
    : Math.max(0, readMoney(document.getElementById("sale-fee")));
  const dueDate = document.getElementById("sale-due-date").value;

  if (channel === "delivery" && (!customer.name || !customer.address)) {
    toast("Informe o cliente e o endereço de entrega do delivery.");
    return;
  }
  if (channel === "encomenda") {
    if (!customer.name) { toast("Informe o nome do cliente da encomenda."); return; }
    if (!dueDate) { toast("Informe a data de entrega da encomenda."); return; }
    if (dueDate < todayISO()) { toast("A data de entrega não pode estar no passado."); return; }
  }
  if (channel !== "encomenda") {
    for (const line of lines) {
      if (line.qty > line.product.stock) {
        toast(`Estoque insuficiente de ${line.product.name}.`);
        return;
      }
    }
  }

  const payment = document.querySelector('input[name="payment"]:checked').value;
  const now = new Date();
  const sale = {
    id: uid(),
    dateISO: todayISO(),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    payment,
    status: channel === "encomenda" ? "pendente" : "ok",
    channel,
    customer: channel === "balcao" ? null : customer,
    deliveryFee: fee,
    deliveryDate: channel === "encomenda" ? dueDate : null,
    items: lines.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      unitPrice: line.product.price,
      unitCost: line.product.cost,
      qty: line.qty,
      discount: line.discount,
      promoName: line.promoName,
    })),
  };
  // Encomenda não baixa o estoque pronto: os potes serão produzidos para a data.
  if (channel !== "encomenda") {
    for (const line of lines) line.product.stock -= line.qty;
  }
  db.sales.push(sale);
  state.cart = [];
  for (const id of ["sale-customer", "sale-phone", "sale-address"]) {
    document.getElementById(id).value = "";
  }
  setMoney(document.getElementById("sale-fee"), 0);
  saveDB();
  renderAll();
  toast(channel === "encomenda"
    ? `Encomenda de ${customer.name} registrada para ${fmtDateBR(dueDate)}.`
    : `Venda registrada: ${fmtMoney(saleTotal(sale))} no ${payment}.`);
}

function concludeOrder(saleId) {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale || sale.status !== "pendente") return;
  sale.status = "ok";
  // Entrega antecipada conta como receita de hoje.
  if (sale.deliveryDate > todayISO()) sale.deliveryDate = todayISO();
  saveDB();
  renderAll();
  toast(`Encomenda de ${sale.customer?.name || "cliente"} concluída e somada às vendas.`);
}

function cancelSale(saleId) {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale || sale.status === "cancelled") return;
  const isOrder = sale.channel === "encomenda";
  const msg = isOrder
    ? "Cancelar esta encomenda?"
    : "Cancelar esta venda? O estoque dos itens será devolvido.";
  if (!confirm(msg)) return;
  sale.status = "cancelled";
  // Encomendas nunca baixaram o estoque pronto, então nada a devolver.
  if (!isOrder) {
    for (const it of sale.items) {
      const product = db.products.find((p) => p.id === it.productId);
      if (product) product.stock += it.qty;
    }
  }
  saveDB();
  renderAll();
  toast(isOrder ? "Encomenda cancelada." : "Venda cancelada e estoque devolvido.");
}

function renderOrders() {
  const tbody = document.querySelector("#orders-table tbody");
  tbody.textContent = "";
  const orders = pendingOrders()
    .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  if (!orders.length) {
    tbody.append(el("tr", {}, el("td", { colspan: "7", class: "empty-msg" },
      "Nenhuma encomenda aberta. Registre uma escolhendo o canal \"Encomenda\" na nova venda.")));
    return;
  }
  const today = todayISO();
  for (const o of orders) {
    let badge;
    if (o.deliveryDate < today) badge = el("span", { class: "badge critical" }, "Atrasada");
    else if (o.deliveryDate === today) badge = el("span", { class: "badge warning" }, "Hoje");
    else badge = el("span", { class: "badge neutral" }, "Agendada");
    const contact = [o.customer?.phone, o.customer?.address].filter(Boolean).join(" · ") || "—";
    tbody.append(el("tr", {}, [
      el("td", {}, fmtDateBR(o.deliveryDate)),
      el("td", {}, o.customer?.name || "—"),
      el("td", {}, o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")),
      el("td", {}, contact),
      el("td", { class: "num" }, fmtMoney(saleTotal(o))),
      el("td", {}, badge),
      el("td", {}, [
        el("button", { class: "btn small", onclick: () => concludeOrder(o.id) }, "Concluir"),
        " ",
        el("button", { class: "btn small ghost danger-text", onclick: () => cancelSale(o.id) }, "Cancelar"),
      ]),
    ]));
  }
}

function renderSalesTable() {
  const tbody = document.querySelector("#sales-table tbody");
  tbody.textContent = "";
  const sales = [...db.sales].sort((a, b) =>
    (b.dateISO + (b.time || "")).localeCompare(a.dateISO + (a.time || ""))).slice(0, 100);

  if (!sales.length) {
    tbody.append(el("tr", {}, el("td", { colspan: "7", class: "empty-msg" }, "Nenhuma venda registrada.")));
    return;
  }
  for (const sale of sales) {
    const itemsText = sale.items.map((it) => `${it.qty}× ${it.name}`).join(", ");
    const channel = sale.channel || "balcao";

    const channelCell = el("td", {}, CHANNEL_LABELS[channel]);
    if (sale.customer?.name) {
      channelCell.append(el("span", { class: "cell-sub" }, sale.customer.name));
    }
    if (channel === "encomenda" && sale.deliveryDate) {
      channelCell.append(el("span", { class: "cell-sub" }, "entrega " + fmtDateBR(sale.deliveryDate)));
    }

    let statusBadge;
    if (sale.status === "cancelled") statusBadge = el("span", { class: "badge critical" }, "Cancelada");
    else if (sale.status === "pendente") statusBadge = el("span", { class: "badge warning" }, "Pendente");
    else statusBadge = el("span", { class: "badge good" }, "Concluída");

    const row = el("tr", { class: sale.status === "cancelled" ? "sale-cancelled" : "" }, [
      el("td", {}, `${fmtDateBR(sale.dateISO)} ${sale.time || ""}`),
      channelCell,
      el("td", {}, itemsText),
      el("td", {}, sale.payment),
      el("td", { class: "num" }, fmtMoney(saleTotal(sale))),
      el("td", {}, statusBadge),
      el("td", {}, sale.status === "ok"
        ? el("button", { class: "btn small ghost danger-text", onclick: () => cancelSale(sale.id) }, "Cancelar")
        : ""),
    ]);
    tbody.append(row);
  }
}

function exportSalesCSV() {
  const header = "data;hora;status;canal;cliente;entrega;pagamento;itens;subtotal;desconto;taxa_entrega;total\n";
  const escapeCSV = (s) => `"${String(s).replaceAll('"', '""')}"`;
  const body = db.sales.map((s) => [
    s.dateISO, s.time || "", s.status,
    CHANNEL_LABELS[s.channel || "balcao"],
    escapeCSV(s.customer?.name || ""),
    s.deliveryDate || "",
    s.payment,
    escapeCSV(s.items.map((it) => `${it.qty}x ${it.name}`).join(", ")),
    saleSubtotal(s).toFixed(2).replace(".", ","),
    saleDiscount(s).toFixed(2).replace(".", ","),
    (s.deliveryFee || 0).toFixed(2).replace(".", ","),
    saleTotal(s).toFixed(2).replace(".", ","),
  ].join(";")).join("\n");
  const blob = new Blob(["﻿" + header + body], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `vendas-bolos-da-bru-${todayISO()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  toast("CSV de vendas exportado.");
}

/* ============================================================
   PRODUTOS
   ============================================================ */

function stockBadge(stock) {
  if (stock === 0) return el("span", { class: "badge critical" }, "Esgotado");
  if (stock <= 5) return el("span", { class: "badge warning" }, `${stock} — baixo`);
  return el("span", { class: "badge good" }, fmtInt(stock));
}

function renderProductsTable() {
  const tbody = document.querySelector("#products-table tbody");
  tbody.textContent = "";
  const sold30 = soldUnitsByProduct(30);

  if (!db.products.length) {
    tbody.append(el("tr", {}, el("td", { colspan: "7", class: "empty-msg" }, "Nenhum produto cadastrado.")));
    return;
  }
  for (const p of [...db.products].sort((a, b) => a.name.localeCompare(b.name))) {
    const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
    const nameCell = el("td", {}, el("span", { class: "cat-name" }, [
      el("span", { class: "cat-thumb" + (p.image ? "" : " empty") },
        p.image ? el("img", { src: p.image, alt: "" }) : icon("cupcake")),
      p.name,
    ]));
    tbody.append(el("tr", {}, [
      nameCell,
      el("td", { class: "num" }, fmtMoney(p.price)),
      el("td", { class: "num" }, fmtMoney(p.cost)),
      el("td", { class: "num" }, margin.toFixed(0) + "%"),
      el("td", { class: "num" }, stockBadge(p.stock)),
      el("td", { class: "num" }, fmtInt(sold30[p.id] || 0)),
      el("td", {}, [
        el("button", { class: "btn small ghost", onclick: () => startEditProduct(p.id) }, "Editar"),
        " ",
        el("button", { class: "btn small ghost danger-text", onclick: () => deleteProduct(p.id) }, "Excluir"),
      ]),
    ]));
  }
}

/* Mostra (ou esconde) a prévia da foto do produto no formulário. */
function updateProductImagePreview() {
  const preview = document.getElementById("product-image-preview");
  const thumb = document.getElementById("product-image-thumb");
  if (state.productImage) {
    thumb.src = state.productImage;
    preview.hidden = false;
  } else {
    thumb.removeAttribute("src");
    preview.hidden = true;
  }
}

function startEditProduct(id) {
  const p = db.products.find((x) => x.id === id);
  if (!p) return;
  state.editingProductId = id;
  state.productImage = p.image || null;
  document.getElementById("product-form-title").textContent = "Editar produto";
  document.getElementById("product-id").value = id;
  document.getElementById("product-name").value = p.name;
  setMoney(document.getElementById("product-price"), p.price);
  setMoney(document.getElementById("product-cost"), p.cost);
  document.getElementById("product-stock").value = p.stock;
  document.getElementById("product-image").value = "";
  updateProductImagePreview();
  document.getElementById("btn-cancel-edit").classList.remove("hidden");
  document.getElementById("product-name").focus();
}

function resetProductForm() {
  state.editingProductId = null;
  state.productImage = null;
  document.getElementById("product-form").reset();
  document.getElementById("product-form-title").textContent = "Novo produto";
  document.getElementById("btn-cancel-edit").classList.add("hidden");
  updateProductImagePreview();
}

function submitProductForm(ev) {
  ev.preventDefault();
  const name = document.getElementById("product-name").value.trim();
  const price = readMoney(document.getElementById("product-price"));
  const cost = readMoney(document.getElementById("product-cost"));
  const stock = Math.max(0, Math.floor(Number(document.getElementById("product-stock").value)));
  if (!name || !(price > 0) || cost < 0) { toast("Preencha os campos corretamente."); return; }
  if (cost >= price) toast("Atenção: custo maior ou igual ao preço — margem zero ou negativa.");

  const image = state.productImage || null;
  if (state.editingProductId) {
    const p = db.products.find((x) => x.id === state.editingProductId);
    Object.assign(p, { name, price, cost, stock, image });
    toast(`Produto "${name}" atualizado.`);
  } else {
    db.products.push({ id: uid(), name, price, cost, stock, image });
    toast(`Produto "${name}" cadastrado.`);
  }
  if (!saveDB()) {
    toast("Foto grande demais para o armazenamento do navegador. Tente uma imagem menor.");
  }
  resetProductForm();
  renderAll();
}

function deleteProduct(id) {
  const p = db.products.find((x) => x.id === id);
  if (!p) return;
  const linkedPromos = db.promos.filter((pr) => pr.productId === id);
  const msg = linkedPromos.length
    ? `Excluir "${p.name}"? ${linkedPromos.length} promoção(ões) ligadas a ele também serão removidas. O histórico de vendas é mantido.`
    : `Excluir "${p.name}"? O histórico de vendas é mantido.`;
  if (!confirm(msg)) return;
  db.products = db.products.filter((x) => x.id !== id);
  db.promos = db.promos.filter((pr) => pr.productId !== id);
  if (state.editingProductId === id) resetProductForm();
  state.cart = state.cart.filter((c) => c.productId !== id);
  saveDB();
  renderAll();
  toast(`Produto "${p.name}" excluído.`);
}

/* ============================================================
   PROMOÇÕES
   ============================================================ */

function renderPromoProductSelect() {
  const select = document.getElementById("promo-product");
  select.textContent = "";
  select.append(el("option", { value: "" }, "Todos os produtos"));
  for (const p of [...db.products].sort((a, b) => a.name.localeCompare(b.name))) {
    select.append(el("option", { value: p.id }, p.name));
  }
}

function renderPromosTable() {
  const tbody = document.querySelector("#promos-table tbody");
  tbody.textContent = "";
  if (!db.promos.length) {
    tbody.append(el("tr", {}, el("td", { colspan: "6", class: "empty-msg" }, "Nenhuma promoção cadastrada.")));
    return;
  }
  const sorted = [...db.promos].sort((a, b) => b.start.localeCompare(a.start));
  for (const promo of sorted) {
    const product = promo.productId ? db.products.find((p) => p.id === promo.productId) : null;
    const status = promoStatus(promo);
    const badgeClass = status === "ativa" ? "good" : status === "agendada" ? "warning" : "neutral";
    tbody.append(el("tr", {}, [
      el("td", {}, promo.name),
      el("td", {}, product ? product.name : "Todos"),
      el("td", { class: "num" }, promo.type === "percent" ? `${promo.value}%` : fmtMoney(promo.value)),
      el("td", {}, `${fmtDateBR(promo.start)} – ${fmtDateBR(promo.end)}`),
      el("td", {}, el("span", { class: `badge ${badgeClass}` }, status)),
      el("td", {}, [
        el("button", { class: "btn small ghost", onclick: () => startEditPromo(promo.id) }, "Editar"),
        " ",
        el("button", { class: "btn small ghost danger-text", onclick: () => deletePromo(promo.id) }, "Excluir"),
      ]),
    ]));
  }
}

/* O valor da promoção é R$ (com máscara de moeda) quando o tipo é "fixo" e
   um percentual simples quando é "%". Ajusta prefixo, máscara e formatação. */
function applyPromoValueMode(keepValue) {
  const type = document.getElementById("promo-type").value;
  const input = document.getElementById("promo-value");
  const prefix = document.getElementById("promo-value-prefix");
  const current = keepValue
    ? (input.dataset.money === "off" ? Number(String(input.value).replace(/\D/g, "")) : readMoney(input))
    : 0;
  if (type === "fixed") {
    prefix.textContent = "R$";
    input.dataset.money = "on";
    if (keepValue) setMoney(input, current); else input.value = "";
  } else {
    prefix.textContent = "%";
    input.dataset.money = "off";
    input.value = keepValue && current ? String(Math.round(current)) : "";
  }
}

function startEditPromo(id) {
  const promo = db.promos.find((x) => x.id === id);
  if (!promo) return;
  state.editingPromoId = id;
  document.getElementById("promo-form-title").textContent = "Editar promoção";
  document.getElementById("promo-id").value = id;
  document.getElementById("promo-name").value = promo.name;
  document.getElementById("promo-product").value = promo.productId || "";
  document.getElementById("promo-type").value = promo.type;
  applyPromoValueMode(false);
  if (promo.type === "fixed") setMoney(document.getElementById("promo-value"), promo.value);
  else document.getElementById("promo-value").value = String(promo.value);
  document.getElementById("promo-start").value = promo.start;
  document.getElementById("promo-end").value = promo.end;
  document.getElementById("btn-cancel-promo-edit").classList.remove("hidden");
  document.getElementById("promo-name").focus();
}

function resetPromoForm() {
  state.editingPromoId = null;
  document.getElementById("promo-form").reset();
  document.getElementById("promo-form-title").textContent = "Nova promoção";
  document.getElementById("btn-cancel-promo-edit").classList.add("hidden");
  document.getElementById("promo-start").value = todayISO();
  document.getElementById("promo-end").value = addDays(todayISO(), 7);
  applyPromoValueMode(false);
}

function submitPromoForm(ev) {
  ev.preventDefault();
  const name = document.getElementById("promo-name").value.trim();
  const productId = document.getElementById("promo-product").value || null;
  const type = document.getElementById("promo-type").value;
  const valInput = document.getElementById("promo-value");
  const value = type === "fixed"
    ? readMoney(valInput)
    : Number(String(valInput.value).replace(/\D/g, ""));
  const start = document.getElementById("promo-start").value;
  const end = document.getElementById("promo-end").value;

  if (!name || !(value > 0) || !start || !end) { toast("Preencha os campos corretamente."); return; }
  if (end < start) { toast("A data final deve ser depois da inicial."); return; }
  if (type === "percent" && value > 90) { toast("Desconto máximo permitido: 90%."); return; }

  if (state.editingPromoId) {
    const promo = db.promos.find((x) => x.id === state.editingPromoId);
    Object.assign(promo, { name, productId, type, value, start, end });
    toast(`Promoção "${name}" atualizada.`);
  } else {
    db.promos.push({ id: uid(), name, productId, type, value, start, end });
    toast(`Promoção "${name}" criada.`);
  }
  saveDB();
  resetPromoForm();
  renderAll();
}

function deletePromo(id) {
  const promo = db.promos.find((x) => x.id === id);
  if (!promo) return;
  if (!confirm(`Excluir a promoção "${promo.name}"?`)) return;
  db.promos = db.promos.filter((x) => x.id !== id);
  if (state.editingPromoId === id) resetPromoForm();
  saveDB();
  renderAll();
  toast("Promoção excluída.");
}

/* ============================================================
   DICAS (motor de análise)
   ============================================================ */

function computeTips() {
  const tips = [];
  const sold30 = soldUnitsByProduct(30);
  const sales30 = salesInRange(30);

  // 0. Encomendas: atrasadas e as dos próximos dias
  const pending = pendingOrders();
  for (const o of pending.filter((s) => s.deliveryDate < todayISO())) {
    tips.push({
      level: "critical", icon: "clock",
      title: `Encomenda de ${o.customer?.name || "cliente"} está atrasada`,
      text: `A entrega era ${fmtDateBR(o.deliveryDate)} (${fmtMoney(saleTotal(o))}). Fale com o cliente pelo contato cadastrado e reagende, ou conclua no painel "Encomendas abertas".`,
    });
  }
  const soon = pending.filter((s) => s.deliveryDate >= todayISO() && s.deliveryDate <= addDays(todayISO(), 2));
  if (soon.length) {
    const potes = soon.reduce((a, s) => a + s.items.reduce((x, it) => x + it.qty, 0), 0);
    tips.push({
      level: "warning", icon: "calendar",
      title: `${soon.length} encomenda(s) para os próximos 2 dias`,
      text: `São ${fmtInt(potes)} pote(s) no total. Confira os sabores no painel "Encomendas abertas" e organize a produção com antecedência.`,
    });
  }

  // 1. Estoque
  const out = db.products.filter((p) => p.stock === 0);
  const low = db.products.filter((p) => p.stock > 0 && p.stock <= 5);
  for (const p of out) {
    const demand = sold30[p.id] || 0;
    tips.push({
      level: "critical", icon: "package", title: `"${p.name}" está esgotado`,
      text: demand
        ? `Esse sabor vendeu ${fmtInt(demand)} pote(s) nos últimos 30 dias. Cada dia sem estoque é venda perdida — produza um novo lote o quanto antes.`
        : "Produza um novo lote ou avalie se vale manter esse sabor no cardápio.",
    });
  }
  if (low.length) {
    tips.push({
      level: "warning", icon: "alert",
      title: `Estoque baixo: ${low.map((p) => p.name).join(", ")}`,
      text: "Com 5 potes ou menos, você corre o risco de perder vendas de fim de semana, que são seus dias mais fortes. Planeje a produção com base na coluna \"Vend. 30d\" da tela de Produtos.",
    });
  }

  // 2. Margem
  for (const p of db.products) {
    const margin = p.price > 0 ? (p.price - p.cost) / p.price : 0;
    if (margin < 0.4) {
      tips.push({
        level: "serious", icon: "percent", title: `Margem apertada em "${p.name}" (${Math.round(margin * 100)}%)`,
        text: `Preço ${fmtMoney(p.price)} com custo ${fmtMoney(p.cost)}. Para doces artesanais, busque margem de 50–65%: renegocie insumos, reduza o custo da embalagem ou reajuste o preço em pequenos passos.`,
      });
    }
  }

  // 3. Campeão de vendas
  const ranked = Object.entries(sold30).sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    const best = db.products.find((p) => p.id === ranked[0][0]);
    if (best) {
      tips.push({
        level: "good", icon: "award", title: `"${best.name}" é o campeão dos últimos 30 dias`,
        text: `${fmtInt(ranked[0][1])} potes vendidos. Destaque-o nas redes sociais, garanta estoque extra para o fim de semana e use-o como porta de entrada para combos com sabores menos vendidos.`,
      });
    }
  }

  // 4. Sabores parados
  const slowMovers = db.products.filter((p) => (sold30[p.id] || 0) <= 2 && p.stock > 0);
  for (const p of slowMovers) {
    const hasPromo = db.promos.some((pr) => pr.productId === p.id && promoStatus(pr) === "ativa");
    if (!hasPromo) {
      tips.push({
        level: "info", icon: "tag", title: `"${p.name}" está vendendo pouco`,
        text: `Apenas ${fmtInt(sold30[p.id] || 0)} pote(s) em 30 dias com ${fmtInt(p.stock)} em estoque. Crie uma promoção relâmpago na aba Promoções — o desconto é aplicado automaticamente no carrinho.`,
      });
    }
  }

  // 5. Dias da semana
  const weekTotals = weekdayUnits(30);
  const maxDay = weekTotals.indexOf(Math.max(...weekTotals));
  const minDay = weekTotals.indexOf(Math.min(...weekTotals));
  if (weekTotals[maxDay] > 0 && maxDay !== minDay) {
    tips.push({
      level: "info", icon: "calendar", title: `${WEEKDAYS[maxDay]} é seu melhor dia; ${WEEKDAYS[minDay]}, o mais fraco`,
      text: `Concentre a produção na véspera de ${WEEKDAYS[maxDay]} e teste uma promoção "só hoje" para movimentar ${WEEKDAYS[minDay]}, como um desconto no segundo pote.`,
    });
  }

  // 6. Ticket médio
  if (sales30.length >= 5) {
    const revenue30 = sales30.reduce((a, s) => a + saleTotal(s), 0);
    const ticket = revenue30 / sales30.length;
    const avgPrice = db.products.length
      ? db.products.reduce((a, p) => a + p.price, 0) / db.products.length : 0;
    if (avgPrice && ticket < avgPrice * 1.5) {
      tips.push({
        level: "info", icon: "cart", title: `Ticket médio de ${fmtMoney(ticket)} — dá para aumentar`,
        text: "A maioria das vendas leva poucos potes. Ofereça combos (\"leve 3, pague menos\"), kit degustação com sabores variados ou brinde a partir de certo valor para puxar o ticket para cima.",
      });
    }
  }

  // 7. Promoções expiradas
  const expired = db.promos.filter((p) => promoStatus(p) === "expirada");
  if (expired.length >= 2) {
    tips.push({
      level: "info", icon: "archive", title: `${expired.length} promoções expiradas na lista`,
      text: "Elas já não têm efeito no carrinho. Exclua as antigas ou reaproveite as que funcionaram, ajustando as datas de vigência.",
    });
  }

  // 8. Pix
  const pixRevenue = sales30.filter((s) => s.payment === "Pix").reduce((a, s) => a + saleTotal(s), 0);
  const totalRevenue30 = sales30.reduce((a, s) => a + saleTotal(s), 0);
  if (totalRevenue30 > 0 && pixRevenue / totalRevenue30 < 0.4) {
    tips.push({
      level: "info", icon: "card", title: "Incentive o pagamento por Pix",
      text: "O Pix não tem taxa de máquina. Um desconto simbólico para Pix (1–2%) costuma sair mais barato do que a taxa do cartão e o dinheiro cai na hora.",
    });
  }

  // 9. Delivery
  const deliveryRevenue = sales30
    .filter((s) => (s.channel || "balcao") === "delivery")
    .reduce((a, s) => a + saleTotal(s), 0);
  if (totalRevenue30 > 0 && deliveryRevenue / totalRevenue30 < 0.15) {
    tips.push({
      level: "info", icon: "truck", title: "O delivery ainda é pequeno nas suas vendas",
      text: "Menos de 15% da receita vem de entregas. Divulgue a aba Loja nos stories e no status do WhatsApp com um horário fixo de entregas — pedido entregue em casa vira cliente recorrente.",
    });
  }

  if (!tips.length) {
    tips.push({
      level: "good", icon: "check", title: "Tudo em ordem por aqui",
      text: "Estoque saudável, margens boas e vendas equilibradas. Continue registrando cada venda para que as análises fiquem cada vez mais precisas.",
    });
  }
  return tips;
}

const ROADMAP = [
  { icon: "users", title: "Cadastro de clientes e fidelidade", text: "Registre nome e WhatsApp de quem compra. Um cartão fidelidade simples (a cada 10 potes, 1 grátis) aumenta a recompra — e a lista de contatos vira canal de divulgação de novos sabores." },
  { icon: "message", title: "Pedidos pelo WhatsApp com link do catálogo", text: "Divulgue um catálogo com fotos e preços e receba pedidos por mensagem. Registre-os aqui na aba Vendas para manter o histórico completo." },
  { icon: "clipboard", title: "Controle de insumos e validade", text: "Hoje o sistema controla potes prontos. O próximo passo é controlar ingredientes (leite condensado, creme de leite, embalagens) e datas de validade dos lotes produzidos." },
  { icon: "cloud", title: "Loja on-line de verdade (com servidor)", text: "Hoje a aba Loja funciona neste navegador e os pedidos de fora chegam pelo WhatsApp. O próximo passo é hospedar a loja com um banco de dados on-line, para o pedido do cliente cair aqui sozinho, de qualquer lugar." },
  { icon: "map", title: "Zonas de entrega com taxa automática", text: "A taxa de entrega hoje é digitada a cada venda. Evolua para uma tabela de bairros com taxa e tempo estimado — menos erro e mais transparência para o cliente." },
  { icon: "target", title: "Metas mensais", text: "Defina uma meta de receita por mês e acompanhe pelo dashboard. Meta visível muda comportamento: fica claro quando vale fazer uma promoção para fechar o mês." },
];

function renderTips() {
  const list = document.getElementById("tips-list");
  list.textContent = "";
  for (const tip of computeTips()) {
    list.append(el("div", { class: `tip ${tip.level}` }, [
      el("span", { class: "tip-icon" }, icon(tip.icon)),
      el("div", {}, [el("h3", {}, tip.title), el("p", {}, tip.text)]),
    ]));
  }
  const roadmap = document.getElementById("roadmap-list");
  roadmap.textContent = "";
  for (const item of ROADMAP) {
    roadmap.append(el("div", { class: "tip info" }, [
      el("span", { class: "tip-icon" }, icon(item.icon)),
      el("div", {}, [el("h3", {}, item.title), el("p", {}, item.text)]),
    ]));
  }
}

/* ============================================================
   LOJA (visão do cliente)
   Pedidos feitos aqui entram como encomendas pendentes no painel
   "Encomendas abertas" da aba Vendas.
   ============================================================ */

function shopCartLines() {
  // Descarta itens de produtos que foram excluídos do catálogo.
  state.shopCart = state.shopCart.filter((e) => db.products.some((p) => p.id === e.productId));
  return state.shopCart.map((entry) => {
    const product = db.products.find((p) => p.id === entry.productId);
    const promo = bestPromoFor(product.id, product.price);
    const discount = promo ? Math.round(promo.discountPerUnit * entry.qty * 100) / 100 : 0;
    return {
      product, qty: entry.qty, discount,
      promoName: promo?.name || null,
      subtotal: product.price * entry.qty - discount,
    };
  });
}

function shopAdd(productId, delta) {
  const entry = state.shopCart.find((e) => e.productId === productId);
  if (entry) {
    entry.qty += delta;
    if (entry.qty <= 0) state.shopCart = state.shopCart.filter((e) => e !== entry);
  } else if (delta > 0) {
    state.shopCart.push({ productId, qty: delta });
  }
  renderShop();
}

function renderShop() {
  const grid = document.getElementById("shop-grid");
  const cartBox = document.getElementById("shop-cart");
  grid.textContent = "";
  cartBox.textContent = "";

  const lines = shopCartLines();
  const qtyOf = (id) => lines.find((l) => l.product.id === id)?.qty || 0;

  if (!db.products.length) {
    grid.append(el("p", { class: "empty-msg" }, "O cardápio está sendo preparado. Volte em breve!"));
  }
  const sortedProducts = [...db.products].sort((a, b) => a.name.localeCompare(b.name));
  sortedProducts.forEach((p, idx) => {
    const promo = bestPromoFor(p.id, p.price);
    const priceLine = el("div", { class: "shop-price" });
    if (promo) {
      priceLine.append(
        el("s", {}, fmtMoney(p.price)), " ",
        el("strong", {}, fmtMoney(p.price - promo.discountPerUnit)),
        el("span", { class: "promo-tag" }, [icon("tag"), promo.name]),
      );
    } else {
      priceLine.append(el("strong", {}, fmtMoney(p.price)));
    }
    const qty = qtyOf(p.id);
    // "Foto" ilustrada: enquanto não há imagem real, um selo com o ícone do
    // produto (alterna bolo/cupcake) dá cara de cardápio de confeitaria.
    // Foto real quando cadastrada; senão, a ilustração de bolo no pote.
    const media = p.image
      ? el("img", { class: "shop-photo-img", src: p.image, alt: p.name, loading: "lazy" })
      : productArtwork(p.name);
    const photo = el("div", {
      class: `shop-item-photo tone-${idx % 4}${p.image ? " has-img" : ""}`,
    }, media);
    if (qty > 0) photo.append(el("span", { class: "shop-item-count" }, fmtInt(qty)));
    grid.append(el("div", { class: "shop-item" + (qty > 0 ? " in-cart" : "") }, [
      photo,
      el("div", { class: "shop-item-body" }, [
        el("div", { class: "shop-item-info" }, [
          el("h3", {}, p.name),
          priceLine,
          p.stock > 0
            ? el("span", { class: "badge good" }, "pronta entrega")
            : el("span", { class: "badge neutral" }, "sob encomenda"),
        ]),
        el("div", { class: "shop-stepper" }, [
          el("button", {
            type: "button", class: "btn small step", "aria-label": `Tirar um pote de ${p.name}`,
            onclick: () => shopAdd(p.id, -1),
          }, "−"),
          el("span", { class: "shop-qty", "aria-live": "polite" }, fmtInt(qty)),
          el("button", {
            type: "button", class: "btn small step", "aria-label": `Adicionar um pote de ${p.name}`,
            onclick: () => shopAdd(p.id, 1),
          }, "+"),
        ]),
      ]),
    ]));
  });

  let total = 0;
  if (!lines.length) {
    cartBox.append(el("p", { class: "empty-msg" }, "Escolha seus sabores no cardápio ao lado."));
  } else {
    for (const line of lines) {
      total += line.subtotal;
      cartBox.append(el("div", { class: "shop-cart-row" }, [
        el("span", {}, `${fmtInt(line.qty)}× ${line.product.name}`),
        el("strong", {}, fmtMoney(line.subtotal)),
      ]));
    }
  }
  document.getElementById("shop-total").textContent = fmtMoney(total);

  const dateInput = document.getElementById("shop-date");
  dateInput.min = todayISO();
  if (!dateInput.value || dateInput.value < todayISO()) dateInput.value = addDays(todayISO(), 1);
}

function submitShopOrder(ev) {
  ev.preventDefault();
  const lines = shopCartLines();
  const name = document.getElementById("shop-name").value.trim();
  const phone = document.getElementById("shop-phone").value.trim();
  const wantsDelivery = document.querySelector('input[name="shop-fulfil"]:checked').value === "entrega";
  const address = document.getElementById("shop-address").value.trim();
  const dueDate = document.getElementById("shop-date").value;

  if (!lines.length) { toast("Escolha ao menos um sabor no cardápio."); return; }
  if (!name || !phone) { toast("Informe seu nome e telefone para combinarmos a entrega."); return; }
  if (wantsDelivery && !address) { toast("Informe o endereço de entrega."); return; }
  if (!dueDate || dueDate < todayISO()) { toast("Escolha uma data válida para o pedido."); return; }

  const now = new Date();
  const sale = {
    id: uid(),
    dateISO: todayISO(),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    payment: "A combinar",
    status: "pendente",
    channel: "encomenda",
    customer: { name, phone, address: wantsDelivery ? address : "" },
    deliveryFee: 0,
    deliveryDate: dueDate,
    items: lines.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      unitPrice: line.product.price,
      unitCost: line.product.cost,
      qty: line.qty,
      discount: line.discount,
      promoName: line.promoName,
    })),
  };
  db.sales.push(sale);
  state.shopCart = [];
  saveDB();

  // Resumo para o cliente mandar no WhatsApp da loja.
  const summary = [
    "Olá! Acabei de fazer um pedido na loja Bolos da Bru.",
    ...sale.items.map((it) => `• ${it.qty}× ${it.name}`),
    `Total: ${fmtMoney(saleTotal(sale))}`,
    `Para: ${fmtDateBR(dueDate)} (${wantsDelivery ? "entrega em " + address : "retirada"})`,
    `Nome: ${name} — ${phone}`,
  ].join("\n");

  // Limpa o formulário antes de re-renderizar, para que renderShop reponha
  // a data padrão (o reset() zera o campo de data).
  document.getElementById("shop-form").reset();
  renderAll();
  const confirmation = document.getElementById("shop-confirmation");
  confirmation.textContent = "";
  confirmation.hidden = false;
  confirmation.append(
    el("div", { class: "tip good" }, [
      el("span", { class: "tip-icon" }, icon("check")),
      el("div", {}, [
        el("h3", {}, "Pedido enviado!"),
        el("p", {}, `Obrigada, ${name}! Seu pedido para ${fmtDateBR(dueDate)} entrou na fila de produção. Se quiser agilizar, mande o resumo no nosso WhatsApp:`),
        el("a", {
          class: "btn", target: "_blank", rel: "noopener",
          href: `https://wa.me/${db.settings.whatsapp || ""}?text=` + encodeURIComponent(summary),
        }, "Enviar resumo no WhatsApp"),
      ]),
    ]),
  );
  toast("Pedido registrado! Ele já aparece nas encomendas abertas.");
}

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

/* Acompanhamento: o cliente busca os próprios pedidos pelo telefone. Funciona
   com os pedidos registrados neste dispositivo/loja. */
function trackOrders() {
  const box = document.getElementById("track-result");
  box.textContent = "";
  const phone = onlyDigits(document.getElementById("track-phone").value);
  if (phone.length < 8) { toast("Digite o telefone completo, com DDD."); return; }

  const found = db.sales
    .filter((s) => s.customer && onlyDigits(s.customer.phone) === phone)
    .sort((a, b) => (b.deliveryDate || b.dateISO).localeCompare(a.deliveryDate || a.dateISO));

  if (!found.length) {
    box.append(el("p", { class: "empty-msg" },
      "Nenhum pedido encontrado para esse telefone. Confira o número ou fale com a gente no WhatsApp."));
    return;
  }
  const statusInfo = {
    pendente: { cls: "warning", label: "Em produção" },
    ok: { cls: "good", label: "Concluído" },
    cancelled: { cls: "critical", label: "Cancelado" },
  };
  for (const s of found) {
    const info = statusInfo[s.status] || statusInfo.pendente;
    const items = s.items.map((it) => `${it.qty}× ${it.name}`).join(", ");
    box.append(el("div", { class: "track-item" }, [
      el("div", { class: "track-item-head" }, [
        el("span", { class: `badge ${info.cls}` }, info.label),
        el("span", { class: "track-date" },
          (s.deliveryDate ? "Entrega " + fmtDateBR(s.deliveryDate) : fmtDateBR(s.dateISO))),
      ]),
      el("div", { class: "track-item-body" }, items),
      el("strong", {}, fmtMoney(saleTotal(s))),
    ]));
  }
}

/* Cadastro de novidades: guarda o contato para avisos de sabores e promoções. */
function submitSignup(ev) {
  ev.preventDefault();
  const name = document.getElementById("signup-name").value.trim();
  const phone = document.getElementById("signup-phone").value.trim();
  const box = document.getElementById("signup-result");
  if (!name || onlyDigits(phone).length < 8) {
    toast("Informe seu nome e um telefone válido com DDD."); return;
  }
  const digits = onlyDigits(phone);
  const already = db.subscribers.some((s) => onlyDigits(s.phone) === digits);
  if (!already) db.subscribers.push({ id: uid(), name, phone, since: todayISO() });
  saveDB();
  document.getElementById("signup-form").reset();
  box.textContent = "";
  box.append(el("div", { class: "tip good" }, [
    el("span", { class: "tip-icon" }, icon("check")),
    el("div", {}, [
      el("h3", {}, already ? "Você já está na lista!" : "Cadastro feito!"),
      el("p", {}, already
        ? "Esse telefone já recebe nossas novidades. Fique de olho no WhatsApp. 💛"
        : `Prontinho, ${name}! Você vai receber os sabores da semana e as promoções em primeira mão.`),
    ]),
  ]));
  toast(already ? "Esse contato já estava cadastrado." : "Cadastro realizado com sucesso!");
}

/* ============================================================
   Navegação, eventos e inicialização
   ============================================================ */

function switchView(view) {
  // O cliente só tem acesso à Loja — qualquer navegação recai nela.
  if (currentRole === "cliente") view = "loja";
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `view-${view}`);
  });
}

/* ---------- Autenticação e perfis ---------- */

function readSession() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

function applyRole(username) {
  const acc = ACCOUNTS[username];
  if (!acc) return;
  currentRole = acc.role;
  document.body.classList.toggle("role-cliente", acc.role === "cliente");
  document.body.classList.toggle("role-admin", acc.role === "admin");
  document.getElementById("user-badge").textContent = acc.name;
  document.getElementById("login-gate").hidden = true;
  // A vitrine do cliente nunca deve ficar vazia: se ainda não há produtos
  // (visitante num navegador novo), carrega o cardápio de exemplo.
  if (acc.role === "cliente" && !db.products.length) {
    seedDemoData();
    saveDB();
    renderAll();
  }
  switchView(acc.role === "cliente" ? "loja" : "dashboard");
  renderShop(); // garante cardápio e data preenchidos ao entrar
}

function doLogin(username, password) {
  const acc = ACCOUNTS[username];
  if (!acc || acc.password !== password) return false;
  try { localStorage.setItem(SESSION_KEY, username); } catch { /* sem persistência */ }
  applyRole(username);
  return true;
}

function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* sem persistência */ }
  currentRole = null;
  document.body.classList.remove("role-cliente", "role-admin");
  document.getElementById("login-form").reset();
  document.getElementById("login-error").hidden = true;
  document.getElementById("login-gate").hidden = false;
}

function renderAll() {
  const isEmpty = !db.products.length && !db.sales.length;
  document.getElementById("welcome-banner").hidden = !isEmpty;
  renderDashboard();
  renderSaleProductSelect();
  renderCart();
  renderSalesTable();
  renderOrders();
  renderProductsTable();
  renderPromoProductSelect();
  renderPromosTable();
  renderTips();
  renderShop();
}

function bindEvents() {
  document.getElementById("login-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value;
    const errorEl = document.getElementById("login-error");
    if (doLogin(user, pass)) {
      document.getElementById("login-form").reset();
      errorEl.hidden = true;
    } else {
      errorEl.textContent = "Usuário ou senha inválidos.";
      errorEl.hidden = false;
    }
  });
  document.querySelectorAll(".login-demo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("login-user").value = btn.dataset.user;
      document.getElementById("login-pass").value = btn.dataset.pass;
      doLogin(btn.dataset.user, btn.dataset.pass);
    });
  });
  document.getElementById("btn-logout").addEventListener("click", logout);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  document.querySelectorAll("#range-filters .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#range-filters .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.rangeDays = Number(chip.dataset.days);
      renderDashboard();
    });
  });

  document.getElementById("btn-add-cart").addEventListener("click", addToCart);
  document.getElementById("btn-confirm-sale").addEventListener("click", confirmSale);
  document.getElementById("btn-export-csv").addEventListener("click", exportSalesCSV);

  document.querySelectorAll('input[name="channel"]').forEach((radio) => {
    radio.addEventListener("change", updateSaleFormUI);
  });
  document.getElementById("sale-fee").addEventListener("input", renderCart);

  document.getElementById("shop-form").addEventListener("submit", submitShopOrder);
  document.querySelectorAll('input[name="shop-fulfil"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const wantsDelivery = document.querySelector('input[name="shop-fulfil"]:checked').value === "entrega";
      document.getElementById("shop-address-field").hidden = !wantsDelivery;
    });
  });
  document.getElementById("btn-track").addEventListener("click", trackOrders);
  document.getElementById("track-phone").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); trackOrders(); }
  });
  document.getElementById("signup-form").addEventListener("submit", submitSignup);

  document.getElementById("product-form").addEventListener("submit", submitProductForm);
  document.getElementById("btn-cancel-edit").addEventListener("click", resetProductForm);
  document.getElementById("product-image").addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    processImage(file, 640, (dataUrl) => {
      if (!dataUrl) { toast("Não foi possível ler essa imagem."); return; }
      state.productImage = dataUrl;
      updateProductImagePreview();
    });
  });
  document.getElementById("btn-remove-image").addEventListener("click", () => {
    state.productImage = null;
    document.getElementById("product-image").value = "";
    updateProductImagePreview();
  });

  document.getElementById("promo-form").addEventListener("submit", submitPromoForm);
  document.getElementById("btn-cancel-promo-edit").addEventListener("click", resetPromoForm);
  document.getElementById("promo-type").addEventListener("change", () => applyPromoValueMode(true));

  // Máscara de moeda (Real) nos campos de valor
  ["product-price", "product-cost", "sale-fee", "promo-value"].forEach((id) => {
    attachMoneyMask(document.getElementById(id));
  });
  // Máscara de telefone (padrão brasileiro) nos campos de contato
  ["sale-phone", "shop-phone", "track-phone", "signup-phone"].forEach((id) => {
    attachPhoneMask(document.getElementById(id));
  });

  const loadDemo = (needsConfirm) => {
    if (needsConfirm && (db.products.length || db.sales.length)
        && !confirm("Substituir os dados atuais pelos dados de exemplo?")) return;
    seedDemoData();
    saveDB();
    state.cart = [];
    state.shopCart = [];
    renderAll();
    toast("Dados de exemplo carregados. Para usar de verdade, apague-os na aba Dicas.");
  };
  document.getElementById("btn-load-demo").addEventListener("click", () => loadDemo(false));
  document.getElementById("btn-reset-demo").addEventListener("click", () => loadDemo(true));
  document.getElementById("btn-goto-products").addEventListener("click", () => {
    switchView("produtos");
    document.getElementById("product-name").focus();
  });

  document.getElementById("btn-save-config").addEventListener("click", () => {
    const digits = document.getElementById("cfg-whatsapp").value.replace(/\D/g, "");
    db.settings.whatsapp = digits;
    document.getElementById("cfg-whatsapp").value = digits;
    saveDB();
    toast(digits
      ? "WhatsApp da loja salvo. Os pedidos da Loja agora chegam no seu número."
      : "WhatsApp removido das configurações.");
  });
  document.getElementById("btn-clear-data").addEventListener("click", () => {
    if (!confirm("Apagar TODOS os produtos, vendas e promoções? Essa ação não tem volta.")) return;
    db.products = []; db.sales = []; db.promos = []; db.subscribers = [];
    saveDB();
    state.cart = [];
    renderAll();
    toast("Dados apagados. Comece cadastrando seus produtos.");
  });

  // Re-renderiza os gráficos quando o tema do sistema muda (cores via CSS vars
  // são lidas em JS para SVG/tooltip).
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderDashboard);
}

loadDB();
bindEvents();
resetPromoForm();
updateSaleFormUI();
document.getElementById("cfg-whatsapp").value = db.settings.whatsapp || "";
renderAll();

// Restaura a sessão salva; sem sessão válida, mostra a tela de login.
const savedSession = readSession();
if (savedSession && ACCOUNTS[savedSession]) applyRole(savedSession);
else document.getElementById("login-gate").hidden = false;
