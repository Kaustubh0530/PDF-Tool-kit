// App State Management
const state = {
    activeTab: 'dashboard',
    merge: {
        files: [] // Array of { id, name, file, pages }
    },
    split: {
        file: null,
        totalPages: 0,
        selectedPages: new Set()
    },
    compress: {
        file: null,
        resultBlob: null
    },
    rotate: {
        file: null,
        totalPages: 0,
        rotations: {} // { pageIdx: angle }
    },
    watermark: {
        file: null,
        pdfDocument: null, // pdf.js document instance
        firstPageCanvas: null
    }
};

// SVG Icons
const icons = {
    arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`,
    arrowDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initUploadZones();
    initMergeUI();
    initSplitUI();
    initCompressUI();
    initRotateUI();
    initWatermarkUI();
});

// Toast notification helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-msg">${message}</span>`;
    
    container.appendChild(toast);
    
    // Slide out and remove
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Loading state overlay helper
function showLoading(message = 'Processing files...') {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

// Display direct file save location in the UI
function displaySavedLocation(response, containerElement) {
    if (!containerElement) return;
    
    // Remove any existing saved path cards inside the container
    const existing = containerElement.querySelector('.saved-path-card');
    if (existing) existing.remove();
    
    const savedPath = response.headers.get('X-Saved-Path');
    if (!savedPath) return;
    
    const card = document.createElement('div');
    card.className = 'saved-path-card';
    card.innerHTML = `
        <div class="saved-path-info">
            <span class="saved-path-label">Saved to Local Workspace</span>
            <span class="saved-path-value" title="Click to copy path">${savedPath}</span>
        </div>
        <button class="btn-copy-path">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy Path</span>
        </button>
    `;
    
    // Add copy function
    const copyBtn = card.querySelector('.btn-copy-path');
    copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(savedPath).then(() => {
            copyBtn.classList.add('success');
            copyBtn.querySelector('span').textContent = 'Copied!';
            showToast('Path copied to clipboard', 'success');
            
            setTimeout(() => {
                copyBtn.classList.remove('success');
                copyBtn.querySelector('span').textContent = 'Copy Path';
            }, 2000);
        }).catch(() => {
            showToast('Failed to copy path automatically. Please select and copy manually.', 'error');
        });
    });
    
    containerElement.appendChild(card);
}

// File Size Formatting Utility
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// Tab router based on location hash
function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.tab-view');
    const pageTitle = document.getElementById('page-title');

    function switchTab(tabId) {
        state.activeTab = tabId;
        
        // Update navigation classes
        navItems.forEach(item => {
            if (item.getAttribute('data-tab') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update active view
        views.forEach(view => {
            if (view.id === `view-${tabId}`) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        // Set topbar title
        const titles = {
            dashboard: 'Dashboard',
            merge: 'Merge PDFs',
            split: 'Split PDFs',
            compress: 'Compress PDF',
            rotate: 'Rotate Pages',
            watermark: 'Add Watermark'
        };
        pageTitle.textContent = titles[tabId] || 'PDF Toolkit';
    }

    // Hash navigation listener
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash && ['dashboard', 'merge', 'split', 'compress', 'rotate', 'watermark'].includes(hash)) {
            switchTab(hash);
        }
    });

    // Handle initial hash load
    const initialHash = window.location.hash.slice(1);
    if (initialHash) {
        switchTab(initialHash);
    }
}

// Setup Upload Dropzones
function initUploadZones() {
    const zones = document.querySelectorAll('.upload-zone');
    
    zones.forEach(zone => {
        const input = zone.querySelector('input[type="file"]');
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                input.files = e.dataTransfer.files;
                // Trigger change event manually
                const event = new Event('change');
                input.dispatchEvent(event);
            }
        });

        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        zone.addEventListener('click', (e) => {
            if (e.target === input) return;
            input.click();
        });
    });
}

// ==================== MERGE PDF LOGIC ====================
function initMergeUI() {
    const input = document.getElementById('merge-file-input');
    const clearBtn = document.getElementById('btn-merge-clear');
    const runBtn = document.getElementById('btn-run-merge');
    const uploadZone = document.getElementById('merge-upload-zone');
    const panel = document.getElementById('merge-panel');

    input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        showLoading('Analyzing PDF pages...');
        
        for (const file of files) {
            if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                showToast(`File "${file.name}" is not a PDF. Skipping.`, 'error');
                continue;
            }
            
            try {
                // Get page count using PDF.js
                const reader = new FileReader();
                const pageCount = await new Promise((resolve, reject) => {
                    reader.onload = async function() {
                        try {
                            const typedarray = new Uint8Array(this.result);
                            const pdf = await pdfjsLib.getDocument(typedarray).promise;
                            resolve(pdf.numPages);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    reader.readAsArrayBuffer(file);
                });

                state.merge.files.push({
                    id: Math.random().toString(36).substring(2, 9),
                    name: file.name,
                    file: file,
                    pages: pageCount
                });
            } catch (err) {
                showToast(`Error reading "${file.name}": Invalid PDF structure.`, 'error');
            }
        }

        hideLoading();
        input.value = ''; // Reset input element
        renderMergeFileList();
    });

    clearBtn.addEventListener('click', () => {
        state.merge.files = [];
        renderMergeFileList();
        showToast('Document list cleared', 'info');
    });

    runBtn.addEventListener('click', async () => {
        if (state.merge.files.length < 2) {
            showToast('Please upload at least 2 PDFs to merge.', 'error');
            return;
        }

        showLoading('Merging documents...');
        const formData = new FormData();
        state.merge.files.forEach(item => {
            formData.append('files', item.file);
        });

        try {
            const response = await fetch('/api/merge', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to merge PDFs.');
            }

            // Expose path in UI
            const panel = document.getElementById('merge-panel');
            displaySavedLocation(response, panel);

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'merged_document.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('PDFs merged successfully!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });
}

function renderMergeFileList() {
    const list = document.getElementById('merge-file-list');
    const panel = document.getElementById('merge-panel');
    const uploadZone = document.getElementById('merge-upload-zone');
    
    list.innerHTML = '';

    if (state.merge.files.length === 0) {
        panel.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        return;
    }

    panel.classList.remove('hidden');
    uploadZone.classList.add('hidden');

    state.merge.files.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'file-item';
        itemEl.innerHTML = `
            <div class="file-item-info">
                <span class="file-idx">${index + 1}</span>
                <div class="file-item-details">
                    <span class="file-name" title="${item.name}">${item.name}</span>
                    <span class="file-meta">${item.pages} page(s) • ${formatBytes(item.file.size)}</span>
                </div>
            </div>
            <div class="file-item-actions">
                <button class="btn-icon btn-move-up" data-id="${item.id}" ${index === 0 ? 'disabled style="opacity: 0.3; cursor: default"' : ''}>
                    ${icons.arrowUp}
                </button>
                <button class="btn-icon btn-move-down" data-id="${item.id}" ${index === state.merge.files.length - 1 ? 'disabled style="opacity: 0.3; cursor: default"' : ''}>
                    ${icons.arrowDown}
                </button>
                <button class="btn-icon btn-delete btn-danger" data-id="${item.id}">
                    ${icons.trash}
                </button>
            </div>
        `;
        list.appendChild(itemEl);
    });

    // Add reordering/removal event listeners
    document.querySelectorAll('.btn-move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            const idx = state.merge.files.findIndex(f => f.id === id);
            if (idx > 0) {
                // swap with previous
                const temp = state.merge.files[idx];
                state.merge.files[idx] = state.merge.files[idx - 1];
                state.merge.files[idx - 1] = temp;
                renderMergeFileList();
            }
        });
    });

    document.querySelectorAll('.btn-move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            const idx = state.merge.files.findIndex(f => f.id === id);
            if (idx < state.merge.files.length - 1) {
                // swap with next
                const temp = state.merge.files[idx];
                state.merge.files[idx] = state.merge.files[idx + 1];
                state.merge.files[idx + 1] = temp;
                renderMergeFileList();
            }
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            state.merge.files = state.merge.files.filter(f => f.id !== id);
            renderMergeFileList();
            showToast('Document removed', 'info');
        });
    });
}


// ==================== SPLIT PDF LOGIC ====================
function initSplitUI() {
    const input = document.getElementById('split-file-input');
    const uploadZone = document.getElementById('split-upload-zone');
    const panel = document.getElementById('split-panel');
    const selectAllBtn = document.getElementById('btn-split-select-all');
    const clearBtn = document.getElementById('btn-split-clear');
    const runBtn = document.getElementById('btn-run-split');
    const rangesInput = document.getElementById('split-ranges-input');

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading('Rendering visual pages...');
        state.split.file = file;
        state.split.selectedPages.clear();
        rangesInput.value = '';

        try {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    state.split.totalPages = pdf.numPages;
                    document.getElementById('split-total-pages').textContent = pdf.numPages;
                    document.getElementById('split-selected-pages').textContent = '0';
                    
                    // Render page thumbnails visually
                    await renderPageVisualizer(pdf, 'split-page-grid', (pageIdx, isSelected) => {
                        if (isSelected) {
                            state.split.selectedPages.add(pageIdx);
                        } else {
                            state.split.selectedPages.delete(pageIdx);
                        }
                        updateSplitMetrics();
                    });

                    panel.classList.remove('hidden');
                    uploadZone.classList.add('hidden');
                } catch (err) {
                    showToast('Failed to parse PDF pages', 'error');
                } finally {
                    hideLoading();
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            showToast('Error reading file data', 'error');
            hideLoading();
        }
    });

    selectAllBtn.addEventListener('click', () => {
        const cards = document.querySelectorAll('#split-page-grid .page-thumb-card');
        cards.forEach(card => {
            const idx = parseInt(card.getAttribute('data-index'));
            card.classList.add('selected');
            state.split.selectedPages.add(idx);
        });
        updateSplitMetrics();
    });

    clearBtn.addEventListener('click', () => {
        const cards = document.querySelectorAll('#split-page-grid .page-thumb-card');
        cards.forEach(card => {
            card.classList.remove('selected');
        });
        state.split.selectedPages.clear();
        updateSplitMetrics();
    });

    // Synchronize textbox page ranges with visual clicks
    rangesInput.addEventListener('input', () => {
        // Read text and select pages visually
        const text = rangesInput.value.trim();
        if (text === '') {
            state.split.selectedPages.clear();
            document.querySelectorAll('#split-page-grid .page-thumb-card').forEach(c => c.classList.remove('selected'));
            updateSplitMetrics(false);
            return;
        }

        const selected = new Set();
        const parts = text.split(',');
        for (let part of parts) {
            part = part.trim();
            if (part.includes('-')) {
                const [startStr, endStr] = part.split('-');
                const start = parseInt(startStr) - 1;
                const end = parseInt(endStr) - 1;
                if (!isNaN(start) && !isNaN(end)) {
                    const low = Math.min(start, end);
                    const high = Math.max(start, end);
                    for (let i = low; i <= high; i++) {
                        if (i >= 0 && i < state.split.totalPages) {
                            selected.add(i);
                        }
                    }
                }
            } else {
                const idx = parseInt(part) - 1;
                if (!isNaN(idx) && idx >= 0 && idx < state.split.totalPages) {
                    selected.add(idx);
                }
            }
        }

        // Highlight cards
        document.querySelectorAll('#split-page-grid .page-thumb-card').forEach(card => {
            const index = parseInt(card.getAttribute('data-index'));
            if (selected.has(index)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        state.split.selectedPages = selected;
        document.getElementById('split-selected-pages').textContent = selected.size;
    });

    runBtn.addEventListener('click', async () => {
        if (!state.split.file) return;

        // Collect page list
        const pagesArray = Array.from(state.split.selectedPages).sort((a, b) => a - b);
        if (pagesArray.length === 0) {
            showToast('Please select at least one page to extract.', 'error');
            return;
        }

        showLoading('Extracting pages...');
        const formData = new FormData();
        formData.append('file', state.split.file);
        // We can send the page numbers directly as JSON list
        formData.append('pages', JSON.stringify(pagesArray));

        try {
            const response = await fetch('/api/split', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to split PDF.');
            }

            // Expose path in UI
            const controls = document.querySelector('#split-panel .split-controls');
            displaySavedLocation(response, controls);

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `extracted_pages.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Pages extracted successfully!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });
}

function updateSplitMetrics(updateInput = true) {
    document.getElementById('split-selected-pages').textContent = state.split.selectedPages.size;
    
    if (updateInput) {
        const rangesInput = document.getElementById('split-ranges-input');
        if (state.split.selectedPages.size === 0) {
            rangesInput.value = '';
            return;
        }
        
        // Build readable range string (e.g. 1-3, 5)
        const pagesArray = Array.from(state.split.selectedPages).sort((a, b) => a - b);
        const ranges = [];
        let start = pagesArray[0];
        let prev = start;

        for (let i = 1; i <= pagesArray.length; i++) {
            const curr = pagesArray[i];
            if (curr === prev + 1) {
                prev = curr;
            } else {
                if (start === prev) {
                    ranges.push(`${start + 1}`);
                } else {
                    ranges.push(`${start + 1}-${prev + 1}`);
                }
                start = curr;
                prev = curr;
            }
        }
        rangesInput.value = ranges.join(', ');
    }
}


// ==================== COMPRESS PDF LOGIC ====================
function initCompressUI() {
    const input = document.getElementById('compress-file-input');
    const uploadZone = document.getElementById('compress-upload-zone');
    const panel = document.getElementById('compress-panel');
    const resultPanel = document.getElementById('compress-result-panel');
    const runBtn = document.getElementById('btn-run-compress');
    const downloadBtn = document.getElementById('btn-download-compressed');
    const restartBtn = document.getElementById('btn-compress-restart');

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        state.compress.file = file;
        document.getElementById('compress-filename').textContent = file.name;
        
        panel.classList.remove('hidden');
        uploadZone.classList.add('hidden');
        resultPanel.classList.add('hidden');
    });

    runBtn.addEventListener('click', async () => {
        if (!state.compress.file) return;

        const level = document.querySelector('input[name="compression-level"]:checked').value;
        showLoading('Compressing content streams...');

        const formData = new FormData();
        formData.append('file', state.compress.file);
        formData.append('level', level);

        try {
            const response = await fetch('/api/compress', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Compression failed.');
            }

            // Expose path in UI
            const resultCard = document.querySelector('#compress-result-panel .result-card');
            displaySavedLocation(response, resultCard);

            const origSize = parseInt(response.headers.get('X-Original-Size')) || state.compress.file.size;
            const newSize = parseInt(response.headers.get('X-Compressed-Size'));
            
            const blob = await response.blob();
            state.compress.resultBlob = blob;

            // Render stats card
            document.getElementById('comp-stat-orig').textContent = formatBytes(origSize);
            document.getElementById('comp-stat-new').textContent = formatBytes(newSize);
            
            const ratio = ((origSize - newSize) / origSize) * 100;
            const savedPercentage = Math.max(0, ratio).toFixed(1);
            document.getElementById('comp-stat-saved').textContent = `${savedPercentage}%`;

            panel.classList.add('hidden');
            resultPanel.classList.remove('hidden');
            showToast('PDF compressed successfully!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (!state.compress.resultBlob) return;
        const url = window.URL.createObjectURL(state.compress.resultBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `compressed_${state.compress.file.name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    restartBtn.addEventListener('click', () => {
        state.compress.file = null;
        state.compress.resultBlob = null;
        input.value = '';
        uploadZone.classList.remove('hidden');
        resultPanel.classList.add('hidden');
    });
}


// ==================== ROTATE PDF LOGIC ====================
function initRotateUI() {
    const input = document.getElementById('rotate-file-input');
    const uploadZone = document.getElementById('rotate-upload-zone');
    const panel = document.getElementById('rotate-panel');
    const resetBtn = document.getElementById('btn-rotate-clear');
    const rotateAll90Btn = document.getElementById('btn-rotate-all-90');
    const runBtn = document.getElementById('btn-run-rotate');

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading('Rendering rotation preview...');
        state.rotate.file = file;
        state.rotate.rotations = {};

        try {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    state.rotate.totalPages = pdf.numPages;
                    
                    // Render page thumbnails visually with rotation triggers
                    await renderRotatePageVisualizer(pdf);

                    panel.classList.remove('hidden');
                    uploadZone.classList.add('hidden');
                } catch (err) {
                    showToast('Failed to load PDF pages', 'error');
                } finally {
                    hideLoading();
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            showToast('Error reading file data', 'error');
            hideLoading();
        }
    });

    rotateAll90Btn.addEventListener('click', () => {
        const cards = document.querySelectorAll('#rotate-page-grid .page-thumb-card');
        cards.forEach(card => {
            const idx = parseInt(card.getAttribute('data-index'));
            const currentAngle = state.rotate.rotations[idx] || 0;
            const newAngle = (currentAngle + 90) % 360;
            state.rotate.rotations[idx] = newAngle;
            
            // Apply visual rotation style
            const canvas = card.querySelector('canvas');
            canvas.style.transform = `rotate(${newAngle}deg)`;
            
            // Show badge
            let badge = card.querySelector('.rotate-badge');
            if (newAngle > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'rotate-badge';
                    card.appendChild(badge);
                }
                badge.textContent = `+${newAngle}°`;
            } else if (badge) {
                badge.remove();
            }
        });
        showToast('Rotated all pages by 90°', 'info');
    });

    resetBtn.addEventListener('click', () => {
        state.rotate.rotations = {};
        document.querySelectorAll('#rotate-page-grid .page-thumb-card').forEach(card => {
            const canvas = card.querySelector('canvas');
            canvas.style.transform = 'rotate(0deg)';
            const badge = card.querySelector('.rotate-badge');
            if (badge) badge.remove();
        });
        showToast('Rotations reset', 'info');
    });

    runBtn.addEventListener('click', async () => {
        if (!state.rotate.file) return;

        // Check if there are active rotations
        const activeRotations = {};
        let count = 0;
        for (const [idx, angle] of Object.entries(state.rotate.rotations)) {
            if (angle > 0) {
                activeRotations[idx] = angle;
                count++;
            }
        }

        if (count === 0) {
            showToast('No rotations selected. Output will match input.', 'info');
        }

        showLoading('Applying page rotations...');
        const formData = new FormData();
        formData.append('file', state.rotate.file);
        formData.append('rotations', JSON.stringify(activeRotations));

        try {
            const response = await fetch('/api/rotate', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Rotation failed.');
            }

            // Expose path in UI
            const panel = document.getElementById('rotate-panel');
            displaySavedLocation(response, panel);

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rotated_${state.rotate.file.name}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Rotations applied successfully!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });
}

// Debounce Helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Global Intersection Observer for Lazy Rendering PDF Page Previews
const visualizerObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const card = entry.target;
            const pageNum = parseInt(card.getAttribute('data-page-num'));
            const pdf = card.pdfDoc;
            const canvas = card.querySelector('canvas');
            const container = card.querySelector('.page-canvas-container');
            const scale = parseFloat(card.getAttribute('data-scale') || '0.18');
            
            if (canvas && !canvas.getAttribute('data-rendered') && pdf) {
                canvas.setAttribute('data-rendered', 'true');
                pdf.getPage(pageNum).then(page => {
                    const viewport = page.getViewport({ scale: scale });
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise.then(() => {
                        if (container) {
                            container.classList.remove('skeleton-thumb');
                        }
                    }).catch(() => {
                        canvas.removeAttribute('data-rendered');
                    });
                }).catch(err => {
                    canvas.removeAttribute('data-rendered');
                });
            }
            observer.unobserve(card);
        }
    });
}, { root: null, rootMargin: '150px 0px', threshold: 0.05 });

async function renderRotatePageVisualizer(pdf) {
    const grid = document.getElementById('rotate-page-grid');
    grid.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const pageIdx = pageNum - 1;
        
        const card = document.createElement('div');
        card.className = 'page-thumb-card';
        card.setAttribute('data-index', pageIdx);
        card.setAttribute('data-page-num', pageNum);
        card.setAttribute('data-scale', '0.18');
        card.pdfDoc = pdf;

        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'page-canvas-container skeleton-thumb';

        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);

        const rotateBtn = document.createElement('button');
        rotateBtn.className = 'rotate-overlay-btn';
        rotateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`;
        canvasContainer.appendChild(rotateBtn);

        const label = document.createElement('span');
        label.className = 'page-number-label';
        label.textContent = `Page ${pageNum}`;

        card.appendChild(canvasContainer);
        card.appendChild(label);
        grid.appendChild(card);

        // Observe card for lazy loading
        visualizerObserver.observe(card);

        // Rotate click handler
        rotateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentAngle = state.rotate.rotations[pageIdx] || 0;
            const newAngle = (currentAngle + 90) % 360;
            state.rotate.rotations[pageIdx] = newAngle;

            // Apply rotation style to canvas
            canvas.style.transform = `rotate(${newAngle}deg)`;

            // Badge updates
            let badge = card.querySelector('.rotate-badge');
            if (newAngle > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'rotate-badge';
                    card.appendChild(badge);
                }
                badge.textContent = `+${newAngle}°`;
            } else if (badge) {
                badge.remove();
            }
        });
    }
}


// ==================== WATERMARK PDF LOGIC ====================
function initWatermarkUI() {
    const input = document.getElementById('watermark-file-input');
    const uploadZone = document.getElementById('watermark-upload-zone');
    const panel = document.getElementById('watermark-panel');
    const runBtn = document.getElementById('btn-run-watermark');

    // Control selectors
    const wmText = document.getElementById('wm-text');
    const wmFont = document.getElementById('wm-font');
    const wmColor = document.getElementById('wm-color');
    const wmSize = document.getElementById('wm-size');
    const wmOpacity = document.getElementById('wm-opacity');
    const wmRotation = document.getElementById('wm-rotation');
    const wmPosition = document.getElementById('wm-position');

    // Values indicators
    const valSize = document.getElementById('val-wm-size');
    const valOpacity = document.getElementById('val-wm-opacity');
    const valRotation = document.getElementById('val-wm-rotation');

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading('Generating live preview canvas...');
        state.watermark.file = file;

        try {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    state.watermark.pdfDocument = pdf;

                    // Render first page as background for the watermark preview
                    const page = await pdf.getPage(1);
                    const wrapper = document.getElementById('preview-wrapper');
                    const canvas = document.getElementById('watermark-preview-canvas');
                    
                    const viewport = page.getViewport({ scale: 0.7 }); // slightly reduced to fit viewport nicely and load fast
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    wrapper.style.width = `${viewport.width}px`;
                    wrapper.style.height = `${viewport.height}px`;

                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    panel.classList.remove('hidden');
                    uploadZone.classList.add('hidden');
                    
                    // Render initial overlay preview
                    updateWatermarkPreview();
                } catch (err) {
                    showToast('Failed to preview PDF layout', 'error');
                } finally {
                    hideLoading();
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            showToast('Error reading file data', 'error');
            hideLoading();
        }
    });

    // Control Listeners for real-time visual update with debounce
    const debouncedUpdatePreview = debounce(updateWatermarkPreview, 100);
    const controls = [wmText, wmFont, wmColor, wmSize, wmOpacity, wmRotation, wmPosition];
    controls.forEach(control => {
        control.addEventListener('input', () => {
            // Update labels immediately
            valSize.textContent = `${wmSize.value}px`;
            valOpacity.textContent = wmOpacity.value;
            valRotation.textContent = `${wmRotation.value}°`;
            
            // Update overlay preview debounced
            debouncedUpdatePreview();
        });
    });

    runBtn.addEventListener('click', async () => {
        if (!state.watermark.file) return;

        showLoading('Applying watermarks to all pages...');
        
        const formData = new FormData();
        formData.append('file', state.watermark.file);
        formData.append('text', wmText.value);
        formData.append('font', wmFont.value);
        formData.append('size', wmSize.value);
        formData.append('color', wmColor.value);
        formData.append('opacity', wmOpacity.value);
        formData.append('rotation', wmRotation.value);
        formData.append('position', wmPosition.value);

        try {
            const response = await fetch('/api/watermark', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Watermarking failed.');
            }

            // Expose path in UI
            const controls = document.querySelector('#watermark-panel .split-controls');
            displaySavedLocation(response, controls);

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `watermarked_${state.watermark.file.name}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Watermarks overlayed successfully!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });
}

function updateWatermarkPreview() {
    const overlay = document.getElementById('watermark-overlay');
    const wrapper = document.getElementById('preview-wrapper');
    if (!overlay || !wrapper) return;
    
    const text = document.getElementById('wm-text').value || ' ';
    const font = document.getElementById('wm-font').value;
    const color = document.getElementById('wm-color').value;
    const size = parseInt(document.getElementById('wm-size').value) * 0.7; // scaled visual size to match viewport 0.7
    const opacity = document.getElementById('wm-opacity').value;
    const rotation = document.getElementById('wm-rotation').value;
    const position = document.getElementById('wm-position').value;

    // Reset styles
    overlay.className = 'watermark-overlay-element';
    overlay.innerHTML = '';
    overlay.style = '';

    // Apply basic typography & color parameters
    overlay.style.fontFamily = font === 'Times-Roman' ? '"Times New Roman", Times, serif' : 
                               font === 'Courier' ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif';
    overlay.style.fontSize = `${size}px`;
    overlay.style.color = color;
    overlay.style.opacity = opacity;

    if (position === 'tiled') {
        overlay.className = 'watermark-overlay-tiled';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.opacity = opacity;
        
        // Draw 16 grid blocks
        for (let i = 0; i < 16; i++) {
            const tile = document.createElement('div');
            tile.className = 'tile-element';
            tile.textContent = text;
            tile.style.fontFamily = overlay.style.fontFamily;
            tile.style.fontSize = `${size * 0.8}px`;
            tile.style.color = color;
            tile.style.transform = `rotate(${rotation}deg)`;
            overlay.appendChild(tile);
        }
    } else {
        // Individual layout positions
        overlay.textContent = text;
        
        // Layout options mapping
        switch(position) {
            case 'center':
                overlay.style.top = '50%';
                overlay.style.left = '50%';
                overlay.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
                break;
            case 'top-left':
                overlay.style.top = '25px';
                overlay.style.left = '25px';
                overlay.style.transformOrigin = 'left center';
                overlay.style.transform = `rotate(${rotation}deg)`;
                break;
            case 'top-right':
                overlay.style.top = '25px';
                overlay.style.right = '25px';
                overlay.style.transformOrigin = 'right center';
                overlay.style.transform = `rotate(${rotation}deg)`;
                break;
            case 'bottom-left':
                overlay.style.bottom = '25px';
                overlay.style.left = '25px';
                overlay.style.transformOrigin = 'left center';
                overlay.style.transform = `rotate(${rotation}deg)`;
                break;
            case 'bottom-right':
                overlay.style.bottom = '25px';
                overlay.style.right = '25px';
                overlay.style.transformOrigin = 'right center';
                overlay.style.transform = `rotate(${rotation}deg)`;
                break;
        }
    }
}


// ==================== VISUAL PAGE SELECTOR RENDERER (SPLIT/ROTATE) ====================
async function renderPageVisualizer(pdf, targetGridId, onCardToggle) {
    const grid = document.getElementById(targetGridId);
    grid.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const pageIdx = pageNum - 1;
        
        const card = document.createElement('div');
        card.className = 'page-thumb-card';
        card.setAttribute('data-index', pageIdx);
        card.setAttribute('data-page-num', pageNum);
        card.setAttribute('data-scale', '0.18');
        card.pdfDoc = pdf;

        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'page-canvas-container skeleton-thumb';

        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);

        const label = document.createElement('span');
        label.className = 'page-number-label';
        label.textContent = `Page ${pageNum}`;

        card.appendChild(canvasContainer);
        card.appendChild(label);
        grid.appendChild(card);

        // Observe card for lazy loading
        visualizerObserver.observe(card);

        // Click handler to toggle selection state
        card.addEventListener('click', () => {
            const isSelected = card.classList.toggle('selected');
            if (onCardToggle) {
                onCardToggle(pageIdx, isSelected);
            }
        });
    }
}
