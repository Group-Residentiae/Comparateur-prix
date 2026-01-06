(() => {
  const mounts = Array.from(document.querySelectorAll(".pcw-garden-widget"));
  if (!mounts.length) return;

  mounts.forEach((mount) => {
    const TITLE = "Comparateur de prix — Accessoires de Jardinage";
    const SUBTITLE = "Choisis une catégorie puis slide horizontalement sur les produits.";
    const AFFILIZZ_SCRIPT_SRC = "https://sc.affilizz.com/affilizz.js";
    const CSV_URL = mount.getAttribute("data-csv-url");

    if (!CSV_URL) {
      mount.innerHTML = `<div class="pcw-state"><strong>CSV manquant.</strong><br/>Ajoute <code>data-csv-url</code> sur <code>.pcw-garden-widget</code>.</div>`;
      return;
    }

    /**
     * =========================
     * ICONS (à configurer)
     * =========================
     * 👉 Le plus simple :
     * 1) Crée un dossier /icons dans ton repo GitHub Pages
     * 2) Uploade tes PNG
     * 3) Mets les URLs ci-dessous
     *
     * Exemple (à adapter) :
     * https://group-residentiae.github.io/Comparateur-prix/icons/recuperateur-pluie.png
     * https://group-residentiae.github.io/Comparateur-prix/icons/rouleau-gazon.png
     */
    const ICONS = {
      products: {
        // mapping par "nom normalisé" (sans accents, minuscules)
        "recuperateur de pluie": "https://group-residentiae.github.io/Comparateur-prix/icons/recuperateur-pluie.png",
        "rouleau a gazon": "https://group-residentiae.github.io/Comparateur-prix/icons/rouleau-gazon.png",
      },
      categories: {
        // mapping par catégorie (optionnel)
        // (logique : Arrosage -> récupérateur, Gazon -> rouleau)
        "arrosage": "https://group-residentiae.github.io/Comparateur-prix/icons/recuperateur-pluie.png",
        "gazon": "https://group-residentiae.github.io/Comparateur-prix/icons/rouleau-gazon.png",
      }
    };

    // -------------------------
    // Resize helper (si intégré via iframe)
    // -------------------------
    function postHeight() {
      const h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );
      try {
        window.parent && window.parent.postMessage({ type: "pcw:resize", height: h }, "*");
      } catch (e) {}
    }
    try {
      const ro = new ResizeObserver(() => postHeight());
      ro.observe(document.documentElement);
      window.addEventListener("load", () => setTimeout(postHeight, 50));
    } catch (e) {}

    // -------------------------
    // Affilizz loader
    // -------------------------
    function loadAffilizzOnce() {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${AFFILIZZ_SCRIPT_SRC}"]`);
        if (existing) {
          if (existing.dataset && existing.dataset.loaded === "1") return resolve();
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", () => reject(new Error("Affilizz script failed")), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = AFFILIZZ_SCRIPT_SRC;
        s.async = true;
        s.type = "text/javascript";
        s.addEventListener("load", () => { s.dataset.loaded = "1"; resolve(); });
        s.addEventListener("error", () => reject(new Error("Affilizz script failed")));
        document.head.appendChild(s);
      });
    }

    // -------------------------
    // Utils
    // -------------------------
    function norm(s){
      return (s ?? "")
        .toString()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .trim();
    }
    function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }
    function escapeHtml(str){
      return String(str ?? "")
        .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
        .replaceAll('"',"&quot;").replaceAll("'","&#039;");
    }
    function escapeAttr(str){ return escapeHtml(str).replaceAll("\n"," ").trim(); }

    // CSV parsing
    function detectDelimiter(line){
      const commas = (line.match(/,/g) || []).length;
      const semis  = (line.match(/;/g) || []).length;
      return semis > commas ? ";" : ",";
    }
    function splitCSVLine(line, sep){
      const out = [];
      let cur = "", inQ = false;
      for (let i=0;i<line.length;i++){
        const ch = line[i];
        if (inQ){
          if (ch === '"'){
            if (line[i+1] === '"'){ cur += '"'; i++; }
            else inQ = false;
          } else cur += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === sep){ out.push(cur); cur=""; }
          else cur += ch;
        }
      }
      out.push(cur);
      return out;
    }
    function parseCSV(text){
      const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l => l.trim().length);
      if (!lines.length) return { headers: [], rows: [], sep: "," };
      const sep = detectDelimiter(lines[0]);
      const headers = splitCSVLine(lines[0], sep).map(h => h.trim());
      const rows = lines.slice(1).map(l => splitCSVLine(l, sep));
      return { headers, rows, sep };
    }
    function mapRows(headers, rows){
      const map = {};
      headers.forEach((h, i) => { map[norm(h)] = i; });

      const idxOf = (...keys) => {
        for (const k of keys){
          const idx = map[norm(k)];
          if (idx != null && idx >= 0) return idx;
        }
        return -1;
      };

      // ✅ on garde sous-catégorie si présente (mais UI ne l’affiche pas)
      const iCat    = idxOf("Catégorie","Categorie","Category");
      const iSub    = idxOf("Sous-catégorie","Sous-categorie","Subcategory","Sous cat","Sous-cat");
      const iProd   = idxOf("title","Titre","Produit","Product","Nom","name");
      const iOffers = idxOf("Nb d'offres","Nombre d'offres","offers","nb_offres");
      const iRefs   = idxOf("Nb de références","Nb de references","references","refs","nb_references");
      const iPid    = idxOf("publication_content_id","publication content id","pubid","publication-id");

      const out = [];
      for (const r of rows){
        const get = (i) => (i >= 0 && i < r.length) ? String(r[i] ?? "").trim() : "";
        const product = get(iProd);
        if (!product) continue;

        out.push({
          category: get(iCat),
          subcategory: get(iSub),
          product,
          offers: get(iOffers),
          refs: get(iRefs),
          publication_content_id: get(iPid),
        });
      }
      return out;
    }

    // -------------------------
    // Icons helpers
    // -------------------------
    function iconForProduct(productName){
      const key = norm(productName);
      // match exact
      if (ICONS.products[key]) return ICONS.products[key];
      // match contains (au cas où ton CSV a "Récupérateur de pluie 300L")
      for (const k in ICONS.products){
        if (key.includes(k)) return ICONS.products[k];
      }
      return "";
    }

    function iconForCategory(categoryName){
      const key = norm(categoryName);
      return ICONS.categories[key] || "";
    }

    function iconImg(url, alt){
      if (!url) return "";
      return `<img class="pcw-ico" src="${escapeAttr(url)}" alt="${escapeAttr(alt || "")}" loading="lazy" decoding="async" fetchpriority="low">`;
    }

    // -------------------------
    // Render base HTML
    // -------------------------
    mount.innerHTML = `
      <section class="pcw-wrap" aria-label="${escapeAttr(TITLE)}">
        <div class="pcw-inner">
          <div class="pcw-header">
            <div>
              <h3 class="pcw-title">${escapeHtml(TITLE)}</h3>
              <p class="pcw-sub">${escapeHtml(SUBTITLE)}</p>
            </div>
          </div>

          <div class="pcw-chips" role="tablist" aria-label="Catégories" data-slot="cats">
            <button class="pcw-chip" type="button" aria-pressed="true" data-cat="Tout">
              Tout
            </button>
          </div>

          <div class="pcw-results-head">
            <div class="pcw-results-count" data-slot="count">Produits : —</div>
            <button class="pcw-reset" type="button" data-action="reset">Réinitialiser</button>
          </div>

          <div class="pcw-carousel" data-slot="carousel" aria-label="Produits (défilement horizontal)">
            <div class="pcw-skeleton"></div>
            <div class="pcw-skeleton"></div>
            <div class="pcw-skeleton"></div>
          </div>
        </div>
      </section>
    `;

    const $ = (sel) => mount.querySelector(sel);
    const $$ = (sel) => Array.from(mount.querySelectorAll(sel));

    const state = { raw: [], cat: "Tout" };

    function setCount(n){
      $('[data-slot="count"]').textContent = `Produits : ${n}`;
      postHeight();
    }

    function setChips(categories){
      const catsEl = $('[data-slot="cats"]');
      const cats = ["Tout", ...categories.sort((a,b)=>a.localeCompare(b,"fr"))];

      catsEl.innerHTML = cats.map((c, i) => {
        const ico = (c === "Tout") ? "" : iconForCategory(c);
        return `
          <button class="pcw-chip" type="button" aria-pressed="${i===0 ? "true":"false"}" data-cat="${escapeAttr(c)}">
            ${ico ? iconImg(ico, c) : ""}
            ${escapeHtml(c)}
          </button>
        `;
      }).join("");

      $$(".pcw-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          $$(".pcw-chip").forEach(b => b.setAttribute("aria-pressed","false"));
          btn.setAttribute("aria-pressed","true");
          state.cat = btn.dataset.cat || "Tout";
          render();
        });
      });
    }

    function applyFilters(){
      let list = state.raw.slice();
      if (state.cat !== "Tout") list = list.filter(r => r.category === state.cat);
      return list;
    }

    function renderAffilizz(mountEl, publicationId){
      mountEl.innerHTML = "";
      const el = document.createElement("affilizz-rendering-component");
      el.setAttribute("loading", "lazy");
      el.setAttribute("publication-content-id", publicationId);
      mountEl.appendChild(el);
    }

    function openOffers(card){
      const pubId = (card.getAttribute("data-pubid") || "").trim();
      const panel = card.querySelector('[data-slot="offers"]');
      const status = card.querySelector('[data-slot="offersStatus"]');
      const mountEl = card.querySelector('[data-slot="offersMount"]');

      panel.style.display = "block";
      postHeight();

      if (!pubId){
        status.textContent = "Aucune offre (publication_content_id manquant).";
        mountEl.innerHTML = "";
        postHeight();
        return;
      }

      status.textContent = "Chargement…";
      postHeight();

      loadAffilizzOnce()
        .then(() => {
          renderAffilizz(mountEl, pubId);
          status.textContent = "";
          setTimeout(postHeight, 80);
        })
        .catch(() => {
          status.textContent = "Comparateur indisponible pour le moment.";
          mountEl.innerHTML = "";
          postHeight();
        });
    }

    function closeOffers(card){
      const panel = card.querySelector('[data-slot="offers"]');
      const status = card.querySelector('[data-slot="offersStatus"]');
      const mountEl = card.querySelector('[data-slot="offersMount"]');
      panel.style.display = "none";
      status.textContent = "";
      mountEl.innerHTML = "";
      postHeight();
    }

    function render(){
      const list = applyFilters();
      setCount(list.length);

      const carousel = $('[data-slot="carousel"]');

      if (!list.length){
        carousel.innerHTML = `<div class="pcw-state"><strong>Aucun produit.</strong><br/>Change de catégorie ou réinitialise.</div>`;
        postHeight();
        return;
      }

      carousel.innerHTML = list.map((r) => {
        const offers = (r.offers || "").toString().replace(/[^\d]/g,"");
        const refs   = (r.refs   || "").toString().replace(/[^\d]/g,"");
        const nOffers = offers ? Number(offers) : null;
        const nRefs   = refs ? Number(refs) : null;

        const prodIcon = iconForProduct(r.product);

        return `
          <article class="pcw-card" data-pubid="${escapeAttr(r.publication_content_id || "")}">
            <h4 class="pcw-name">
              ${prodIcon ? iconImg(prodIcon, r.product) : ""}
              ${escapeHtml(r.product || "Produit")}
            </h4>

            <div class="pcw-pills">
              ${nOffers != null && !Number.isNaN(nOffers) ? `<span class="pcw-pill">${nOffers} offres</span>` : ``}
              ${nRefs   != null && !Number.isNaN(nRefs)   ? `<span class="pcw-pill">${nRefs} références</span>` : ``}
            </div>

            <div class="pcw-card-bottom">
              <button class="pcw-cta" type="button" data-action="toggleOffers">Afficher les offres</button>
            </div>

            <div class="pcw-offers" data-slot="offers" style="display:none;">
              <div class="pcw-offersTop">
                <button class="pcw-closeOffers" type="button" data-action="closeOffers">Fermer</button>
              </div>
              <p class="pcw-offersStatus" data-slot="offersStatus">Chargement…</p>
              <div data-slot="offersMount"></div>
            </div>
          </article>
        `;
      }).join("");

      postHeight();
    }

    // -------------------------
    // Events
    // -------------------------
    mount.addEventListener("click", (e) => {
      const card = e.target.closest(".pcw-card");
      if (!card) return;

      const openBtn = e.target.closest('button[data-action="toggleOffers"]');
      const closeBtn = e.target.closest('button[data-action="closeOffers"]');

      if (closeBtn){ e.preventDefault(); closeOffers(card); return; }
      if (openBtn){
        e.preventDefault();
        const panel = card.querySelector('[data-slot="offers"]');
        const isOpen = panel && panel.style.display !== "none";
        if (isOpen) closeOffers(card); else openOffers(card);
      }
    });

    const resetBtn = mount.querySelector('[data-action="reset"]');
    if (resetBtn){
      resetBtn.addEventListener("click", () => {
        state.cat = "Tout";
        $$(".pcw-chip").forEach((b,i)=>b.setAttribute("aria-pressed", i===0 ? "true":"false"));
        render();
      });
    }

    // -------------------------
    // Boot
    // -------------------------
    (async () => {
      try {
        const url = CSV_URL + (CSV_URL.includes("?") ? "&" : "?") + "_=" + Date.now();
        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();

        const parsed = parseCSV(text);
        state.raw = mapRows(parsed.headers, parsed.rows);

        const categories = uniq(state.raw.map(r => r.category)).filter(Boolean);
        setChips(categories);

        render();
        setTimeout(postHeight, 80);
      } catch (err) {
        console.error("[PCW] CSV error:", err);
        $('[data-slot="carousel"]').innerHTML = `<div class="pcw-state"><strong>Impossible de charger le CSV.</strong><br/>Vérifie l’URL et la console.</div>`;
        setCount("—");
        postHeight();
      }
    })();
  });
})();
