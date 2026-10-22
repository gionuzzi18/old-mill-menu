const DEFAULT_CONFIG = {
  dataMode: 'google-sheets',
  productsFile: 'data/products.json',
  googleSheetsUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2DtC7AWHz8y7Z3bvztl6SDkXBtz77UNm9wyR-RAyoKMiubPleYRPjvo6eC759I-1TOOvJF6YrFqk7/pub?gid=0&single=true&output=csv',
  googleSheetsCsvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2DtC7AWHz8y7Z3bvztl6SDkXBtz77UNm9wyR-RAyoKMiubPleYRPjvo6eC759I-1TOOvJF6YrFqk7/pub?gid=0&single=true&output=csv',
  proxyUrl: '',
  appName: 'Old Mill',
  showDemoLabels: true,
};

const MACRO_GROUPS = {
  Dolci: ['Caffetteria', 'Colazione', 'Pasticceria', 'Gelateria'],
  Salato: ['Rosticceria', 'Piadine e Pucce'],
  Bevande: ['Soft Drink', 'Cioccolate Calde', 'Tè e Infusi'],
  Alcolici: ['Cocktail', 'Amari', 'Cognac e Brandy', 'Whisky', 'Rum', 'Grappe'],
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
const macroGroupBarEl = document.getElementById('macro-group-bar');
const categoryBarEl = document.getElementById('category-bar');
const statusEl = document.getElementById('status-region');

let allProducts = [];
let allCategories = [];
let activeState = {
  activeGroup: 'Dolci',
  activeCategory: 'Caffetteria',
  expandedCategory: 'Caffetteria',
};
let pendingCategoryScroll = null;
let pendingCategoryScrollFrame = null;

const GRAPPE_SUBSECTIONS = {
  Barrique: [
    'grappe-18-lune',
    'grappe-castagner-amarone',
    'grappe-903-barricata',
    'grappe-poli-24-carati-oro',
  ],
  Chiara: [
    'grappe-poli-classica',
    'grappe-903-tipica',
    'grappe-nardini',
    'grappe-julia',
    'grappe-friulana',
  ],
};

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function normalizeGroupKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveCategoryGroup(categoryName) {
  if (!categoryName) return 'Altro';

  const key = normalizeGroupKey(categoryName);
  const aliasMap = new Map();

  Object.entries(MACRO_GROUPS).forEach(([groupName, items]) => {
    items.forEach((item) => aliasMap.set(normalizeGroupKey(item), groupName));
  });

  aliasMap.set('cioccolata calda', 'Bevande');
  aliasMap.set('cioccolate calde', 'Bevande');
  aliasMap.set('cioccolate calda', 'Bevande');
  aliasMap.set('te e infusi', 'Bevande');
  aliasMap.set('te infusi', 'Bevande');

  return aliasMap.get(key) || 'Altro';
}

function buildMacroGroups(categories) {
  const groups = [];
  const usedCategoryNames = new Set();

  Object.entries(MACRO_GROUPS).forEach(([groupName, items]) => {
    const groupCategories = categories.filter((category) => items.includes(category.name));
    if (!groupCategories.length) return;

    groupCategories.forEach((category) => usedCategoryNames.add(category.name));
    groups.push({ name: groupName, categories: groupCategories });
  });

  const otherCategories = categories.filter((category) => !usedCategoryNames.has(category.name));
  if (otherCategories.length) {
    groups.push({ name: 'Altro', categories: otherCategories });
  }

  return groups;
}

function getGroupCategories(groupName, categories) {
  const groups = buildMacroGroups(categories);
  const match = groups.find((group) => group.name === groupName);
  return match ? match.categories : [];
}

function renderMacroGroupChips(groups) {
  if (!macroGroupBarEl || !groups.length) return;

  const selectedGroup = groups.some((group) => group.name === activeState.activeGroup)
    ? activeState.activeGroup
    : groups[0].name;

  activeState.activeGroup = selectedGroup;

  macroGroupBarEl.innerHTML = groups.map((group) => `
    <button type="button" class="macro-chip ${group.name === selectedGroup ? 'is-active' : ''}" data-group-name="${group.name}" role="tab" aria-selected="${group.name === selectedGroup}" tabindex="${group.name === selectedGroup ? 0 : -1}">${group.name}</button>
  `).join('');
}

function renderCategoryChips(categories) {
  if (!categoryBarEl) return;

  const visibleCategories = categories && categories.length ? categories : allCategories;
  if (!visibleCategories.length) {
    categoryBarEl.innerHTML = '';
    return;
  }

  const chosenCategory = visibleCategories.some((category) => category.name === activeState.activeCategory)
    ? activeState.activeCategory
    : visibleCategories[0].name;

  activeState.activeCategory = chosenCategory;
  if (!activeState.expandedCategory || !visibleCategories.some((category) => category.name === activeState.expandedCategory)) {
    activeState.expandedCategory = chosenCategory;
  }

  categoryBarEl.innerHTML = visibleCategories.map((category) => `
    <button type="button" class="category-pill ${category.name === chosenCategory ? 'is-active' : ''}" role="tab" aria-selected="${category.name === chosenCategory}" data-category-name="${category.name}" data-category-id="${slugify(category.name)}" tabindex="${category.name === chosenCategory ? 0 : -1}">${category.name}</button>
  `).join('');
}

function setSectionExpanded(sectionName, shouldOpen) {
  const sections = document.querySelectorAll('.category-section');
  const nextOpen = shouldOpen ? sectionName : null;
  activeState.expandedCategory = nextOpen;

  sections.forEach((section) => {
    const isTarget = section.dataset.categoryName === sectionName;
    const isOpen = shouldOpen && isTarget;
    const toggle = section.querySelector('.section-toggle');
    const body = section.querySelector('.section-body');

    section.classList.toggle('is-open', isOpen);
    if (toggle) {
      toggle.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    }
    if (body) {
      body.hidden = !isOpen;
      body.classList.toggle('is-open', isOpen);
    }
  });
}

function getStickyNavigationHeight() {
  const stickyEl = document.querySelector('.sticky-nav');
  return stickyEl ? stickyEl.getBoundingClientRect().height : 0;
}

function scheduleCategoryPosition(categoryName, forceReveal = false) {
  if (!categoryName || !catalogEl) return;

  pendingCategoryScroll = categoryName;
  if (pendingCategoryScrollFrame) {
    cancelAnimationFrame(pendingCategoryScrollFrame);
  }

  pendingCategoryScrollFrame = requestAnimationFrame(() => {
    const targetSection = [...document.querySelectorAll('.category-section')].find((entry) => entry.dataset.categoryName === pendingCategoryScroll);
    if (!targetSection) return;

    const stickyOffset = getStickyNavigationHeight() + 10;
    const sectionTop = targetSection.offsetTop || (targetSection.getBoundingClientRect().top + window.scrollY);
    const nextTop = Math.max(0, sectionTop - stickyOffset);
    const shouldAdjust = forceReveal || nextTop < window.scrollY || nextTop > window.scrollY + 8;

    if (shouldAdjust && Math.abs(window.scrollY - nextTop) > 2) {
      window.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
    }

    pendingCategoryScrollFrame = null;
    pendingCategoryScroll = null;
  });
}

function getGrappeSubsection(product) {
  if (!product || product.category !== 'Grappe') return 'Altro';

  const productId = String(product.id || '').trim();
  const subsection = Object.entries(GRAPPE_SUBSECTIONS).find(([, ids]) => ids.includes(productId));
  return subsection ? subsection[0] : 'Altro';
}

function renderCatalog(categories) {
  const baseCategories = categories.filter((category) => category.products.length > 0);

  if (!baseCategories.length) {
    catalogEl.innerHTML = `
      <div class="empty-state" role="status">
        <strong>Nessun prodotto disponibile</strong>
        Torna presto per scoprire le novità di Old Mill.
      </div>
    `;
    categorySections = [];
    return;
  }

  const visibleCategories = getGroupCategories(activeState.activeGroup, baseCategories);
  const displayCategories = visibleCategories.length ? visibleCategories : baseCategories;

  if (!displayCategories.some((category) => category.name === activeState.activeCategory)) {
    activeState.activeCategory = displayCategories[0].name;
  }

  if (!activeState.expandedCategory || !displayCategories.some((category) => category.name === activeState.expandedCategory)) {
    activeState.expandedCategory = activeState.activeCategory;
  }

  catalogEl.innerHTML = displayCategories.map((category) => {
    const filteredProducts = sortProducts(category.products).filter((product) => product.visible);
    const sectionId = `section-${slugify(category.name)}`;
    const isOpen = category.name === activeState.expandedCategory;

    if (category.name === 'Grappe') {
      const subgroupEntries = Object.keys(GRAPPE_SUBSECTIONS).map((label) => ({
        label,
        products: filteredProducts.filter((product) => getGrappeSubsection(product) === label),
      }));

      const fallbackProducts = filteredProducts.filter((product) => !Object.values(GRAPPE_SUBSECTIONS).flat().includes(String(product.id || '')));
      if (fallbackProducts.length) {
        subgroupEntries.push({ label: 'Altro', products: fallbackProducts });
      }

      return `
        <section id="${sectionId}" class="category-section ${isOpen ? 'is-open' : ''}" data-category-name="${category.name}">
          <button type="button" class="section-toggle ${isOpen ? 'is-open' : ''}" aria-expanded="${isOpen}" aria-controls="body-${sectionId}"><span class="category-title">${category.name}</span><span class="section-arrow" aria-hidden="true">▾</span></button>
          <div id="body-${sectionId}" class="section-body ${isOpen ? 'is-open' : ''}" ${isOpen ? '' : 'hidden'}>
            <div class="grappe-groups">
              ${subgroupEntries.filter((entry) => entry.products.length).map((entry) => `
                <div class="grappe-subgroup">
                  <div class="grappe-subgroup__title">${entry.label}</div>
                  <div class="product-list">
                    ${entry.products.map(buildProductCard).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section id="${sectionId}" class="category-section ${isOpen ? 'is-open' : ''}" data-category-name="${category.name}">
        <button type="button" class="section-toggle ${isOpen ? 'is-open' : ''}" aria-expanded="${isOpen}" aria-controls="body-${sectionId}"><span class="category-title">${category.name}</span><span class="section-arrow" aria-hidden="true">▾</span></button>
        <div id="body-${sectionId}" class="section-body ${isOpen ? 'is-open' : ''}" ${isOpen ? '' : 'hidden'}>
          <div class="product-list">
            ${filteredProducts.map(buildProductCard).join('')}
          </div>
        </div>
      </section>
    `;
  }).join('');

  catalogEl.insertAdjacentHTML('beforeend', `
    <div class="menu-note menu-note--allergens" role="note">
      <div class="menu-note__title">ALLERGENI</div>
      <p>Per informazioni sulla presenza di sostanze o prodotti che possono provocare allergie o intolleranze, si invita la gentile clientela a rivolgersi al personale di sala per consultare il libro degli allergeni.</p>
    </div>
  `);

  renderMacroGroupChips(buildMacroGroups(baseCategories));
  renderCategoryChips(getGroupCategories(activeState.activeGroup, baseCategories));
  setSectionExpanded(activeState.expandedCategory, Boolean(activeState.expandedCategory));
  scheduleCategoryPosition(activeState.activeCategory);
}

function buildProductCard(product) {
  const hasSinglePrice = typeof product.price !== 'undefined' && product.price !== null && Number.isFinite(product.price);
  const hasMultiPrice = typeof product.priceMezzo !== 'undefined' && product.priceMezzo !== null && Number.isFinite(product.priceMezzo)
    && typeof product.priceIntero !== 'undefined' && product.priceIntero !== null && Number.isFinite(product.priceIntero);

  const description = String(product.description || '').trim();
  const variant = String(product.variant || '').trim();
  const catalogNumber = String(product.catalogNumber ?? '').trim();
  const normalizedName = String(product.name || '').trim();
  const hasExplicitNumberPrefix = /^\s*(numero\s*\d+|n\.?\s*\d+)\s*$/i.test(normalizedName)
    || /^\s*\d+\s*[-–—]\s*numero\s*\d+\s*$/i.test(normalizedName);
  const productLabel = catalogNumber && !hasExplicitNumberPrefix ? `${catalogNumber} — ${normalizedName}` : normalizedName;
  const isTea = product.category === 'Tè e Infusi';

  const descriptionText = isTea ? (description || variant) : (description && description !== variant ? description : '');
  const variantText = isTea ? '' : variant;

  return `
    <article class="product-card" aria-label="${product.name}">
      <div class="product-main">
        <div class="product-header">
          <h3 class="product-name">${productLabel}</h3>
        </div>
        ${descriptionText ? `<p class="product-description">${descriptionText}</p>` : ''}
        ${variantText ? `<p class="product-variant">${variantText}</p>` : ''}
      </div>
      <div class="product-price">
        ${hasMultiPrice ? `
          <div class="multi-price">
            <div class="multi-price__labels">
              <span>Mezzo</span>
              <span>Intero</span>
            </div>
            <div class="multi-price__values">
              <span>${priceToString(product.priceMezzo)}</span>
              <span>${priceToString(product.priceIntero)}</span>
            </div>
          </div>
        ` : `<span class="price-tag">${hasSinglePrice ? priceToString(product.price) : '—'}</span>`}
      </div>
    </article>
  `;
}

function renderLoadingState() {
  if (!catalogEl) return;
  catalogEl.innerHTML = `
    <div class="loading-state" role="status">
      <strong>Caricamento menu</strong>
      Stiamo preparando le proposte di Old Mill...
    </div>
  `;
}

function renderErrorState(message) {
  if (!catalogEl) return;
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
      return;
    }

    allProducts = visibleProducts;
    allCategories = getAvailableCategories(allProducts);
    activeState = {
      activeGroup: 'Dolci',
      activeCategory: 'Caffetteria',
      expandedCategory: 'Caffetteria',
    };
    renderCatalog(allCategories);
    setStatus(`Menu caricato: ${visibleProducts.length} prodotti in ${allCategories.length} categorie.`);
  } catch (error) {
    console.error('loadMenu failed', error);
    setStatus('Errore durante il caricamento del menu.');

    if (getAcceptableDataSource(config) === 'google-sheets') {
      renderErrorState('Il file Google non è raggiungibile. Verifica il link CSV pubblico, la pubblicazione del foglio e il CORS/redirect.');
      return;
    }

    renderErrorState('Il file demo non è disponibile. Verifica la cartella data e il server locale.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (macroGroupBarEl) {
    macroGroupBarEl.addEventListener('click', (event) => {
      const button = event.target.closest('.macro-chip');
      if (!button) return;
      const groupName = button.dataset.groupName;
      if (!groupName) return;

      const groupCategories = getGroupCategories(groupName, allCategories);
      const targetCategory = groupCategories[0]?.name || allCategories[0]?.name;
      if (!targetCategory) return;

      activeState.activeGroup = groupName;
      activeState.activeCategory = targetCategory;
      activeState.expandedCategory = targetCategory;
      renderCatalog(allCategories);
      scheduleCategoryPosition(targetCategory);
    });
  }

  if (categoryBarEl) {
    categoryBarEl.addEventListener('click', (event) => {
      const button = event.target.closest('.category-pill');
      if (!button) return;
      const selectedCategory = button.dataset.categoryName;
      if (!selectedCategory) return;

      const nextGroup = resolveCategoryGroup(selectedCategory);
      activeState.activeGroup = nextGroup;
      activeState.activeCategory = selectedCategory;
      activeState.expandedCategory = selectedCategory;
      renderCatalog(allCategories);
      scheduleCategoryPosition(selectedCategory);
    });
  }

  if (catalogEl) {
    catalogEl.addEventListener('click', (event) => {
      const toggleButton = event.target.closest('.section-toggle');
      if (!toggleButton) return;

      const sectionEl = toggleButton.closest('.category-section');
      if (!sectionEl) return;

      const categoryName = sectionEl.dataset.categoryName;
      if (!categoryName) return;

      const isOpen = activeState.expandedCategory === categoryName;
      if (isOpen) {
        activeState.activeCategory = categoryName;
        activeState.activeGroup = resolveCategoryGroup(categoryName);
        setSectionExpanded(categoryName, false);
        scheduleCategoryPosition(categoryName, true);
        return;
      }

      activeState.activeCategory = categoryName;
      activeState.activeGroup = resolveCategoryGroup(categoryName);
      activeState.expandedCategory = categoryName;
      setSectionExpanded(categoryName, true);
      scheduleCategoryPosition(categoryName);
    });
  }

  loadMenu();
});
