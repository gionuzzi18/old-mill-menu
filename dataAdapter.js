(function () {
  const CATEGORY_ORDER = [
    'Caffetteria',
    'Colazione',
    'Pasticceria',
    'Gelateria',
    'Rosticceria',
    'Piadine e Pucce',
    'Soft Drink',
    'Cioccolate Calde',
    'Tè e Infusi',
    'Cocktail',
    'Amari',
    'Cognac e Brandy',
    'Whisky',
    'Rum',
    'Grappe',
  ];

  function normalizeCategory(value) {
    const cleanValue = String(value || '').trim();
    return cleanValue || 'Altro';
  }

  function getCaseInsensitiveValue(record, fieldNames) {
    if (!record || typeof record !== 'object') return undefined;

    const keys = Object.keys(record);
    for (const fieldName of fieldNames) {
      const match = keys.find((key) => key.toLowerCase() === String(fieldName).toLowerCase());
      if (match !== undefined) return record[match];
    }

    return undefined;
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'altro';
  }

  function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const cleanValue = String(value ?? '').trim().toLowerCase();
    if (!cleanValue) return true;

    return ['1', 'true', 'yes', 'y', 'si', 's', 'on', 'visible'].includes(cleanValue);
  }

  function parsePrice(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const rawValue = String(value).trim();
    if (!rawValue || rawValue === '-' || rawValue === '—') return null;

    const normalized = rawValue
      .replace(/[€\s]/g, '')
      .replace(/\u00a0/g, '')
      .trim();

    if (!normalized) return null;

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    let sanitized = normalized;

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(',');
      const lastDot = normalized.lastIndexOf('.');
      sanitized = lastComma > lastDot
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else if (hasComma) {
      sanitized = normalized.replace(',', '.');
    } else if (hasDot) {
      sanitized = normalized.replace(/,/g, '');
    }

    if (!sanitized || sanitized === '.' || sanitized === '-') return null;

    const numericValue = Number(sanitized);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function normalizeAllergens(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      const cleaned = value.trim();
      if (!cleaned) return [];
      return cleaned
        .split(/[;,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    return [];
  }

  function parseCsvRows(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const nextChar = text[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          index += 1;
        }
        currentRow.push(currentCell);
        if (currentRow.some((cell) => String(cell).trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        continue;
      }

      currentCell += char;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      if (currentRow.some((cell) => String(cell).trim() !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  function csvRowsToObjects(text) {
    const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
    if (!rows.length) return [];

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((header) => String(header).trim().toLowerCase().replace(/^\uFEFF/, ''));

    return dataRows
      .filter((row) => row.some((cell) => String(cell).trim() !== ''))
      .map((row) => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = row[index] ?? '';
        });
        return record;
      });
  }

  function parseGoogleSheetsPayload(payloadText, contentType = '') {
    const trimmed = String(payloadText || '').trim();
    if (!trimmed) {
      throw new Error('Il foglio Google è vuoto.');
    }

    if (/json/i.test(contentType) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : parsed.data || parsed.products || [];
      return Array.isArray(list) ? list : [];
    }

    return csvRowsToObjects(trimmed);
  }

  function priceToString(value) {
    const numericValue = parsePrice(value);
    if (numericValue === null || numericValue === undefined) {
      return '—';
    }

    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(numericValue);
  }

  function normalizeProduct(rawProduct, index) {
    const item = rawProduct || {};
    const category = normalizeCategory(
      getCaseInsensitiveValue(item, ['category', 'categoria', 'Category']) ?? 'Altro'
    );

    return {
      id: String(getCaseInsensitiveValue(item, ['id', 'ID']) || `${slugify(category)}-${index + 1}`),
      category,
      categorySlug: slugify(category),
      name: String(getCaseInsensitiveValue(item, ['name', 'nome', 'Name']) || 'Prodotto').trim() || 'Prodotto',
      description: String(getCaseInsensitiveValue(item, ['description', 'descrizione', 'Description']) || '').trim(),
      price: parsePrice(getCaseInsensitiveValue(item, ['price', 'prezzo', 'Prezzo']) ?? null),
      priceMezzo: parsePrice(getCaseInsensitiveValue(item, ['priceMezzo', 'price_mezzo', 'mezzo', 'pricemezzo']) ?? null),
      priceIntero: parsePrice(getCaseInsensitiveValue(item, ['priceIntero', 'price_intero', 'intero', 'priceintero']) ?? null),
      visible: parseBoolean(getCaseInsensitiveValue(item, ['visible', 'visibile', 'Visible']) ?? true),
      available: parseBoolean(getCaseInsensitiveValue(item, ['available', 'disponibile', 'Available']) ?? true),
      sortOrder: Number(getCaseInsensitiveValue(item, ['sortOrder', 'ordine', 'sort_order', 'SortOrder']) ?? index + 1),
      image: '',
      badge: String(getCaseInsensitiveValue(item, ['badge', 'badgeName', 'Badge']) || '').trim(),
      allergens: normalizeAllergens(getCaseInsensitiveValue(item, ['allergens', 'allergeni', 'Allergeni', 'allergen']) || ''),
      featured: Boolean(getCaseInsensitiveValue(item, ['featured', 'consigliato', 'Featured'])),
      variant: String(getCaseInsensitiveValue(item, ['variant', 'variante', 'note', 'variation']) || '').trim(),
      catalogNumber: String(getCaseInsensitiveValue(item, ['catalogNumber', 'catalog_number', 'numero', 'catalognumber']) || '').trim(),
    };
  }

  function sortProducts(items) {
    return [...items].sort((a, b) => {
      const orderDiff = Number(a.sortOrder || 999) - Number(b.sortOrder || 999);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name, 'it-IT');
    });
  }

  function getAvailableCategories(products) {
    const map = new Map();

    products.forEach((product) => {
      if (!product.visible) return;
      if (!map.has(product.category)) {
        map.set(product.category, { name: product.category, slug: product.categorySlug, products: [] });
      }
      map.get(product.category).products.push(product);
    });

    return Array.from(map.values()).sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a.name);
      const indexB = CATEGORY_ORDER.indexOf(b.name);
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name, 'it-IT');
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  function logDataSource(source, metadata = {}) {
    console.info(`[Old Mill data source] source=${source}`, metadata);
  }

  async function fetchDemoProducts(config) {
    logDataSource('demo', { file: config.productsFile, mode: 'demo' });
    const response = await fetch(config.productsFile, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Demo JSON non disponibile: ${response.status}`);
    }

    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : payload.products || [];
    return list.map(normalizeProduct);
  }

  function buildGoogleSheetsCandidates(config) {
    const directCandidates = [config.googleSheetsUrl, config.googleSheetsCsvUrl].filter(Boolean);
    const candidates = [...new Set(directCandidates)];

    if (config.proxyUrl) {
      directCandidates.forEach((url) => {
        candidates.push(`${config.proxyUrl}?source=${encodeURIComponent(url)}`);
      });
    }

    return candidates;
  }

  async function fetchGoogleSheetsProducts(config) {
    const candidates = buildGoogleSheetsCandidates(config);
    if (!candidates.length) {
      throw new Error('Nessun URL Google Sheets configurato. Imposta window.OLD_MILL_CONFIG.googleSheetsUrl.');
    }

    let lastError = null;

    for (const url of candidates) {
      try {
        logDataSource('google-sheets', {
          url,
          mode: 'google-sheets',
          proxy: Boolean(config.proxyUrl),
          cache: 'no-store',
        });

        const response = await fetch(url, {
          cache: 'no-store',
          credentials: 'omit',
        });

        if (!response.ok) {
          throw new Error(`Google Sheets non raggiungibile: ${response.status}`);
        }

        const payloadText = await response.text();
        const parsedData = parseGoogleSheetsPayload(payloadText, response.headers.get('content-type'));
        return parsedData.map((product, index) => normalizeProduct(product, index));
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Google Sheets non raggiungibile. Verifica il link pubblico del CSV.');
  }

  function getAcceptableDataSource(config) {
    return config.dataMode === 'google-sheets' ? 'google-sheets' : 'demo';
  }

  window.OldMillDataAdapter = {
    normalizeCategory,
    slugify,
    parseBoolean,
    parsePrice,
    normalizeAllergens,
    parseCsvRows,
    csvRowsToObjects,
    parseGoogleSheetsPayload,
    priceToString,
    normalizeProduct,
    sortProducts,
    getAvailableCategories,
    fetchDemoProducts,
    fetchGoogleSheetsProducts,
    getAcceptableDataSource,
  };
})();
