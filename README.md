# Old Mill — Menù digitale con Google Sheets CSV

## Obiettivo
Il menù digitale deve poter essere aggiornato dal proprietario tramite un foglio Google pubblicato in CSV, senza introdurre un pannello admin e senza fare pagare il cliente. Il sito continuerà a essere il sito web Old Mill esistente, con QR code già attivo e un caricamento automatico dei contenuti da una sorgente pubblica.

## Struttura del progetto
- `index.html` — struttura della pagina
- `styles.css` — design approvato e non modificato se non strettamente necessario
- `app.js` — rendering e gestione categorie
- `config.js` — configurazione datasource
- `dataAdapter.js` — normalizzazione dati, parsing CSV e compatibilità JSON
- `data/products.json` — fallback demo locale
- `data/products-demo.csv` — template CSV pronto da usare in Google Sheets
- `logo.jpeg` — logo originale preservato
- `favicon.svg` — icona del sito
- `README.md` — documentazione

## Modalità supportate
Il sito supporta due sorgenti dati:
1. `demo` — usa `data/products.json` locale
2. `google-sheets` — usa un CSV pubblico da Google Sheets

La modalità demo resta sempre disponibile per test e backup.

## Avvio locale
1. Apri la cartella del progetto in VS Code
2. Avvia un server statico alla radice del progetto, ad esempio:
   - `python -m http.server 8000`
   - oppure Live Server
3. Apri il browser:
   - `http://localhost:8000`

## Schema dati
Le colonne richieste sono:
- `id`
- `category`
- `name`
- `description`
- `price`
- `visible`
- `available`
- `sortOrder`
- `image`
- `allergens`

Legacy compatibility:
- il JSON già presente continua a essere supportato
- `visible` decide se il prodotto appare
- `available` rimane nel dato ma non viene mostrato come badge o etichetta
- non vengono reintrodotti badge promozionali

## Template CSV pronto
Il file [data/products-demo.csv](data/products-demo.csv) contiene un esempio completo dei prodotti demo in formato CSV compatibile con Google Sheets.

## Importazione in Google Sheets
1. Apri Google Sheets
2. Crea un nuovo foglio vuoto
3. Incolla le intestazioni dal template CSV
4. Copia tutte le righe demo oppure sostituisci con i tuoi prodotti reali
5. Mantieni i valori in questo formato:
   - `visible`: `TRUE` o `FALSE`
   - `available`: `TRUE` o `FALSE`
   - `price`: `7,50` oppure `7.50`
   - `allergens`: `Latte,Glutine` oppure `Latte; Glutine`
   - `image`: URL esterno completo oppure cella vuota

### Esempio di riga
```csv
caffetteria-cappuccino,Caffetteria,Cappuccino,Latte montato con cacao e vaniglia,4,50,TRUE,TRUE,2,,Latte
```

## Pubblicazione del foglio come CSV
Il metodo preferito è usare un file CSV pubblicato in sola lettura, senza Apps Script.

### Metodo consigliato
1. Apri il foglio Google
2. Vai in File > Pubblica sul web
3. Scegli `CSV`
4. Seleziona il foglio dei prodotti
5. Copia l’URL pubblico generato

### URL tipo
```text
https://docs.google.com/spreadsheets/d/ID_DEL_FOGLIO/export?format=csv&gid=0
```

### Importante
- usa un URL di export CSV, non la vista normale del foglio
- non usare una pagina HTML con Google Sheets in browser
- non usare JSONP o JavaScript eseguito dal foglio
- il fetch del browser deve leggere un file CSV testuale pubblico

## Configurazione in config.js
Apri [config.js](config.js) e inserisci il link pubblico del CSV:

```js
window.OLD_MILL_CONFIG = {
  dataMode: 'google-sheets',
  productsFile: 'data/products.json',
  googleSheetsUrl: 'https://docs.google.com/spreadsheets/d/ID_DEL_FOGLIO/export?format=csv&gid=0',
  googleSheetsCsvUrl: '',
  proxyUrl: '',
  appName: 'Old Mill',
  showDemoLabels: true,
};
```

### Se il CSV è bloccato da CORS/redirect
Le pubbliche API di Google Sheets possono bloccare il fetch diretto in alcuni casi. In quel caso il sistema prova automaticamente un fallback in sola lettura tramite `proxyUrl`, se configurato.

### Proxy gratuito sicuro
Se il fetch diretto è bloccato, puoi usare una Cloudflare Pages Function in sola lettura. È già inclusa una struttura pronta in `functions/api/oldmill-products.js`.

```js
window.OLD_MILL_CONFIG = {
  dataMode: 'google-sheets',
  googleSheetsUrl: 'https://docs.google.com/spreadsheets/d/ID_DEL_FOGLIO/export?format=csv&gid=0',
  proxyUrl: 'https://old-mill.pages.dev/api/oldmill-products',
};
```

La funzione proxy:
- accetta solo una richiesta GET
- usa solo un URL sorgente pubblico
- non espone credenziali
- non esegue codice del foglio
- restituisce solo il CSV come testo

## Validazione e test
Sono stati implementati controlli per:
- parsing CSV robusto con virgolette, punti e virgola, virgole e newline
- normalizzazione prezzi italiani con `,` decimale
- valori booleani e campi obbligatori
- gestione errori di rete e CORS
- non sostituzione silenziosa del contenuto reale con demo in produzione
- rendering catalogo e categorie
- fallback automatico alla demo locale se il dato remoto non è disponibile

### Test eseguibili ora
- menu demo locale: funziona già con [data/products.json](data/products.json)
- parsing CSV: verificato sul template [data/products-demo.csv](data/products-demo.csv)
- rendering: verificato in browser con viewport mobile
- errori: il sito mostra un messaggio visibile quando il CSV non è raggiungibile

## Cosa puoi testare subito
- cambia `dataMode` in `demo` e verifica che il menù renderizzi lo stesso catalogo
- apri [data/products-demo.csv](data/products-demo.csv) e controlla che le colonne e i formati siano corretti
- modifica un prezzo, una descrizione o un `visible` nel CSV e verifica che il caricamento successivo aggiorni il menù
- usa una URL pubblica del tuo foglio reale in `config.js` per testare la lettura del CSV

## Cosa richiede ancora un foglio reale
- un URL CSV Google realmente pubblico
- una verifica con il browser reale sul dominio di produzione
- eventuale correzione del CORS/redirect se Google blocca la fetch diretta
- eventuale attivazione della Cloudflare Pages Function se serve un proxy esterno

## Nota finale
Questa fase è focalizzata sulla gestione autonoma del menù e non va alla pubblicazione definitiva né alla generazione del QR finale. L’obiettivo è completare e testare in modo sicuro l’aggiornamento del menù da Google Sheets senza rompere il sito esistente.
