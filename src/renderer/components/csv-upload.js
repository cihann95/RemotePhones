// CSV Upload Component for Bulk Phone Operations
// Provides drag-and-drop CSV upload, validation, preview, and bulk call initiation

class CSVUpload {
  constructor() {
    this.numbers = [];
    this.errors = [];
    this.isProcessing = false;
    this.element = null;
    this.init();
  }

  init() {
    // Create main container
    this.element = document.createElement('div');
    this.element.className = 'csv-upload-container';
    this.element.innerHTML = `
      <div class="csv-upload-header">
        <h3>Bulk Phone Operations</h3>
        <button id="download-template-btn" class="csv-btn csv-download">Download Template</button>
      </div>
      
      <div class="csv-upload-zone" id="csv-drop-zone">
        <p>Drag & drop CSV file here</p>
        <p>or</p>
        <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
        <label for="csv-file-input" class="csv-btn">Select CSV File</label>
      </div>
      
      <div id="csv-preview-wrapper" style="display: none;">
        <h4>Preview (first 10 rows)</h4>
        <table class="csv-preview-table">
          <thead>
            <tr><th>Number</th></tr>
          </thead>
          <tbody id="csv-preview-body"></tbody>
        </table>
        <div id="csv-error-list" style="margin-top: 10px; color: #dc3545; font-size: 0.9em;"></div>
        <div id="csv-stats" style="margin-top: 10px; font-size: 0.9em;"></div>
        <div class="csv-actions">
          <button id="start-bulk-btn" class="csv-btn csv-start">Start Bulk Call</button>
          <div id="csv-progress" class="csv-progress" style="display: none; margin-top: 10px;">
            <div class="progress-bar"></div>
          </div>
        </div>
      </div>
    `;

    // Bind events
    this.bindEvents();
  }

  bindEvents() {
    const dropZone = this.element.querySelector('#csv-drop-zone');
    const fileInput = this.element.querySelector('#csv-file-input');
    const previewWrapper = this.element.querySelector('#csv-preview-wrapper');
    const startBtn = this.element.querySelector('#start-bulk-btn');
    const downloadBtn = this.element.querySelector('#download-template-btn');
    const progressBar = this.element.querySelector('.progress-bar');

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('csv-upload-zone-dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('csv-upload-zone-dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('csv-upload-zone-dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'text/csv') {
        this.processFile(file);
      } else {
        this.showError('Please drop a valid CSV file');
      }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.processFile(file);
      }
    });

    // Start bulk call
    startBtn.addEventListener('click', async () => {
      if (this.isProcessing || this.numbers.length === 0) return;

      this.isProcessing = true;
      startBtn.disabled = true;
      startBtn.textContent = 'Calling...';
      previewWrapper.style.display = 'none';
      this.element.querySelector('#csv-progress').style.display = 'block';
      progressBar.style.width = '0%';

      try {
        // Send numbers to main process via IPC
        await window.electronAPI.phoneCallBulk(this.numbers);
        this.showSuccess(`Bulk call initiated for ${this.numbers.length} numbers`);
      } catch (error) {
        this.showError(`Bulk call failed: ${error.message}`);
      } finally {
        this.isProcessing = false;
        startBtn.disabled = false;
        startBtn.textContent = 'Start Bulk Call';
        // Hide progress after a short delay
        setTimeout(() => {
          this.element.querySelector('#csv-progress').style.display = 'none';
        }, 1500);
      }
    });

    // Download template
    downloadBtn.addEventListener('click', () => {
      this.downloadTemplate();
    });
  }

  processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      this.parseCSV(csvText);
    };
    reader.onerror = () => {
      this.showError('Error reading file');
    };
    reader.readAsText(file);
  }

  parseCSV(csvText) {
    // Reset state
    this.numbers = [];
    this.errors = [];
    const lines = csvText.trim().split('\n');
    
    if (lines.length === 0) {
      this.showError('CSV file is empty');
      return;
    }

    // Parse header
    const headerLine = lines[0].trim();
    const headers = headerLine.split(',').map(h => h.trim());
    const numberColIndex = headers.indexOf('number');
    
    if (numberColIndex === -1) {
      this.showError('CSV must contain a "number" column');
      return;
    }

    // Process rows
    const previewBody = this.element.querySelector('#csv-preview-body');
    previewBody.innerHTML = '';
    
    const maxRows = Math.min(lines.length - 1, 10); // Show max 10 rows in preview
    let validCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length && validCount < 1000; i++) {
      const line = lines[i].trim();
      if (line === '') continue;

      const cols = line.split(',').map(c => c.trim());
      const number = cols[numberColIndex] || '';

      // Validate number (simple validation: not empty and looks like a phone number)
      if (!number || !/^\+?[\d\s\-\(\)]+$/.test(number.replace(/\s/g, ''))) {
        this.errors.push(`Row ${i + 1}: Invalid number format "${number}"`);
        errorCount++;
        continue;
      }

      // Add to numbers list (if under limit)
      if (this.numbers.length < 1000) {
        this.numbers.push(number);
        validCount++;
        
        // Add to preview (first 10 rows)
        if (validCount <= 10) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.textContent = number;
          row.appendChild(cell);
          previewBody.appendChild(row);
        }
      } else {
        this.errors.push(`Row ${i + 1}: Skipped (max 1000 numbers reached)`);
        errorCount++;
        break;
      }
    }

    // Update UI
    this.updateStats(validCount, errorCount);
    this.showPreview();
  }

  updateStats(validCount, errorCount) {
    const statsEl = this.element.querySelector('#csv-stats');
    statsEl.textContent = '';
    const strong1 = document.createElement('strong');
    strong1.textContent = String(validCount);
    const strong2 = document.createElement('strong');
    strong2.textContent = String(errorCount);
    statsEl.appendChild(strong1);
    statsEl.appendChild(document.createTextNode(' valid numbers, '));
    statsEl.appendChild(strong2);
    statsEl.appendChild(document.createTextNode(' invalid rows skipped'));
    
    const errorListEl = this.element.querySelector('#csv-error-list');
    if (this.errors.length > 0) {
      errorListEl.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = 'Errors:';
      errorListEl.appendChild(strong);
      errorListEl.appendChild(document.createElement('br'));
      this.errors.slice(0, 5).forEach(err => {
        const bullet = document.createTextNode('• ' + err);
        errorListEl.appendChild(bullet);
        errorListEl.appendChild(document.createElement('br'));
      });
      if (this.errors.length > 5) {
        const more = document.createTextNode(`• and ${this.errors.length - 5} more...`);
        errorListEl.appendChild(more);
      }
    } else {
      errorListEl.textContent = '';
    }
  }

  showPreview() {
    this.element.querySelector('#csv-preview-wrapper').style.display = 'block';
    this.element.querySelector('#start-bulk-btn').disabled = this.numbers.length === 0;
  }

  showError(message) {
    const errorListEl = this.element.querySelector('#csv-error-list');
    errorListEl.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Error: ';
    errorListEl.appendChild(strong);
    errorListEl.appendChild(document.createTextNode(message));
    this.element.querySelector('#csv-preview-wrapper').style.display = 'none';
    this.element.querySelector('#start-bulk-btn').disabled = true;
  }

  showSuccess(message) {
    const errorListEl = this.element.querySelector('#csv-error-list');
    errorListEl.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Success: ';
    errorListEl.appendChild(strong);
    errorListEl.appendChild(document.createTextNode(message));
    errorListEl.style.color = '#28a745';
    setTimeout(() => {
      errorListEl.style.color = '#dc3545';
      errorListEl.textContent = '';
    }, 3000);
  }

  downloadTemplate() {
    const csvContent = 'number\n+1234567890\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phone_numbers_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Public method to get the component element
  getElement() {
    return this.element;
  }
}

// Export as window.CSVUpload
window.CSVUpload = CSVUpload;