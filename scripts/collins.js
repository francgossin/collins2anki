// Popup script for Collins to Anki extension

// Helper function to show status messages
function showStatus(message, type = 'success') {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type} show`;
    
    setTimeout(() => {
        statusDiv.classList.remove('show');
    }, 3000);
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
            chrome.storage.local.get(['savedWords'], function(result) {
                const savedWords = result.savedWords || [];
                let newCount = 0;
                let updateCount = 0;
                
                wordDataArray.forEach(wordData => {
                    const existingIndex = savedWords.findIndex(w => w.word === wordData.word && w.pos === wordData.pos);
                    
                    if (existingIndex !== -1) {
                        savedWords[existingIndex] = wordData;
                        updateCount++;
                    } else {
                        savedWords.push(wordData);
                        newCount++;
                    }
                });
                
                if (newCount > 0 && updateCount > 0) {
                    showStatus(`${newCount} word(s) saved, ${updateCount} updated`, 'success');
                } else if (newCount > 0) {
                    showStatus(`${newCount} word(s) saved!`, 'success');
                } else if (updateCount > 0) {
                    showStatus(`${updateCount} word(s) updated`, 'success');
                }
                
                chrome.storage.local.set({ savedWords: savedWords }, function() {
                    updateStats();
                });
            });
        }
    });
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
    
    panel.style.display = 'block';
    
    // Store word data for later use
    window.currentWordData = wordDataArray;
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
            
            savedExamples.push({
                word: wordData.word,
                exampleText: exampleText,
                translation: translation,
                fullHTML: example.html,
                timestamp: new Date().toISOString()
            });
        });
        
        chrome.storage.local.set({ savedExamples: savedExamples }, function() {
            showStatus(`${checkboxes.length} example(s) saved!`, 'success');
            updateStats();
            document.getElementById('save-options-panel').style.display = 'none';
        });
    });
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
    
    document.getElementById('save-selected').addEventListener('click', saveSelectedExamples);
    
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
