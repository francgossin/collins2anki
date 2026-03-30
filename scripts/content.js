function convertSpanTableToHTMLTable(spanTableHTML) {
    // Create a temporary container to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = spanTableHTML;
    
    // Find all span.table elements
    const spanTables = tempDiv.querySelectorAll('span.table');
    
    spanTables.forEach(spanTable => {
        // Create a real HTML table
        const table = document.createElement('table');
        table.setAttribute('border', '1');
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '10px';
        
        // Get all rows (span.tr)
        const rows = spanTable.querySelectorAll('span.tr');
        
        rows.forEach(row => {
            const tr = document.createElement('tr');
            
            // Get all header cells (span.th)
            const headers = row.querySelectorAll('span.th');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header.textContent;
                th.style.padding = '5px';
                th.style.backgroundColor = '#f0f0f0';
                tr.appendChild(th);
            });
            
            // Get all data cells (span.td)
            const cells = row.querySelectorAll('span.td');
            cells.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell.textContent;
                td.style.padding = '5px';
                tr.appendChild(td);
            });
            
            table.appendChild(tr);
        });
        
        // Replace the span.table with the real table
        spanTable.parentNode.replaceChild(table, spanTable);
    });
    
    return tempDiv.innerHTML;
}

function cleanHTMLForAnki(html) {
    // Create a temporary container to parse and clean the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remove elements: .hom > a
    tempDiv.querySelectorAll('.hom > a').forEach(el => el.remove());
    
    // Add comma separator between example and translation
    tempDiv.querySelectorAll('.cit.type-example').forEach(exampleDiv => {
        // Find the example quote and translation
        const exampleQuote = exampleDiv.querySelector('.quote');
        const translation = exampleDiv.querySelector('.cit.type-translation');
        
        if (exampleQuote && translation) {
            // Create a separator span
            const separator = document.createElement('span');
            separator.textContent = ', ';
            separator.style.margin = '0 5px';
            
            // Insert separator between example and translation
            translation.parentNode.insertBefore(separator, translation);
        }
    });
    
    // Remove other common unnecessary elements (optional - customize as needed)
    // Remove sound/audio buttons
    tempDiv.querySelectorAll('.sound, .audio_play_button').forEach(el => el.remove());
    
    // Remove pronunciation pointers that are empty
    tempDiv.querySelectorAll('.ptr.hwd_sound').forEach(el => el.remove());
    
    // Remove copyright notices
    tempDiv.querySelectorAll('.copyright').forEach(el => el.remove());
    
    return tempDiv.innerHTML;
}

function getWordData() {
    let wordDefs = [];
    function getDictEntryCSS() {
        if (window.location.href.includes('german-english')) {
            return '.dictionary.cB';
        } else if (window.location.href.includes('french-english')) {
            return '.dictionary > .dictentry > .cB, .dictionaries.dictionary > .dictionary.dictentry > .dictlink > .cB:not([data-type-block="definition.title.type.french_easy"])';
        }
    }
    document.querySelectorAll(getDictEntryCSS()).forEach(dict => {
        const wordEl = dict.querySelector('.title_container span.orth');
        const word = wordEl ? wordEl.innerText : '';
        
        const pronEl = dict.querySelector('.mini_h2 > span.pron');
        const pronunciation = pronEl ? pronEl.innerText : '';
        
        const audioEl = dict.querySelector('.mini_h2 > span.pron > span > a.sound');
        const pronounciationAudio = audioEl ? audioEl.getAttribute('data-src-mp3') : '';
        
        const posEl = dict.querySelector('span.pos');
        const pos = posEl ? posEl.innerText : '';
        
        const definitions = Array.from(dict.querySelectorAll('.sense > .type-translation > .quote')).map(def => def.innerText);
        
        // Get full definition HTML and clean it
        const fullDefinitionEl = dict.querySelector('.definitions');
        const fullDefinitionRaw = fullDefinitionEl ? fullDefinitionEl.outerHTML : '';
        const fullDefinition = fullDefinitionRaw ? cleanHTMLForAnki(fullDefinitionRaw) : '';
        
        // Get declension/conjugation table if it exists
        const declElement = dict.querySelector('.decl, .short_verb_table');
        const declTableHTML = declElement ? convertSpanTableToHTMLTable(declElement.innerHTML) : '';
        
        // Extract examples (also clean them) - use broader selector to catch all examples
        const examples = Array.from(dict.querySelectorAll('.cit.type-example')).map(exampleEl => {
            return {
                html: cleanHTMLForAnki(exampleEl.outerHTML),
                text: exampleEl.innerText.trim()
            };
        });
        
        wordDefs.push({
            word,
            pronunciation,
            pronounciationAudio,
            pos,
            definitions,
            fullDefinition,
            declTableHTML,
            examples
        });
    });
    return wordDefs;
}

function wordDataToAnkiCSV(wordData) {
    // Escape CSV fields that contain commas, quotes, or newlines
    function escapeCSVField(field) {
        if (field == null) return '';
        
        const stringField = String(field);
        // If field contains comma, quote, or newline, wrap in quotes and escape existing quotes
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return '"' + stringField.replace(/"/g, '""') + '"';
        }
        return stringField;
    }
    
    // Convert array to comma-separated string
    const definitionsStr = wordData.definitions ? wordData.definitions.join('; ') : '';
    
    // Create CSV row with all fields
    const csvRow = [
        escapeCSVField(wordData.word),
        escapeCSVField(wordData.pronunciation),
        escapeCSVField(wordData.pronounciationAudio),
        escapeCSVField(wordData.pos),
        escapeCSVField(definitionsStr),
        escapeCSVField(wordData.fullDefinition),
        escapeCSVField(wordData.declTableHTML)
    ].join(',');
    
    return csvRow;
}

// Convert multiple word entries to CSV without headers (for Anki)
function wordsToCSV(wordDataArray) {
    const csvRows = wordDataArray.map(wordData => wordDataToAnkiCSV(wordData));
    
    return csvRows.join('\n');
}

// Download CSV file
function downloadCSV(csvContent, filename = 'anki_cards.csv') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Save a single word to Chrome local storage
function saveWordToStorage(wordData) {
    chrome.storage.local.get(['savedWords'], function(result) {
        const savedWords = result.savedWords || [];
        
        // Check if word already exists (avoid duplicates)
        const existingIndex = savedWords.findIndex(w => w.word === wordData.word);
        
        if (existingIndex !== -1) {
            // Update existing word
            savedWords[existingIndex] = wordData;
        } else {
            // Add new word
            savedWords.push(wordData);
        }
        
        chrome.storage.local.set({ savedWords: savedWords }, function() {
            console.log('Word saved:', wordData.word);
            console.log('Total saved words:', savedWords.length);
        });
    });
}

// Get all saved words from Chrome local storage
function getAllSavedWords(callback) {
    chrome.storage.local.get(['savedWords'], function(result) {
        const savedWords = result.savedWords || [];
        callback(savedWords);
    });
}

// Clear all saved words from Chrome local storage
function clearAllSavedWords(callback) {
    chrome.storage.local.set({ savedWords: [] }, function() {
        console.log('All saved words cleared');
        if (callback) callback();
    });
}

// Remove a specific word from Chrome local storage
function removeWordFromStorage(word, callback) {
    chrome.storage.local.get(['savedWords'], function(result) {
        const savedWords = result.savedWords || [];
        const filteredWords = savedWords.filter(w => w.word !== word);
        
        chrome.storage.local.set({ savedWords: filteredWords }, function() {
            console.log('Word removed:', word);
            if (callback) callback();
        });
    });
}

// Export all saved words to CSV
function exportSavedWordsToCSV() {
    getAllSavedWords(function(savedWords) {
        if (savedWords.length === 0) {
            alert('No saved words to export');
            return;
        }
        
        const csvContent = wordsToCSV(savedWords);
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadCSV(csvContent, `collins_words_${timestamp}.csv`);
    });
}

function buildExampleEntry(wordData, exampleHTML) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = exampleHTML;

    const sourceQuoteElements = tempDiv.querySelectorAll('.quote:not(.cit.type-translation .quote)');
    const exampleText = Array.from(sourceQuoteElements)
        .map(el => el.innerText.trim())
        .filter(Boolean)
        .join(' ');

    const translationElements = tempDiv.querySelectorAll('.cit.type-translation .quote');
    const translation = Array.from(translationElements)
        .map(el => el.innerText.trim())
        .filter(Boolean)
        .join(', ');

    return {
        word: wordData.word,
        exampleText,
        translation,
        fullHTML: exampleHTML,
        timestamp: new Date().toISOString()
    };
}

function cloneData(data) {
    return JSON.parse(JSON.stringify(data));
}

function getWordKey(wordData) {
    return `${wordData.word}||${wordData.pos || ''}`;
}

function getExampleKey(exampleData) {
    return `${exampleData.word}||${exampleData.exampleText || ''}||${exampleData.translation || ''}`;
}

function showPageStatus(message, type = 'success') {
    let statusEl = document.getElementById('collins2anki-save-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'collins2anki-save-status';
        statusEl.style.position = 'fixed';
        statusEl.style.right = '20px';
        statusEl.style.bottom = '164px';
        statusEl.style.zIndex = '2147483647';
        statusEl.style.padding = '10px 14px';
        statusEl.style.borderRadius = '8px';
        statusEl.style.fontSize = '13px';
        statusEl.style.fontFamily = 'Arial, sans-serif';
        statusEl.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)';
        statusEl.style.opacity = '0';
        statusEl.style.transition = 'opacity 0.2s ease';
        document.body.appendChild(statusEl);
    }

    statusEl.textContent = message;
    statusEl.style.backgroundColor = type === 'error' ? '#c62828' : '#2e7d32';
    statusEl.style.color = '#ffffff';
    statusEl.style.opacity = '1';

    window.clearTimeout(window.collins2ankiStatusTimer);
    window.collins2ankiStatusTimer = window.setTimeout(() => {
        statusEl.style.opacity = '0';
    }, 3000);
}

function setControlButtonStyle(button, backgroundColor) {
    button.style.position = 'fixed';
    button.style.right = '20px';
    button.style.zIndex = '2147483647';
    button.style.background = backgroundColor;
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '10px';
    button.style.padding = '10px 14px';
    button.style.fontSize = '13px';
    button.style.fontWeight = '600';
    button.style.fontFamily = 'Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.25)';
}

function updatePageControlVisibility() {
    const toggleButton = document.getElementById('collins2anki-auto-save-toggle-btn');
    const undoButton = document.getElementById('collins2anki-auto-undo-btn');

    if (toggleButton) {
        const enabled = Boolean(window.collins2ankiAutoSaveEnabled);
        toggleButton.textContent = enabled ? 'Auto Save: ON' : 'Auto Save: OFF';
        toggleButton.style.background = enabled ? '#2e7d32' : '#6c757d';
    }

    if (undoButton) {
        if (window.collins2ankiAutoSaveEnabled) {
            undoButton.style.display = 'block';
            undoButton.disabled = !window.collins2ankiLastAutoSaveSnapshot;
            undoButton.style.opacity = undoButton.disabled ? '0.6' : '1';
            undoButton.style.cursor = undoButton.disabled ? 'not-allowed' : 'pointer';
        } else {
            undoButton.style.display = 'none';
        }
    }
}

function saveAllWordsAndExamples(options = {}) {
    const trackUndo = Boolean(options.trackUndo);
    const source = options.source || 'manual';
    const callback = options.callback || function() {};
    const wordDataArray = getWordData();

    if (!wordDataArray || wordDataArray.length === 0) {
        showPageStatus('No words found on this page', 'error');
        callback(false, {
            wordsSaved: 0,
            wordsUpdated: 0,
            examplesSaved: 0,
            examplesUpdated: 0
        });
        return;
    }

    chrome.storage.local.get(['savedWords', 'savedExamples'], function(result) {
        const savedWords = result.savedWords || [];
        const savedExamples = result.savedExamples || [];
        const wordChanges = [];
        const exampleChanges = [];

        let wordsSaved = 0;
        let wordsUpdated = 0;
        let examplesSaved = 0;
        let examplesUpdated = 0;

        wordDataArray.forEach(wordData => {
            const existingWordIndex = savedWords.findIndex(
                w => w.word === wordData.word && w.pos === wordData.pos
            );

            if (existingWordIndex !== -1) {
                if (trackUndo) {
                    wordChanges.push({
                        key: getWordKey(wordData),
                        existed: true,
                        previous: cloneData(savedWords[existingWordIndex])
                    });
                }
                savedWords[existingWordIndex] = wordData;
                wordsUpdated++;
            } else {
                if (trackUndo) {
                    wordChanges.push({
                        key: getWordKey(wordData),
                        existed: false
                    });
                }
                savedWords.push(wordData);
                wordsSaved++;
            }

            const examples = wordData.examples || [];
            examples.forEach(example => {
                const exampleEntry = buildExampleEntry(wordData, example.html);
                const existingExampleIndex = savedExamples.findIndex(
                    e =>
                        e.word === exampleEntry.word &&
                        e.exampleText === exampleEntry.exampleText &&
                        e.translation === exampleEntry.translation
                );

                if (existingExampleIndex !== -1) {
                    if (trackUndo) {
                        exampleChanges.push({
                            key: getExampleKey(exampleEntry),
                            existed: true,
                            previous: cloneData(savedExamples[existingExampleIndex])
                        });
                    }
                    savedExamples[existingExampleIndex] = exampleEntry;
                    examplesUpdated++;
                } else {
                    if (trackUndo) {
                        exampleChanges.push({
                            key: getExampleKey(exampleEntry),
                            existed: false
                        });
                    }
                    savedExamples.push(exampleEntry);
                    examplesSaved++;
                }
            });
        });

        chrome.storage.local.set(
            {
                savedWords: savedWords,
                savedExamples: savedExamples
            },
            function() {
                const summary = `${wordsSaved} word(s) saved, ${wordsUpdated} updated; ${examplesSaved} example(s) saved, ${examplesUpdated} updated`;
                showPageStatus(summary, 'success');

                if (trackUndo) {
                    window.collins2ankiLastAutoSaveSnapshot = {
                        source,
                        wordChanges,
                        exampleChanges
                    };
                    updatePageControlVisibility();
                }

                callback(true, {
                    wordsSaved,
                    wordsUpdated,
                    examplesSaved,
                    examplesUpdated
                });
            }
        );
    });
}

function retractLastAutoSave() {
    const snapshot = window.collins2ankiLastAutoSaveSnapshot;
    if (!snapshot) {
        showPageStatus('Nothing to retract yet', 'error');
        return;
    }

    chrome.storage.local.get(['savedWords', 'savedExamples'], function(result) {
        let savedWords = result.savedWords || [];
        let savedExamples = result.savedExamples || [];

        snapshot.wordChanges.forEach(change => {
            const currentIndex = savedWords.findIndex(item => getWordKey(item) === change.key);
            if (change.existed) {
                if (currentIndex !== -1) {
                    savedWords[currentIndex] = change.previous;
                } else {
                    savedWords.push(change.previous);
                }
            } else if (currentIndex !== -1) {
                savedWords.splice(currentIndex, 1);
            }
        });

        snapshot.exampleChanges.forEach(change => {
            const currentIndex = savedExamples.findIndex(item => getExampleKey(item) === change.key);
            if (change.existed) {
                if (currentIndex !== -1) {
                    savedExamples[currentIndex] = change.previous;
                } else {
                    savedExamples.push(change.previous);
                }
            } else if (currentIndex !== -1) {
                savedExamples.splice(currentIndex, 1);
            }
        });

        chrome.storage.local.set(
            {
                savedWords,
                savedExamples
            },
            function() {
                window.collins2ankiLastAutoSaveSnapshot = null;
                updatePageControlVisibility();
                showPageStatus('Auto-save reverted (Ctrl-Z)', 'success');
            }
        );
    });
}

function enableAutoSave(enabled) {
    chrome.storage.local.set({ collins2ankiAutoSaveEnabled: enabled }, function() {
        window.collins2ankiAutoSaveEnabled = enabled;

        if (!enabled) {
            window.collins2ankiLastAutoSaveSnapshot = null;
            showPageStatus('Auto Save disabled. Manual save mode.', 'success');
            updatePageControlVisibility();
            return;
        }

        showPageStatus('Auto Save enabled', 'success');
        updatePageControlVisibility();

        // If page is already fully loaded, run auto-save immediately.
        if (document.readyState === 'complete') {
            saveAllWordsAndExamples({ trackUndo: true, source: 'auto' });
        }
    });
}

function tryAutoSaveAfterPageLoad() {
    if (!window.collins2ankiAutoSaveEnabled || window.collins2ankiAutoSaveDoneForUrl === window.location.href) {
        return;
    }

    window.collins2ankiAutoSaveDoneForUrl = window.location.href;
    saveAllWordsAndExamples({
        trackUndo: true,
        source: 'auto'
    });
}

function injectPageButtons() {
    if (!document.body || document.getElementById('collins2anki-save-all-btn')) {
        return;
    }

    window.collins2ankiAutoSaveEnabled = false;
    window.collins2ankiLastAutoSaveSnapshot = null;
    window.collins2ankiAutoSaveDoneForUrl = null;

    const manualSaveButton = document.createElement('button');
    manualSaveButton.id = 'collins2anki-save-all-btn';
    manualSaveButton.type = 'button';
    manualSaveButton.textContent = 'Save words + examples';
    manualSaveButton.title = 'Save all words and examples from this page';
    setControlButtonStyle(manualSaveButton, '#1565c0');
    manualSaveButton.style.bottom = '20px';

    const autoToggleButton = document.createElement('button');
    autoToggleButton.id = 'collins2anki-auto-save-toggle-btn';
    autoToggleButton.type = 'button';
    autoToggleButton.title = 'Enable or disable automatic save after full page load';
    setControlButtonStyle(autoToggleButton, '#6c757d');
    autoToggleButton.style.bottom = '68px';

    const undoButton = document.createElement('button');
    undoButton.id = 'collins2anki-auto-undo-btn';
    undoButton.type = 'button';
    undoButton.textContent = 'Ctrl-Z: Retract Auto Save';
    undoButton.title = 'Undo the latest automatic save';
    setControlButtonStyle(undoButton, '#c62828');
    undoButton.style.bottom = '116px';

    manualSaveButton.addEventListener('click', function() {
        manualSaveButton.disabled = true;
        const originalText = manualSaveButton.textContent;
        manualSaveButton.textContent = 'Saving...';

        saveAllWordsAndExamples({ trackUndo: false, source: 'manual' });

        window.setTimeout(() => {
            manualSaveButton.disabled = false;
            manualSaveButton.textContent = originalText;
        }, 900);
    });

    autoToggleButton.addEventListener('click', function() {
        enableAutoSave(!window.collins2ankiAutoSaveEnabled);
    });

    undoButton.addEventListener('click', function() {
        if (undoButton.disabled) {
            return;
        }
        retractLastAutoSave();
    });

    document.body.appendChild(manualSaveButton);
    document.body.appendChild(autoToggleButton);
    document.body.appendChild(undoButton);

    chrome.storage.local.get(['collins2ankiAutoSaveEnabled'], function(result) {
        window.collins2ankiAutoSaveEnabled = Boolean(result.collins2ankiAutoSaveEnabled);
        updatePageControlVisibility();

        if (window.collins2ankiAutoSaveEnabled) {
            if (document.readyState === 'complete') {
                tryAutoSaveAfterPageLoad();
            } else {
                window.addEventListener('load', function() {
                    tryAutoSaveAfterPageLoad();
                }, { once: true });
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPageButtons);
} else {
    injectPageButtons();
}


// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getWordData') {
        try {
            const wordData = getWordData();
            sendResponse({ success: true, data: wordData });
        } catch (error) {
            console.log('Error getting word data:', error);
            sendResponse({ success: false, error: error.message });
        }
    } else if (request.action === 'saveAllFromPage') {
        try {
            saveAllWordsAndExamples({
                trackUndo: false,
                source: 'popup-batch',
                callback: (success, result) => {
                    sendResponse({
                        success,
                        data: result,
                        error: success ? null : 'No words found on this page'
                    });
                }
            });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    }
    return true; // Keep the message channel open for async response
});