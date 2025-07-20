// Cron API保護機能のテスト
import { validateCronSecret } from '@/lib/cron-auth';

describe('Cron API Protection Tests', () => {
  describe('validateCronSecret', () => {
    const validSecret = 'test-cron-secret-123';
    
    beforeEach(() => {
      process.env.CRON_SECRET = validSecret;
    });

    afterEach(() => {
      delete process.env.CRON_SECRET;
    });

    it('should accept valid CRON_SECRET with Bearer token', () => {
      const request = {
        headers: {
          get: (key: string) => {
            if (key === 'authorization') return `Bearer ${validSecret}`;
            return null;
          }
        }
      };

      const result = validateCronSecret(request);

      expect(result).toEqual({
        isValid: true,
      });
    });

    it('should reject invalid CRON_SECRET', () => {
      const request = {
        headers: {
          get: (key: string) => {
            if (key === 'authorization') return 'Bearer invalid-secret';
            return null;
          }
        }
      };

      const result = validateCronSecret(request);

      expect(result).toEqual({
        isValid: false,
        error: 'Invalid CRON_SECRET',
      });
    });

    it('should reject missing Authorization header', () => {
      const request = {
        headers: {
          get: () => null
        }
      };

      const result = validateCronSecret(request);

      expect(result).toEqual({
        isValid: false,
        error: 'Missing Authorization header',
      });
    });

    it('should reject non-Bearer token format', () => {
      const request = {
        headers: {
          get: (key: string) => {
            if (key === 'authorization') return `Basic ${validSecret}`;
            return null;
          }
        }
      };

      const result = validateCronSecret(request);

      expect(result).toEqual({
        isValid: false,
        error: 'Invalid Authorization format (expected Bearer token)',
      });
    });

    it('should reject when CRON_SECRET environment variable is not set', () => {
      delete process.env.CRON_SECRET;
      
      const request = {
        headers: {
          get: (key: string) => {
            if (key === 'authorization') return `Bearer ${validSecret}`;
            return null;
          }
        }
      };

      const result = validateCronSecret(request);

      expect(result).toEqual({
        isValid: false,
        error: 'CRON_SECRET not configured',
      });
    });
  });
});