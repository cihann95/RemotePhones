/**
 * Tests for shared/error_messages.json
 * Validates the JSON loads correctly and contains all required fields.
 */
const path = require('path');
const fs = require('fs');

const errorMessagesPath = path.resolve(__dirname, '../../shared/error_messages.json');
const raw = fs.readFileSync(errorMessagesPath, 'utf-8');
const errorMessages = JSON.parse(raw);

describe('error_messages.json', () => {
  it('should be a valid JSON array with at least one entry', () => {
    expect(Array.isArray(errorMessages)).toBe(true);
    expect(errorMessages.length).toBeGreaterThan(0);
  });

  it('should have all required fields for each entry', () => {
    const requiredFields = ['id', 'title', 'hint', 'fix_steps'];
    for (const entry of errorMessages) {
      for (const field of requiredFields) {
        expect(entry).toHaveProperty(field);
      }
    }
  });

  it('should have a non-empty fix_steps array for each entry', () => {
    for (const entry of errorMessages) {
      expect(Array.isArray(entry.fix_steps)).toBe(true);
      expect(entry.fix_steps.length).toBeGreaterThan(0);
    }
  });

  it('should have a unique id for each entry', () => {
    const ids = errorMessages.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should always have patterns as an array (may be empty)', () => {
    for (const entry of errorMessages) {
      expect(Array.isArray(entry.patterns)).toBe(true);
    }
  });
});
