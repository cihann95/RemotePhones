// Phone Panel Component for Phone Farm Backup
// Provides phone call control interface

class PhonePanel {
    constructor() {
        this.deviceId = null;
        this.callState = 'idle'; // idle, ringing, active, ended
        this.currentNumber = '';
        this.csvUpload = null;
        this.init();
    }

    init(host) {
        if (host) {
            this.host = host;
        }
        if (this._initialized) return;
        this._initialized = true;

        // Bind events
        document.getElementById('phone-call-btn').addEventListener('click', () => this.handleCall());
        document.getElementById('phone-answer-btn').addEventListener('click', () => this.handleAnswer());
        document.getElementById('phone-hangup-btn').addEventListener('click', () => this.handleHangup());
        document.getElementById('phone-reject-btn').addEventListener('click', () => this.handleReject());
        document.getElementById('phone-csv-upload').addEventListener('change', (e) => this.handleCsvUpload(e));
        document.getElementById('phone-number-input').addEventListener('input', (e) => this.handleNumberInput(e));

        // Set up IPC listeners for call state updates
        window.electronAPI.on('phone-state-update', (event, state) => {
            this.updateCallState(state);
        });

        // Initialize CSV Upload component
        if (window.CSVUpload) {
            this.csvUpload = new window.CSVUpload();
            const csvSection = document.createElement('div');
            csvSection.className = 'card csv-upload-section';
            csvSection.innerHTML = `
                <div class="card-header">
                    <h2 class="card-title">
                        <span class="icon">📤</span>
                        <span>Bulk CSV Upload</span>
                    </h2>
                </div>
                <div class="card-body" id="csv-upload-container"></div>
            `;
            
            const phonePanelSection = document.querySelector('.card.call-history-section');
            if (phonePanelSection) {
                phonePanelSection.parentNode.insertBefore(csvSection, phonePanelSection.nextSibling);
                const csvContainer = csvSection.querySelector('#csv-upload-container');
                if (csvContainer) {
                    csvContainer.appendChild(this.csvUpload.getElement());
                }
            }
        }
    }

    // Set the target device for phone operations
    setDevice(deviceId) {
        this.deviceId = deviceId;
        this.reset();
    }

    // Reset the panel to initial state
    reset() {
        this.callState = 'idle';
        this.currentNumber = '';
        document.getElementById('phone-number-input').value = '';
        this.updateButtonVisibility();
        this.updateCallStateIndicator();
    }

    // Handle number input and validation
    handleNumberInput(event) {
        const input = event.target.value;
        // Allow only digits, plus, and spaces
        const cleaned = input.replace(/[^\d\+]/g, '');
        // Format: +905XXXXXXXXX or 05XXXXXXXXX
        if (cleaned.startsWith('+90')) {
            // Limit to 12 characters (+90 + 9 digits)
            if (cleaned.length > 12) {
                event.target.value = cleaned.slice(0, 12);
                return;
            }
            event.target.value = cleaned;
        } else if (cleaned.startsWith('0')) {
            // Limit to 11 characters (0 + 10 digits)
            if (cleaned.length > 11) {
                event.target.value = cleaned.slice(0, 11);
                return;
            }
            event.target.value = cleaned;
        } else {
            // If doesn't match expected prefixes, clear or adjust
            if (cleaned.length > 0) {
                // If starts with 90 but no plus, add plus
                if (cleaned.startsWith('90') && cleaned.length >= 2) {
                    event.target.value = '+' + cleaned;
                } else {
                    // Otherwise, keep only digits and let user correct
                    event.target.value = cleaned;
                }
            } else {
                event.target.value = '';
            }
        }
        this.currentNumber = event.target.value;
    }

    // Validate phone number format
    validateNumber(number) {
        // Remove spaces for validation
        const clean = number.replace(/\s/g, '');
        // Check for +905XXXXXXXXX (12 chars: +90 + 9 digits) or 05XXXXXXXXX (11 chars: 0 + 10 digits)
        const plus90Pattern = /^\+90[5]\d{8}$/;
        const zeroPattern = /^0[5]\d{9}$/;
        return plus90Pattern.test(clean) || zeroPattern.test(clean);
    }

    // Handle call button click
    async handleCall() {
        const numberInput = document.getElementById('phone-number-input');
        const number = numberInput.value.trim();

        if (!this.deviceId) {
            PhoneFarmNotification.show('Please select a device first', 'error');
            return;
        }

        if (!this.validateNumber(number)) {
            PhoneFarmNotification.show('Please enter a valid Turkish phone number (+905XXXXXXXXX or 05XXXXXXXXX)', 'error');
            return;
        }

        try {
            // Send IPC to main to initiate call
            await window.electronAPI.invoke('phone:call', { deviceId: this.deviceId, number });
            // Update UI to calling state
            this.setCallState('ringing');
        } catch (error) {
            console.error('Call failed:', error);
            PhoneFarmNotification.show('Failed to initiate call: ' + error.message, 'error');
        }
    }

    // Handle answer button click
    async handleAnswer() {
        if (!this.deviceId) return;
        try {
            await window.electronAPI.invoke('phone:answer', { deviceId: this.deviceId });
            this.setCallState('active');
        } catch (error) {
            console.error('Answer failed:', error);
            PhoneFarmNotification.show('Failed to answer call: ' + error.message, 'error');
        }
    }

    // Handle hangup button click
    async handleHangup() {
        if (!this.deviceId) return;
        try {
            await window.electronAPI.invoke('phone:hangup', { deviceId: this.deviceId });
            this.setCallState('ended');
        } catch (error) {
            console.error('Hangup failed:', error);
            PhoneFarmNotification.show('Failed to hangup call: ' + error.message, 'error');
        }
    }

    // Handle reject button click
    async handleReject() {
        if (!this.deviceId) return;
        try {
            await window.electronAPI.invoke('phone:hangup', { deviceId: this.deviceId }); // Reject is same as hangup for now
            this.setCallState('ended');
        } catch (error) {
            console.error('Reject failed:', error);
            PhoneFarmNotification.show('Failed to reject call: ' + error.message, 'error');
        }
    }

    // Handle CSV upload for bulk numbers
    handleCsvUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            // Parse CSV - assuming one number per line or comma-separated
            let numbers = content.split(/[\r\n,]+/).map(n => n.trim()).filter(n => n.length > 0);
            // Validate each number
            const validNumbers = numbers.filter(n => this.validateNumber(n));
            const invalidNumbers = numbers.filter(n => !this.validateNumber(n) && n.length > 0);

            if (validNumbers.length > 0) {
                // For now, just set the first valid number
                document.getElementById('phone-number-input').value = validNumbers[0];
                this.handleNumberInput({ target: { value: validNumbers[0] } });
                PhoneFarmNotification.show(`Loaded ${validNumbers.length} valid numbers. ${invalidNumbers.length} invalid numbers ignored.`, 'success');
            } else {
                PhoneFarmNotification.show('No valid phone numbers found in the CSV file.', 'error');
            }
        };
        reader.onerror = (e) => {
            PhoneFarmNotification.show('Error reading CSV file', 'error');
            console.error(e);
        };
        reader.readAsText(file);
        // Reset file input
        event.target.value = '';
    }

    // Update call state and UI
    setCallState(state) {
        this.callState = state;
        this.updateCallStateIndicator();
        this.updateButtonVisibility();
        // Notify main process of state change (if needed)
        window.electronAPI.send('phone:state-change', { deviceId: this.deviceId, state });
    }

    // Update call state indicator display
    updateCallStateIndicator() {
        const indicator = document.getElementById('call-state-indicator');
        const stateText = document.getElementById('call-state-text');
        switch (this.callState) {
            case 'idle':
                indicator.className = 'call-state-indicator idle';
                stateText.textContent = 'Idle';
                break;
            case 'ringing':
                indicator.className = 'call-state-indicator ringing';
                stateText.textContent = 'Ringing...';
                break;
            case 'active':
                indicator.className = 'call-state-indicator active';
                stateText.textContent = 'Active';
                break;
            case 'ended':
                indicator.className = 'call-state-indicator ended';
                stateText.textContent = 'Ended';
                break;
            default:
                indicator.className = 'call-state-indicator idle';
                stateText.textContent = 'Unknown';
        }
    }

    // Update button visibility based on call state
    updateButtonVisibility() {
        const callBtn = document.getElementById('phone-call-btn');
        const answerBtn = document.getElementById('phone-answer-btn');
        const hangupBtn = document.getElementById('phone-hangup-btn');
        const rejectBtn = document.getElementById('phone-reject-btn');

        switch (this.callState) {
            case 'idle':
                callBtn.style.display = 'inline-block';
                answerBtn.style.display = 'none';
                hangupBtn.style.display = 'none';
                rejectBtn.style.display = 'none';
                break;
            case 'ringing':
                callBtn.style.display = 'none';
                answerBtn.style.display = 'inline-block';
                hangupBtn.style.display = 'inline-block';
                rejectBtn.style.display = 'inline-block';
                break;
            case 'active':
                callBtn.style.display = 'none';
                answerBtn.style.display = 'none';
                hangupBtn.style.display = 'inline-block';
                rejectBtn.style.display = 'none';
                break;
            case 'ended':
                callBtn.style.display = 'inline-block';
                answerBtn.style.display = 'none';
                hangupBtn.style.display = 'none';
                rejectBtn.style.display = 'none';
                break;
        }
    }

    // Update call state from IPC (incoming call state changes)
    updateCallState(state) {
        this.setCallState(state);
    }
}

// Export as window.PhonePanel
window.PhonePanel = new PhonePanel();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // The panel will be initialized when setDevice is called from renderer.js
});