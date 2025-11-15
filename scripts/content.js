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
            return '.dictionary > .dictentry > .cB';
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
    }
    return true; // Keep the message channel open for async response
});