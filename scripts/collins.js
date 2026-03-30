// Popup script for Collins to Anki extension

window.currentSaveMode = 'examples';
window.batchSaveState = {
    running: false,
    stopRequested: false,
    tabId: null,
    dictCode: '',
    words: [],
    index: 0,
    savedCount: 0,
    failedCount: 0,
    logs: []
};

// Helper function to show status messages
function showStatus(message, type = 'success') {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type} show`;
    
    setTimeout(() => {
        statusDiv.classList.remove('show');
    }, 3000);
}

function updateBatchProgress(message, type = 'info') {
    const progressEl = document.getElementById('batch-progress');
    if (!progressEl) return;

    progressEl.textContent = message;
    progressEl.style.color = type === 'error' ? '#dc3545' : '#495057';
}

function setBatchUiRunning(isRunning) {
    const startBtn = document.getElementById('start-batch-save');
    const stopBtn = document.getElementById('stop-batch-save');

    if (!startBtn || !stopBtn) return;
    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;
}

function parseBatchWords(inputText) {
    return Array.from(
        new Set(
            inputText
                .split(/\r?\n/)
                .map(w => w.trim())
                .filter(Boolean)
        )
    );
}

function extractDictCodeFromUrl(urlString) {
    try {
        const url = new URL(urlString);
        const dictCodeFromQuery = url.searchParams.get('dictCode');
        if (dictCodeFromQuery) {
            return dictCodeFromQuery;
        }

        const match = url.pathname.match(/^\/dictionary\/([^/]+)\//i);
        if (match && match[1]) {
            return match[1];
        }

        return '';
    } catch (error) {
        return '';
    }
}

function buildCollinsWordUrl(word, dictCode) {
    return `https://www.collinsdictionary.com/search/?dictCode=${dictCode}&q=${encodeURIComponent(word)}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getBatchStatusClass(status) {
    if (status === 'saved+updated') return 'saved-updated';
    if (status === 'saved') return 'saved';
    if (status === 'updated') return 'updated';
    return 'failed';
}

function formatBatchStatusLabel(status) {
    if (status === 'saved+updated') return 'Saved + Updated';
    if (status === 'saved') return 'Saved';
    if (status === 'updated') return 'Updated';
    return 'Failed';
}

function updateBatchLogTitle() {
    const titleEl = document.getElementById('batch-log-title');
    if (!titleEl) return;
    titleEl.textContent = `Batch Log (${window.batchSaveState.logs.length})`;
}

function resetBatchLog() {
    const container = document.getElementById('batch-log');
    if (!container) return;

    window.batchSaveState.logs = [];
    container.innerHTML = '<div class="batch-log-empty">No batch logs yet.</div>';
    updateBatchLogTitle();
}

function appendBatchLogEntry(entry) {
    const container = document.getElementById('batch-log');
    if (!container) return;

    const state = window.batchSaveState;
    state.logs.push(entry);

    const emptyEl = container.querySelector('.batch-log-empty');
    if (emptyEl) {
        emptyEl.remove();
    }

    const item = document.createElement('div');
    item.className = `batch-log-item ${entry.ok ? 'success' : 'error'}`;

    const statusClass = getBatchStatusClass(entry.status);
    const statusLabel = formatBatchStatusLabel(entry.status);
    const counts = entry.counts || {
        wordsSaved: 0,
        wordsUpdated: 0,
        examplesSaved: 0,
        examplesUpdated: 0
    };

    item.innerHTML = `
        <div class="batch-log-head">
            <span class="batch-log-status ${statusClass}">${escapeHtml(statusLabel)}</span>
            <span class="batch-log-meta">${escapeHtml(entry.time)} | ${escapeHtml(entry.stepLabel)} | ${escapeHtml(entry.durationMs + 'ms')}</span>
        </div>
        <div class="batch-log-detail"><strong>Word:</strong> <span class="batch-log-code">${escapeHtml(entry.word)}</span></div>
        <div class="batch-log-detail"><strong>URL:</strong> <span class="batch-log-code">${escapeHtml(entry.url)}</span></div>
        <div class="batch-log-detail"><strong>Words:</strong> +${counts.wordsSaved} saved, ${counts.wordsUpdated} updated</div>
        <div class="batch-log-detail"><strong>Examples:</strong> +${counts.examplesSaved} saved, ${counts.examplesUpdated} updated</div>
        ${entry.error ? `<div class="batch-log-error"><strong>Error:</strong> ${escapeHtml(entry.error)}</div>` : ''}
    `;

    container.prepend(item);
    updateBatchLogTitle();
}

function saveAllFromTab(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'saveAllFromPage' }, function(response) {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (!response || !response.success) {
                reject(new Error((response && response.error) || 'Failed to save from page'));
                return;
            }

            resolve(response);
        });
    });
}

function waitForTabLoadComplete(tabId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        let done = false;

        const timeoutId = setTimeout(() => {
            if (done) return;
            done = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            reject(new Error('Timed out waiting for page load'));
        }, timeoutMs);

        function onUpdated(updatedTabId, changeInfo) {
            if (done) return;
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                done = true;
                clearTimeout(timeoutId);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve();
            }
        }

        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

async function processBatchWordAtCurrentIndex() {
    const state = window.batchSaveState;

    if (!state.running || state.stopRequested) {
        return;
    }

    if (state.index >= state.words.length) {
        state.running = false;
        setBatchUiRunning(false);
        updateStats();
        const doneMessage = `Batch done. Saved: ${state.savedCount}, Failed: ${state.failedCount}`;
        updateBatchProgress(doneMessage);
        showStatus(doneMessage, state.failedCount > 0 ? 'error' : 'success');
        return;
    }

    const word = state.words[state.index];
    const targetUrl = buildCollinsWordUrl(word, state.dictCode);
    const currentStep = `${state.index + 1}/${state.words.length}`;
    updateBatchProgress(`Processing ${currentStep}: ${word}`);
    const startedAt = Date.now();

    try {
        await new Promise((resolve, reject) => {
            chrome.tabs.update(state.tabId, { url: targetUrl }, function(updatedTab) {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!updatedTab || !updatedTab.id) {
                    reject(new Error('Could not update tab'));
                    return;
                }
                state.tabId = updatedTab.id;
                resolve();
            });
        });

        await waitForTabLoadComplete(state.tabId);
        const saveResponse = await saveAllFromTab(state.tabId);

        const counts = (saveResponse && saveResponse.data) || {
            wordsSaved: 0,
            wordsUpdated: 0,
            examplesSaved: 0,
            examplesUpdated: 0
        };
        const addedTotal = (counts.wordsSaved || 0) + (counts.examplesSaved || 0);
        const updatedTotal = (counts.wordsUpdated || 0) + (counts.examplesUpdated || 0);

        let status = 'saved';
        if (addedTotal > 0 && updatedTotal > 0) {
            status = 'saved+updated';
        } else if (addedTotal === 0 && updatedTotal > 0) {
            status = 'updated';
        }

        state.savedCount++;
        updateBatchProgress(`Saved ${currentStep}: ${word}`);
        appendBatchLogEntry({
            ok: true,
            status,
            word,
            url: targetUrl,
            counts,
            stepLabel: currentStep,
            time: new Date().toLocaleTimeString(),
            durationMs: Date.now() - startedAt
        });
    } catch (error) {
        state.failedCount++;
        updateBatchProgress(`Failed ${currentStep}: ${word} (${error.message})`, 'error');
        appendBatchLogEntry({
            ok: false,
            status: 'failed',
            word,
            url: targetUrl,
            counts: {
                wordsSaved: 0,
                wordsUpdated: 0,
                examplesSaved: 0,
                examplesUpdated: 0
            },
            stepLabel: currentStep,
            time: new Date().toLocaleTimeString(),
            durationMs: Date.now() - startedAt,
            error: error.message
        });
    }

    state.index++;

    if (state.stopRequested) {
        state.running = false;
        setBatchUiRunning(false);
        const stoppedMessage = `Batch stopped. Saved: ${state.savedCount}, Failed: ${state.failedCount}`;
        updateBatchProgress(stoppedMessage);
        showStatus(stoppedMessage, 'error');
        return;
    }

    window.setTimeout(processBatchWordAtCurrentIndex, 200);
}

function startBatchSave() {
    const state = window.batchSaveState;
    if (state.running) {
        showStatus('Batch save is already running', 'error');
        return;
    }

    const textarea = document.getElementById('batch-word-list');
    const inputWords = parseBatchWords(textarea.value);

    if (inputWords.length === 0) {
        showStatus('Please input at least one word', 'error');
        updateBatchProgress('No valid words in list', 'error');
        return;
    }

    resetBatchLog();

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            showStatus('No active tab found', 'error');
            return;
        }

        const dictCode = extractDictCodeFromUrl(activeTab.url || '');
        if (!dictCode) {
            showStatus('Cannot detect dictCode from current tab URL', 'error');
            updateBatchProgress('Open a Collins dictionary/search page first (dictCode required)', 'error');
            return;
        }

        state.running = true;
        state.stopRequested = false;
        state.tabId = activeTab.id;
        state.dictCode = dictCode;
        state.words = inputWords;
        state.index = 0;
        state.savedCount = 0;
        state.failedCount = 0;

        setBatchUiRunning(true);
        updateBatchProgress(`Starting batch: ${inputWords.length} words (dictCode=${dictCode})`);
        showStatus(`Batch started for ${inputWords.length} words (dictCode=${dictCode})`, 'success');

        processBatchWordAtCurrentIndex();
    });
}

function stopBatchSave() {
    const state = window.batchSaveState;
    if (!state.running) return;
    state.stopRequested = true;
    updateBatchProgress('Stopping batch after current word...');
}

// Update the word count and stats
function updateStats() {
    chrome.storage.local.get(['savedWords', 'savedExamples'], function(result) {
        const savedWords = result.savedWords || [];
        const savedExamples = result.savedExamples || [];
        const wordCount = savedWords.length;
        const exampleCount = savedExamples.length;
        
        // Update counts
        document.getElementById('word-count').textContent = wordCount;
        document.getElementById('example-count').textContent = exampleCount;
        
        // Calculate storage size (approximate)
        const totalSize = JSON.stringify(savedWords).length + JSON.stringify(savedExamples).length;
        const storageSize = (totalSize / 1024).toFixed(2);
        document.getElementById('storage-size').textContent = `${storageSize} KB`;
        
        // Enable/disable buttons
        document.getElementById('download-words').disabled = wordCount === 0;
        document.getElementById('clear-words').disabled = wordCount === 0;
        document.getElementById('download-examples').disabled = exampleCount === 0;
        document.getElementById('clear-examples').disabled = exampleCount === 0;
        
        // Update lists
        displaySavedWords(savedWords);
        displaySavedExamples(savedExamples);
    });
}

// Display saved words in the list
function displaySavedWords(savedWords) {
    const container = document.getElementById('saved-words-container');
    
    if (savedWords.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                    <path d="M7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/>
                </svg>
                <p>No saved words yet.</p>
                <p style="font-size: 12px;">Click "Save Full Word" on a Collins Dictionary page</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = savedWords.map((word, index) => {
        return `
        <div class="word-item" data-index="${index}">
            <div class="word-info">
                <div class="word-name">&#128218; ${word.word}</div>
                <div class="word-pos">${word.pos || 'unknown'}</div>
            </div>
            <button class="delete-btn" data-index="${index}">Delete</button>
        </div>
        `;
    }).join('');
    
    // Add delete button listeners
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const indexToDelete = parseInt(this.getAttribute('data-index'));
            deleteWordByIndex(indexToDelete);
        });
    });
}

// Display saved examples in the list
function displaySavedExamples(savedExamples) {
    const container = document.getElementById('saved-examples-container');
    
    if (savedExamples.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                    <path d="M7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/>
                </svg>
                <p>No saved examples yet.</p>
                <p style="font-size: 12px;">Click "Save Examples" on a Collins Dictionary page</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = savedExamples.map((example, index) => {
        return `
        <div class="word-item" data-index="${index}">
            <div class="word-info">
                <div class="word-name">&#128221; ${example.word}</div>
                <div class="word-pos">${example.exampleText.substring(0, 50)}...</div>
            </div>
            <button class="delete-btn" data-index="${index}">Delete</button>
        </div>
        `;
    }).join('');
    
    // Add delete button listeners
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const indexToDelete = parseInt(this.getAttribute('data-index'));
            deleteExampleByIndex(indexToDelete);
        });
    });
}

// Delete a specific word by index
function deleteWordByIndex(index) {
    chrome.storage.local.get(['savedWords'], function(result) {
        const savedWords = result.savedWords || [];
        
        if (index >= 0 && index < savedWords.length) {
            const deletedWord = savedWords[index];
            savedWords.splice(index, 1);
            
            chrome.storage.local.set({ savedWords: savedWords }, function() {
                showStatus(`"${deletedWord.word}" deleted`, 'success');
                updateStats();
            });
        }
    });
}

// Delete a specific example by index
function deleteExampleByIndex(index) {
    chrome.storage.local.get(['savedExamples'], function(result) {
        const savedExamples = result.savedExamples || [];
        
        if (index >= 0 && index < savedExamples.length) {
            const deletedExample = savedExamples[index];
            savedExamples.splice(index, 1);
            
            chrome.storage.local.set({ savedExamples: savedExamples }, function() {
                showStatus(`Example deleted`, 'success');
                updateStats();
            });
        }
    });
}

// Download words CSV file
function downloadWordsCSV() {
    chrome.storage.local.get(['savedWords'], function(result) {
        const savedWords = result.savedWords || [];
        
        if (savedWords.length === 0) {
            showStatus('No words to export', 'error');
            return;
        }
        
        const csvContent = wordsToCSV(savedWords);
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `collins_words_${timestamp}.csv`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        }, () => {
            showStatus(`Downloaded ${savedWords.length} words`, 'success');
        });
    });
}

// Download examples CSV file
function downloadExamplesCSV() {
    chrome.storage.local.get(['savedExamples'], function(result) {
        const savedExamples = result.savedExamples || [];
        
        if (savedExamples.length === 0) {
            showStatus('No examples to export', 'error');
            return;
        }
        
        const csvContent = examplesToCSV(savedExamples);
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `collins_examples_${timestamp}.csv`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        }, () => {
            showStatus(`Downloaded ${savedExamples.length} examples`, 'success');
        });
    });
}

// Convert examples to CSV format (example, translation)
function examplesToCSV(examplesArray) {
    function escapeCSVField(field) {
        if (field == null) return '';
        
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return '"' + stringField.replace(/"/g, '""') + '"';
        }
        return stringField;
    }
    
    const csvRows = examplesArray.map(example => {
        return [
            escapeCSVField(example.exampleText),
            escapeCSVField(example.translation)
        ].join(',');
    });
    
    return csvRows.join('\n');
}

// Convert words to CSV format (without headers for Anki)
function wordsToCSV(wordDataArray) {
    function escapeCSVField(field) {
        if (field == null) return '';
        
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return '"' + stringField.replace(/"/g, '""') + '"';
        }
        return stringField;
    }
    
    const csvRows = wordDataArray.map(wordData => {
        const definitionsStr = wordData.definitions ? wordData.definitions.join('; ') : '';
        
        return [
            escapeCSVField(wordData.word),
            escapeCSVField(wordData.pronunciation),
            escapeCSVField(wordData.pronounciationAudio),
            escapeCSVField(wordData.pos),
            escapeCSVField(definitionsStr),
            escapeCSVField(wordData.fullDefinition),
            escapeCSVField(wordData.declTableHTML)
        ].join(',');
    });
    
    return csvRows.join('\n');
}

// Clear all saved words
function clearAllWords() {
    if (confirm('Are you sure you want to delete all saved words? This cannot be undone.')) {
        chrome.storage.local.set({ savedWords: [] }, function() {
            showStatus('All words cleared', 'success');
            updateStats();
        });
    }
}

// Clear all saved examples
function clearAllExamples() {
    if (confirm('Are you sure you want to delete all saved examples? This cannot be undone.')) {
        chrome.storage.local.set({ savedExamples: [] }, function() {
            showStatus('All examples cleared', 'success');
            updateStats();
        });
    }
}

// Get word data from active tab using message passing
function getWordDataFromActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const activeTab = tabs[0];
        
        if (!activeTab.url.includes('collinsdictionary.com/dictionary/')) {
            showStatus('Please navigate to a Collins Dictionary word page', 'error');
            return;
        }
        
        chrome.tabs.sendMessage(activeTab.id, { action: 'getWordData' }, function(response) {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                return;
            }
            
            if (response && response.success && response.data) {
                callback(response.data);
            } else {
                showStatus('Could not extract word data', 'error');
            }
        });
    });
}

// Save full word
function saveFullWord() {
    getWordDataFromActiveTab(function(wordDataArray) {
        if (wordDataArray.length > 0) {
            displayWordOptions(wordDataArray);
        }
    });
}

// Display full-word options in the panel with checkboxes
function displayWordOptions(wordDataArray) {
    const panel = document.getElementById('save-options-panel');
    const content = document.getElementById('save-options-content');
    const title = document.getElementById('save-options-title');
    
    let optionsHTML = '';
    
    wordDataArray.forEach((wordData, wordIndex) => {
        const definitionsText = (wordData.definitions || []).slice(0, 2).join('; ');
        const previewText = definitionsText || wordData.fullDefinition || 'No definition preview available';
        
        optionsHTML += `
            <div class="save-option-item" data-word-index="${wordIndex}">
                <input type="checkbox" class="example-checkbox" id="word-${wordIndex}">
                <div class="example-content">
                    <div class="option-label">${wordData.word} ${wordData.pos ? `(${wordData.pos})` : ''}</div>
                    <div class="option-preview">${previewText}</div>
                </div>
            </div>
        `;
    });
    
    if (optionsHTML === '') {
        content.innerHTML = '<p class="loading">No words found on this page</p>';
    } else {
        content.innerHTML = optionsHTML;
    }
    
    title.textContent = 'Select full words to save';
    panel.style.display = 'block';
    window.currentSaveMode = 'words';
    window.currentWordData = wordDataArray;
}

// Show examples selection panel
function showExamplesPanel() {
    getWordDataFromActiveTab(function(wordDataArray) {
        if (wordDataArray.length > 0) {
            displayExampleOptions(wordDataArray);
        }
    });
}

// Display example options in the panel with checkboxes
function displayExampleOptions(wordDataArray) {
    const panel = document.getElementById('save-options-panel');
    const content = document.getElementById('save-options-content');
    const title = document.getElementById('save-options-title');
    
    let optionsHTML = '';
    let exampleCounter = 0;
    
    wordDataArray.forEach((wordData, wordIndex) => {
        if (wordData.examples && wordData.examples.length > 0) {
            wordData.examples.forEach((example, exampleIndex) => {
                // Extract example text and translation from the example object
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = example.html;
                
                const sourceQuoteElements = tempDiv.querySelectorAll('.quote:not(.cit.type-translation .quote)');
                const sourceQuote = Array.from(sourceQuoteElements).map(el => el.innerText.trim()).join(', ');
                const translationElements = tempDiv.querySelectorAll('.cit.type-translation .quote');
                const translation = Array.from(translationElements).map(el => el.innerText.trim()).join(', ');
                
                optionsHTML += `
                    <div class="save-option-item" data-word-index="${wordIndex}" data-example-index="${exampleIndex}">
                        <input type="checkbox" class="example-checkbox" id="ex-${exampleCounter}">
                        <div class="example-content">
                            <div class="option-label">${wordData.word} - Example ${exampleIndex + 1}</div>
                            <div class="option-preview"><strong>${sourceQuote}</strong> → ${translation}</div>
                        </div>
                    </div>
                `;
                exampleCounter++;
            });
        }
    });
    
    if (optionsHTML === '') {
        content.innerHTML = '<p class="loading">No examples found on this page</p>';
    } else {
        content.innerHTML = optionsHTML;
    }
    
    title.textContent = 'Select examples to save';
    panel.style.display = 'block';
    
    // Store word data for later use
    window.currentSaveMode = 'examples';
    window.currentWordData = wordDataArray;
}

// Save selected full words
function saveSelectedWords() {
    const checkboxes = document.querySelectorAll('.example-checkbox:checked');
    
    if (checkboxes.length === 0) {
        showStatus('No words selected', 'error');
        return;
    }
    
    chrome.storage.local.get(['savedWords'], function(result) {
        const savedWords = result.savedWords || [];
        let newCount = 0;
        let updateCount = 0;
        
        checkboxes.forEach(checkbox => {
            const item = checkbox.closest('.save-option-item');
            const wordIndex = parseInt(item.getAttribute('data-word-index'));
            const wordData = window.currentWordData[wordIndex];
            
            const existingIndex = savedWords.findIndex(w => w.word === wordData.word && w.pos === wordData.pos);
            
            if (existingIndex !== -1) {
                savedWords[existingIndex] = wordData;
                updateCount++;
            } else {
                savedWords.push(wordData);
                newCount++;
            }
        });
        
        chrome.storage.local.set({ savedWords: savedWords }, function() {
            if (newCount > 0 && updateCount > 0) {
                showStatus(`${newCount} word(s) saved, ${updateCount} updated`, 'success');
            } else if (newCount > 0) {
                showStatus(`${newCount} word(s) saved!`, 'success');
            } else if (updateCount > 0) {
                showStatus(`${updateCount} word(s) updated`, 'success');
            }
            updateStats();
            document.getElementById('save-options-panel').style.display = 'none';
        });
    });
}

// Save selected examples
function saveSelectedExamples() {
    const checkboxes = document.querySelectorAll('.example-checkbox:checked');
    
    if (checkboxes.length === 0) {
        showStatus('No examples selected', 'error');
        return;
    }
    
    chrome.storage.local.get(['savedExamples'], function(result) {
        const savedExamples = result.savedExamples || [];
        let newCount = 0;
        let updateCount = 0;
        
        checkboxes.forEach(checkbox => {
            const item = checkbox.closest('.save-option-item');
            const wordIndex = parseInt(item.getAttribute('data-word-index'));
            const exampleIndex = parseInt(item.getAttribute('data-example-index'));
            
            const wordData = window.currentWordData[wordIndex];
            const example = wordData.examples[exampleIndex];
            
            // Extract example text and translation
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = example.html;
            
            const sourceQuoteElements = tempDiv.querySelectorAll('.quote:not(.cit.type-translation .quote)');
            const exampleText = Array.from(sourceQuoteElements).map(el => el.innerText.trim()).join(' ');
            const translationElements = tempDiv.querySelectorAll('.cit.type-translation .quote');
            const translation = Array.from(translationElements).map(el => el.innerText.trim()).join(', ');

            const exampleEntry = {
                word: wordData.word,
                exampleText: exampleText,
                translation: translation,
                fullHTML: example.html,
                timestamp: new Date().toISOString()
            };

            const existingIndex = savedExamples.findIndex(e =>
                e.word === exampleEntry.word &&
                e.exampleText === exampleEntry.exampleText &&
                e.translation === exampleEntry.translation
            );

            if (existingIndex !== -1) {
                savedExamples[existingIndex] = exampleEntry;
                updateCount++;
            } else {
                savedExamples.push(exampleEntry);
                newCount++;
            }
        });
        
        chrome.storage.local.set({ savedExamples: savedExamples }, function() {
            if (newCount > 0 && updateCount > 0) {
                showStatus(`${newCount} example(s) saved, ${updateCount} updated`, 'success');
            } else if (newCount > 0) {
                showStatus(`${newCount} example(s) saved!`, 'success');
            } else if (updateCount > 0) {
                showStatus(`${updateCount} example(s) updated`, 'success');
            }
            updateStats();
            document.getElementById('save-options-panel').style.display = 'none';
        });
    });
}

function saveSelectedFromPanel() {
    if (window.currentSaveMode === 'words') {
        saveSelectedWords();
    } else {
        saveSelectedExamples();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize stats
    updateStats();
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Update active tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Update active content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    // Button click handlers
    document.getElementById('save-full-word').addEventListener('click', saveFullWord);
    document.getElementById('save-examples').addEventListener('click', showExamplesPanel);
    
    document.getElementById('download-words').addEventListener('click', downloadWordsCSV);
    document.getElementById('download-examples').addEventListener('click', downloadExamplesCSV);
    
    document.getElementById('clear-words').addEventListener('click', clearAllWords);
    document.getElementById('clear-examples').addEventListener('click', clearAllExamples);
    document.getElementById('start-batch-save').addEventListener('click', startBatchSave);
    document.getElementById('stop-batch-save').addEventListener('click', stopBatchSave);
    document.getElementById('clear-batch-log').addEventListener('click', resetBatchLog);
    
    // Panel controls
    document.getElementById('close-panel').addEventListener('click', function() {
        document.getElementById('save-options-panel').style.display = 'none';
    });
    
    document.getElementById('select-all').addEventListener('click', function() {
        document.querySelectorAll('.example-checkbox').forEach(cb => {
            cb.checked = true;
            cb.closest('.save-option-item').classList.add('selected');
        });
    });
    
    document.getElementById('deselect-all').addEventListener('click', function() {
        document.querySelectorAll('.example-checkbox').forEach(cb => {
            cb.checked = false;
            cb.closest('.save-option-item').classList.remove('selected');
        });
    });
    
    document.getElementById('save-selected').addEventListener('click', saveSelectedFromPanel);
    
    // Checkbox change handler (for visual feedback)
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('example-checkbox')) {
            const item = e.target.closest('.save-option-item');
            if (e.target.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        }
    });
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local') {
            updateStats();
        }
    });
});
