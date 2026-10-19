const DEFAULT_CONFIG = {
  dataMode: 'demo',
  productsFile: 'data/products.json',
  googleSheetsUrl: '',
  googleSheetsCsvUrl: '',
  proxyUrl: '',
  appName: 'Old Mill',
  showDemoLabels: true,
};

const config = { ...DEFAULT_CONFIG, ...(window.OLD_MILL_CONFIG || {}) };
const {
  priceToString,
  getAvailableCategories,
  sortProducts,
  slugify,
  fetchDemoProducts,
  fetchGoogleSheetsProducts,
  getAcceptableDataSource,
} = window.OldMillDataAdapter || {};

const catalogEl = document.getElementById('catalog');
const categoryBarEl = document.getElementById('category-bar');
const statusEl = document.getElementById('status-region');

let currentCategory = null;
let allProducts = [];
let categorySections = [];
let navFrame = null;

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function getStickyOffset() {
  const topbar = document.querySelector('.topbar');
  const categoryBar = document.querySelector('.category-bar');
  return (topbar ? topbar.offsetHeight : 0) + (categoryBar ? categoryBar.offsetHeight : 0) + 10;
}

function setActiveCategory(categoryName, { scrollIntoView = false } = {}) {
  if (!categoryName || !categoryBarEl) return;

  currentCategory = categoryName;
  const categoryId = slugify(categoryName);

  categoryBarEl.querySelectorAll('.category-pill').forEach((button) => {
    const isActive = button.dataset.categoryId === categoryId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  if (scrollIntoView) {
    const activeButton = categoryBarEl.querySelector(`.category-pill[data-category-id="${categoryId}"]`);
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }
  }
}

function renderCategoryChips(categories) {
  if (!categoryBarEl) return;

  if (!categories.length) {
    currentCategory = null;
    categoryBarEl.innerHTML = '';
    return;
  }

  const firstCategory = currentCategory || categories[0].name;
  currentCategory = firstCategory;

  categoryBarEl.innerHTML = categories.map((category) => {
    const slug = slugify(category.name);
    const isActive = category.name === firstCategory;
    return `
      <button
        type="button"
        class="category-pill ${isActive ? 'is-active' : ''}"
        role="tab"
        aria-selected="${isActive}"
        data-category-name="${category.name}"
        data-category-id="${slug}"
        tabindex="${isActive ? 0 : -1}"
      >
        ${category.name}
      </button>
    `;
  }).join('');

  categoryBarEl.querySelectorAll('.category-pill').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedCategory = button.dataset.categoryName;
      if (!selectedCategory) return;

      setActiveCategory(selectedCategory, { scrollIntoView: true });

      const target = document.getElementById(`section-${slugify(selectedCategory)}`);
      if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - getStickyOffset() - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  setActiveCategory(firstCategory, { scrollIntoView: true });
}

function buildProductCard(product) {
  const hasImage = Boolean(product.image && product.image.trim());

  return `
    <article class="product-card ${hasImage ? 'has-image' : 'no-image'}" aria-label="${product.name}">
      ${hasImage ? `
        <div class="product-image-shell">
          <img
            src="${product.image}"
            alt="${product.name}"
            class="product-image"
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror="this.onerror=null;this.style.display='none';"
          />
        </div>
      ` : ''}

      <div class="product-info">
        <div class="product-header">
          <h3 class="product-name">${product.name}</h3>
        </div>

        ${product.description ? `<p class="product-description">${product.description}</p>` : ''}

        ${product.allergens && product.allergens.length ? `<p class="product-allergens">Allergeni: ${product.allergens.join(', ')}</p>` : ''}
      </div>

      <div class="product-price">
        <span class="price-tag">${priceToString(product.price)}</span>
      </div>
    </article>
  `;
}

function updateActiveCategoryFromScroll() {
  if (!categorySections.length) return;

  const scrollPosition = window.scrollY + getStickyOffset() + 12;
  const isNearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 24;

  let selectedSection = categorySections[0];

  if (isNearBottom) {
    selectedSection = categorySections[categorySections.length - 1];
  } else {
    for (const section of categorySections) {
      if (section.offsetTop <= scrollPosition) {
        selectedSection = section;
      } else {
        break;
      }
    }
  }

  const selectedCategoryName = selectedSection?.dataset.categoryName || currentCategory;
  if (selectedCategoryName && selectedCategoryName !== currentCategory) {
    setActiveCategory(selectedCategoryName, { scrollIntoView: false });
  }
}

function scheduleCategorySync() {
  if (navFrame) return;
  navFrame = window.requestAnimationFrame(() => {
    navFrame = null;
    updateActiveCategoryFromScroll();
  });
}

function refreshCategorySections() {
  categorySections = [...document.querySelectorAll('.category-section')].filter((section) => section.id);
}

function renderCatalog(categories) {
  const visibleCategories = categories.filter((category) => category.products.length > 0);

  if (!visibleCategories.length) {
    catalogEl.innerHTML = `
      <div class="empty-state" role="status">
        <strong>Nessun prodotto disponibile</strong>
        Torna presto per scoprire le novità di Old Mill.
      </div>
    `;
    categorySections = [];
    return;
  }

  catalogEl.innerHTML = visibleCategories.map((category) => {
    const filteredProducts = sortProducts(category.products).filter((product) => product.visible);

    return `
      <section id="section-${slugify(category.name)}" class="category-section" data-category-name="${category.name}">
        <div class="category-header">
          <h2 class="category-title">${category.name}</h2>
        </div>

        <div class="product-list">
          ${filteredProducts.map(buildProductCard).join('')}
        </div>
      </section>
    `;
  }).join('') + `
    <div class="menu-note" role="note">
      Informazioni allergeni: da verificare e confermare con il gestore prima della pubblicazione definitiva.
    </div>
  `;

  refreshCategorySections();
  updateActiveCategoryFromScroll();
}

function renderLoadingState() {
  catalogEl.innerHTML = `
    <div class="loading-state" role="status">
      <strong>Caricamento menu</strong>
      Stiamo preparando le proposte di Old Mill...
    </div>
  `;
}

function renderErrorState(message) {
  catalogEl.innerHTML = `
    <div class="error-state" role="alert">
      <strong>Menu momentaneamente non disponibile</strong>
      ${message}
    </div>
  `;
}

async function loadMenu() {
  renderLoadingState();

  try {
    let products = [];
    const mode = getAcceptableDataSource(config);

    if (mode === 'google-sheets') {
      products = await fetchGoogleSheetsProducts(config);
    } else {
      products = await fetchDemoProducts(config);
    }

    const visibleProducts = products.filter((product) => product.visible);
    if (!visibleProducts.length) {
      renderCatalog([]);
      renderCategoryChips([]);
      return;
    }

    allProducts = visibleProducts;
    const categories = getAvailableCategories(allProducts);
    renderCategoryChips(categories);
    renderCatalog(categories);
    setStatus(`Menu caricato: ${visibleProducts.length} prodotti in ${categories.length} categorie.`);
  } catch (error) {
    console.error('loadMenu failed', error);
    setStatus('Errore durante il caricamento del menu.');

    if (getAcceptableDataSource(config) === 'google-sheets') {
      const message = error && error.message ? error.message : 'Il foglio Google non è raggiungibile.';
      renderErrorState(
        'Il file Google non è raggiungibile. Verifica il link CSV pubblico, la pubblicazione del foglio e il CORS/redirect. Se serve, usa il proxy Cloudflare Pages in sola lettura.'
      );
      console.warn(message);
      return;
    }

    renderErrorState('Il file demo non è disponibile. Verifica la cartella data e il server locale.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadMenu();
  window.addEventListener('scroll', scheduleCategorySync, { passive: true });
  window.addEventListener('resize', scheduleCategorySync);
});
