// --- INITIAL SETUP ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumPending = null;
let currentZoom = 1.0;

const wrapper = document.getElementById('pdf-wrapper');
const canvas = document.getElementById('pdf-render');
const ctx = canvas.getContext('2d');
const body = document.body;
const banglaOutput = document.getElementById('bangla-text');
const mobileTranslateBtn = document.getElementById('mobile-translate-btn');

// Detect touch device once
const isTouchDevice = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function updateZoomText() {
    document.getElementById('zoom-level-text').textContent = `${Math.round(currentZoom * 100)}%`;
}

// --- AI API CALL ---
async function getSmartTranslation(text) {
    try {
        const response = await fetch('/api/dictionary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: text, context: "" })
        });

        if (!response.ok) {
            if (response.status === 429) return "⚠️ Rate limit reached. Please wait a moment.";
            throw new Error("Server error");
        }

        const data = await response.json();

        if (data.definition && data.partOfSpeech) {
            return `
                <div style="margin-bottom: 12px;">
                    <span style="color: #3b82f6; font-size: 0.82em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${data.partOfSpeech}</span>
                    <p style="margin: 5px 0; opacity: 0.8; font-size: 0.95em; line-height: 1.5;">${data.definition}</p>
                </div>
                <p style="font-size: 1.1em; margin-bottom: 12px; line-height: 1.5;"><strong>বাংলা:</strong> ${data.translation}</p>
                <div style="border-left: 3px solid #3b82f6; padding-left: 12px; margin-top: 8px; border-radius: 0 4px 4px 0; background: rgba(59,130,246,0.04); padding: 10px 12px;">
                    <p style="font-size: 0.88em; opacity: 0.85; font-style: italic; margin: 0; line-height: 1.5;">"${data.exampleSentence}"</p>
                </div>
            `;
        }

        return `<p style="font-size: 1.1em; line-height: 1.7;">${data.translation || data}</p>`;

    } catch (error) {
        console.error("AI API Error:", error);
        return "☕ Server is taking a short break. Try Later!";
    }
}

// --- TRIGGER TRANSLATION (shared logic) ---
let lastTranslatedText = "";

async function triggerTranslation(cleanText) {
    if (!cleanText || cleanText === lastTranslatedText) return;
    lastTranslatedText = cleanText;

    banglaOutput.innerHTML = "<p style='color:#6b7280;font-size:0.95em;'>Translating...</p>";

    // Auto-scroll sidebar into view on mobile
    if (isTouchDevice()) {
        document.querySelector('.translation-sidebar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const result = await getSmartTranslation(cleanText);
    banglaOutput.innerHTML = result;
}

// --- DESKTOP: selectionchange with debounce ---
let translationTimeout;

if (!isTouchDevice()) {
    document.addEventListener('selectionchange', () => {
        clearTimeout(translationTimeout);
        translationTimeout = setTimeout(() => {
            const selectedText = window.getSelection().toString().replace(/\s+/g, ' ').trim();
            if (selectedText.length > 0) {
                triggerTranslation(selectedText);
            }
        }, 1000);
    });
}

// --- MOBILE: touchend + floating pill button ---
// Only fires AFTER the user lifts their finger, avoiding mid-drag jitter entirely
let pendingMobileText = '';

if (isTouchDevice()) {
    document.addEventListener('touchend', () => {
        // Small delay so browser can finalise the selection range
        setTimeout(() => {
            const selectedText = window.getSelection().toString().replace(/\s+/g, ' ').trim();
            if (selectedText.length > 0) {
                pendingMobileText = selectedText;
                mobileTranslateBtn.style.display = 'flex';
            }
        }, 350);
    });

    // Hide pill when tapping elsewhere with no selection
    document.addEventListener('touchstart', (e) => {
        if (e.target !== mobileTranslateBtn && window.getSelection().toString().trim() === '') {
            mobileTranslateBtn.style.display = 'none';
        }
    });

    mobileTranslateBtn.addEventListener('click', async () => {
        mobileTranslateBtn.style.display = 'none';
        window.getSelection().removeAllRanges(); // Clear highlight after tapping
        await triggerTranslation(pendingMobileText);
    });
}

// --- RENDER PDF ---
async function renderPage(num) {
    pageIsRendering = true;

    const existingTextLayer = document.querySelector('.textLayer');
    if (existingTextLayer) existingTextLayer.remove();

    const page = await pdfDoc.getPage(num);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const container = document.querySelector('.pdf-section');

    const padding = window.innerWidth <= 768 ? 16 : 48;
    const targetWidth = container.clientWidth - padding;

    const baseScale = targetWidth / unscaledViewport.width;
    const finalScale = baseScale * currentZoom;
    const viewport = page.getViewport({ scale: finalScale });

    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    wrapper.style.width = `${Math.floor(viewport.width)}px`;
    wrapper.style.height = `${Math.floor(viewport.height)}px`;
    wrapper.style.margin = '0 auto';

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    await page.render({ canvasContext: ctx, transform, viewport }).promise;

    const textContent = await page.getTextContent();
    const textLayerDiv = document.createElement('div');
    textLayerDiv.setAttribute('class', 'textLayer');
    textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
    textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    wrapper.appendChild(textLayerDiv);

    const scanBtn = document.getElementById('scan-page-btn');
    scanBtn.style.display = 'none';

    if (textContent.items.length > 0) {
        await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        }).promise;

        banglaOutput.innerHTML = isTouchDevice()
            ? "<p>✅ Page ready! Long-press and drag to select text, then tap <strong>Translate ✨</strong></p>"
            : "<p>✅ Page ready! Highlight any word or sentence...</p>";
    } else {
        banglaOutput.innerHTML = "<p>📄 Scanned page detected.</p>";
        scanBtn.style.display = 'flex';

        scanBtn.onclick = async () => {
            scanBtn.style.display = 'none';
            const progressContainer = document.getElementById('ocr-progress-container');
            const progressFill = document.getElementById('ocr-progress-fill');
            const progressText = document.getElementById('ocr-status-text');

            banglaOutput.innerHTML = "<p>🔍 Scanning page...</p>";
            progressContainer.style.display = 'block';

            try {
                const { data } = await Tesseract.recognize(canvas, 'eng', {
                    logger: m => {
                        progressText.textContent = m.status;
                        if (m.status === 'recognizing text') {
                            progressFill.style.width = `${Math.round(m.progress * 100)}%`;
                        }
                    }
                });

                textLayerDiv.innerHTML = '';
                const ocrScale = 1 / outputScale;

                data.words.forEach(word => {
                    const span = document.createElement('span');
                    span.textContent = word.text + " ";
                    span.style.position = 'absolute';
                    span.style.left = `${word.bbox.x0 * ocrScale}px`;
                    span.style.top = `${word.bbox.y0 * ocrScale}px`;
                    span.style.width = `${(word.bbox.x1 - word.bbox.x0) * ocrScale}px`;
                    span.style.height = `${(word.bbox.y1 - word.bbox.y0) * ocrScale}px`;
                    span.style.fontSize = `${(word.bbox.y1 - word.bbox.y0) * ocrScale}px`;
                    span.style.color = 'transparent';
                    span.style.cursor = 'text';
                    textLayerDiv.appendChild(span);
                });

                banglaOutput.innerHTML = "<p>✅ Text found! Select to translate.</p>";
            } catch (error) {
                console.error("OCR Error:", error);
                banglaOutput.innerHTML = "<p>❌ Could not read the page.</p>";
                scanBtn.style.display = 'flex';
            } finally {
                setTimeout(() => progressContainer.style.display = 'none', 1500);
            }
        };
    }

    document.getElementById('page-num').value = num;
    pageIsRendering = false;

    if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
    }
}

function queueRenderPage(num) {
    if (pageIsRendering) pageNumPending = num;
    else renderPage(num);
}

// --- ZOOM CONTROLS ---
document.getElementById('zoom-in').addEventListener('click', () => {
    if (currentZoom < 3.0) { currentZoom += 0.20; updateZoomText(); queueRenderPage(pageNum); }
});
document.getElementById('zoom-out').addEventListener('click', () => {
    if (currentZoom > 0.5) { currentZoom -= 0.20; updateZoomText(); queueRenderPage(pageNum); }
});

document.getElementById('font-size-slider').addEventListener('input', (e) => {
    banglaOutput.style.fontSize = `${e.target.value}px`;
});

// --- PAGINATION ---
document.getElementById('prev-page').addEventListener('click', () => {
    if (!pdfDoc || pageNum <= 1) return;
    pageNum--; queueRenderPage(pageNum);
});
document.getElementById('next-page').addEventListener('click', () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++; queueRenderPage(pageNum);
});
document.getElementById('page-num').addEventListener('change', (e) => {
    if (!pdfDoc) return;
    let desired = parseInt(e.target.value);
    if (desired >= 1 && desired <= pdfDoc.numPages) { pageNum = desired; queueRenderPage(pageNum); }
    else { e.target.value = pageNum; }
});

// --- LOAD PDF ---
async function loadPDF(urlOrData) {
    try {
        pdfDoc = await pdfjsLib.getDocument(urlOrData).promise;
        document.getElementById('page-count').textContent = pdfDoc.numPages;
        document.getElementById('upload-prompt').style.display = 'none';
        document.getElementById('pdf-wrapper').style.display = 'block';
        pageNum = 1;
        currentZoom = 1.0;
        updateZoomText();
        renderPage(pageNum);
    } catch (error) {
        alert("Could not load this PDF. Please try another file.");
    }
}

document.getElementById('pdf-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const fileReader = new FileReader();
        fileReader.onload = function () { loadPDF(new Uint8Array(this.result)); };
        fileReader.readAsArrayBuffer(file);
    }
});

// --- THEME ---
const themeToggle = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'dark') { body.classList.add('dark'); themeToggle.textContent = '☀️'; }
else { themeToggle.textContent = '🌙'; }

themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark');
    const isDark = body.classList.contains('dark');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// --- RESIZE ---
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => { if (pdfDoc && !pageIsRendering) renderPage(pageNum); }, 300);
});

// --- AI CHAT ---
document.getElementById('ai-chat-btn').addEventListener('click', async () => {
    const inputField = document.getElementById('ai-chat-input');
    const responseBox = document.getElementById('ai-chat-response');
    const question = inputField.value.trim();
    if (!question) return;

    responseBox.innerHTML = "<em style='color:#6b7280;font-size:0.9em;'>Thinking...</em>";

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, context: lastTranslatedText })
        });
        const data = await response.json();
        responseBox.innerHTML = `
            <div style="padding:12px 14px;background:rgba(59,130,246,0.05);border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;margin-top:8px;">
                <p style="margin:0;line-height:1.65;">${data.answer}</p>
            </div>`;
        inputField.value = "";
    } catch {
        responseBox.innerHTML = "<span style='color:red;font-size:0.9em;'>Connection failed. Try again.</span>";
    }
});

document.getElementById('ai-chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('ai-chat-btn').click();
});
