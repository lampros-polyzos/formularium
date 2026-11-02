import { describe, expect, it } from 'vitest';
import { apiUrl, normalizeBase } from './api';

describe('apiUrl', () => {
    it('joins the base and path with exactly one slash', () => {
        expect(apiUrl('/api/v1/validate', 'http://localhost:8080')).toBe('http://localhost:8080/api/v1/validate');
        expect(apiUrl('api/v1/validate', 'http://localhost:8080/')).toBe('http://localhost:8080/api/v1/validate');
        expect(apiUrl('/api/v1/export/pif', 'https://api.example.com//')).toBe('https://api.example.com/api/v1/export/pif');
    });

    it('falls back to the same origin when no base is configured', () => {
        expect(apiUrl('/api/v1/validate', '')).toBe('/api/v1/validate');
        expect(normalizeBase(undefined)).toBe('');
    });
});
