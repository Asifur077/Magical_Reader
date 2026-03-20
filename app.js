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

function updateZoomText() {
    document.getElementById('zoom-level-text').textContent = `${Math.round(currentZoom * 100)}%`;
}

// --- PROFESSIONAL AI API CALL (PYTHON BACKEND) ---
async function getSmartTranslation(text) {
    try {
        // Points safely to your live Render backend
        const response = await fetch('/api/dictionary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ word: text, context: "" }) 
        });
        
        if (!response.ok) {
            if (response.status === 429) return "⚠️ Rate limit reached. Please wait a moment and try again.";
            throw new Error("Server error");
        }
        
        const data = await response.json();
        
        // If the AI returned our beautiful JSON dictionary structure
        if (data.definition && data.partOfSpeech) {
            return `
                <div style="margin-bottom: 12px;">
                    <span style="color: #3b82f6; font-size: 0.85em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${data.partOfSpeech}</span>
                    <p style="margin: 5px 0; opacity: 0.8; font-size: 0.95em; line-height: 1.4;">${data.definition}</p>
                </div>
                <p style="font-size: 1.15em; margin-bottom: 12px;"><strong>Bangla:</strong> ${data.translation}</p>
                <div style="border-left: 4px solid #3b82f6; padding-left: 12px; margin-top: 8px;">
                    <p style="font-size: 0.9em; opacity: 0.9; font-style: italic; margin: 0;">"${data.exampleSentence}"</p>
                </div>
            `;
        } 
        
        // Fallback for full sentences where it just returns translation
        return `<p style="font-size: 1.15em; line-height: 1.6;">${data.translation || data}</p>`;

    } catch (error) {
        console.error("AI API Error:", error);
        return "The Server is taking a coffee break. ☕️🛠";
    }
}

// --- RENDERING PDF (HIGH-RES DISPLAY SUPPORT) ---
async function renderPage(num) {
    pageIsRendering = true;

    const existingTextLayer = document.querySelector('.textLayer');
    if (existingTextLayer) existingTextLayer.remove();

    const page = await pdfDoc.getPage(num);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const container = document.querySelector('.pdf-section');
    
    const padding = window.innerWidth <= 768 ? 0 : 48; 
    const targetWidth = container.clientWidth - padding;
    
    const baseScale = targetWidth / unscaledViewport.width;
    const finalScale = baseScale * currentZoom; 
    const viewport = page.getViewport({ scale: finalScale });

    // 🌟 HIGH-RES DISPLAY SUPPORT (CRISP TEXT)
    const outputScale = window.devicePixelRatio || 1;
    
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    
    wrapper.style.width = `${Math.floor(viewport.width)}px`;
    wrapper.style.height = `${Math.floor(viewport.height)}px`;
    wrapper.style.margin = '0 auto'; 

    const transform = outputScale !== 1 
        ? [outputScale, 0, 0, outputScale, 0, 0] 
        : null;

    const renderCtx = { 
        canvasContext: ctx, 
        transform: transform, 
        viewport: viewport 
    };
    await page.render(renderCtx).promise;

    const textContent = await page.getTextContent();
    const textLayerDiv = document.createElement('div');
    textLayerDiv.setAttribute('class', 'textLayer');
    
    // 🌟 PERFECT TEXT LAYER ALIGNMENT
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
        
        banglaOutput.innerHTML = "<p>✅ Page loaded! Highlight whatever you want...</p>";
    } else {
        // --- SCANNED PDF: SHOW BUTTON ---
        banglaOutput.innerHTML = "<p>📄 Scanned page detected. Now what?</p>";
        scanBtn.style.display = 'flex';

        scanBtn.onclick = async () => {
            scanBtn.style.display = 'none'; 
            const progressContainer = document.getElementById('ocr-progress-container');
            const progressFill = document.getElementById('ocr-progress-fill');
            const progressText = document.getElementById('ocr-status-text');

            banglaOutput.innerHTML = "<p> Wait, Let me see...</p>";
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
                
                banglaOutput.innerHTML = "<p>✅ Huh, found it!</p>";
            } catch (error) {
                console.error("OCR Error:", error);
                banglaOutput.innerHTML = "<p>❌ Didn't find anything.</p>";
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

// --- HIGHLIGHT DETECTOR (MOBILE & DESKTOP FRIENDLY) ---
let translationTimeout; 
let lastTranslatedText = ""; 

// Using 'selectionchange' fixes the mobile highlight bug
document.addEventListener('selectionchange', () => {
    clearTimeout(translationTimeout);
    
    translationTimeout = setTimeout(async () => {
        let selectedText = window.getSelection().toString();
        let cleanText = selectedText.replace(/\s+/g, ' ').trim();
        
        if (cleanText.length > 0 && cleanText !== lastTranslatedText) {
            lastTranslatedText = cleanText; 
            
            banglaOutput.innerHTML = "<p style='color: #6b7280;'>Let the professional handle...</p>";

            // MOBILE AUTO-SCROLL
            if (window.innerWidth <= 768) {
                banglaOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            let aiResultHTML = await getSmartTranslation(cleanText);
            banglaOutput.innerHTML = aiResultHTML;
        }
    }, 1200); 
});

// --- ZOOM & FONT CONTROLS ---
document.getElementById('zoom-in').addEventListener('click', () => {
    if(currentZoom < 3.0) { currentZoom += 0.20; updateZoomText(); queueRenderPage(pageNum); }
});
document.getElementById('zoom-out').addEventListener('click', () => {
    if(currentZoom > 0.5) { currentZoom -= 0.20; updateZoomText(); queueRenderPage(pageNum); }
});

document.getElementById('font-size-slider').addEventListener('input', (e) => {
    banglaOutput.style.fontSize = `${e.target.value}px`;
});

// --- PAGINATION LISTENERS ---
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
    let desiredPage = parseInt(e.target.value);
    if (desiredPage >= 1 && desiredPage <= pdfDoc.numPages) {
        pageNum = desiredPage; queueRenderPage(pageNum);
    } else { e.target.value = pageNum; }
});

// --- LOAD PDF ---
async function loadPDF(urlOrData) {
    try {
        const loadingTask = pdfjsLib.getDocument(urlOrData);
        pdfDoc = await loadingTask.promise;
        
        document.getElementById('page-count').textContent = pdfDoc.numPages;
        document.getElementById('upload-prompt').style.display = 'none';
        document.getElementById('pdf-wrapper').style.display = 'block';
        
        pageNum = 1; 
        currentZoom = 1.0;
        updateZoomText();
        renderPage(pageNum);
    } catch (error) {
        alert("Could not load the PDF.");
    }
}

document.getElementById('pdf-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const fileReader = new FileReader();
        fileReader.onload = function() { loadPDF(new Uint8Array(this.result)); };
        fileReader.readAsArrayBuffer(file);
    }
});

// --- THEME & RESIZE ---
const themeToggle = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'dark') { body.classList.add('dark'); themeToggle.textContent = '☀️'; } 
else { themeToggle.textContent = '🌙'; }

themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark');
    const isDark = body.classList.contains('dark');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => { if (pdfDoc && !pageIsRendering) renderPage(pageNum); }, 300);
});

// --- INTERACTIVE AI CHAT ---
document.getElementById('ai-chat-btn').addEventListener('click', async () => {
    const inputField = document.getElementById('ai-chat-input');
    const responseBox = document.getElementById('ai-chat-response');
    const question = inputField.value.trim();
    
    if (!question) return; // Don't do anything if the box is empty
    
    // Show a loading message
    responseBox.innerHTML = "<em>Let me think...</em>";
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Notice we are sending BOTH the question AND the last translated text as context!
            body: JSON.stringify({ question: question, context: lastTranslatedText }) 
        });
        
        const data = await response.json();
        
        // Display the AI's answer in a nice styled box
        responseBox.innerHTML = `
            <div style="padding: 12px; background-color: rgba(59, 130, 246, 0.05); border-left: 3px solid #3b82f6; border-radius: 0 8px 8px 0; margin-top: 8px;">
                <p style="margin: 4px 0 0 0;">${data.answer}</p>
            </div>
        `;
        inputField.value = ""; // Clear the input box for the next question
        
    } catch (error) {
        responseBox.innerHTML = "<span style='color: red;'> Call the Mechanic...</span>";
    }
});

// Allow the user to just press "Enter" on their keyboard to ask
document.getElementById('ai-chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('ai-chat-btn').click();
    }
});