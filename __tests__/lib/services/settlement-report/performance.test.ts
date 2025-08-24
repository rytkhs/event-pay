import { SettlementReportService } from '@/lib/services/settlement-report/service'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { logger } from '@/lib/logging/app-logger'

// Mock logger
jest.mock('@/lib/logging/app-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }
}))

// Mock Supabase client (rpc returns a builder with single())
const mockSupabase = {
  rpc: jest.fn(),
  from: jest.fn(),
}

describe('SettlementReportService Performance Tests (RPC Version)', () => {
  let service: SettlementReportService

  beforeEach(() => {
    service = new SettlementReportService(mockSupabase as unknown as SupabaseClient<Database>)
    jest.clearAllMocks()
  })

  describe('generateSettlementReport', () => {
    it('should use RPC function for report generation and complete quickly', async () => {
      // Mock RPC call for report generation (rpc -> builder.single())
      const single = jest.fn().mockResolvedValue({
        data: { report_id: 'payout-123', already_exists: false },
        error: null,
      })
      mockSupabase.rpc.mockReturnValue({ single })

      const startTime = Date.now()

      const result = await service.generateSettlementReport({
        eventId: 'event-1',
        organizerId: 'organizer-1'
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(result.success).toBe(true)
      expect(result.reportId).toBe('payout-123')
      expect(duration).toBeLessThan(500) // Should complete in under 500ms

      // Verify RPC was called with correct parameters
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'generate_settlement_report',
        {
          p_event_id: 'event-1',
          p_organizer_id: 'organizer-1'
        }
      )

      // Should only make 1 RPC call (all processing done in DB)
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1)
      expect(single).toHaveBeenCalledTimes(1)
    })

    it('should handle RPC errors gracefully', async () => {
      // Mock RPC error
      const single = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      })
      mockSupabase.rpc.mockReturnValue({ single })

      const result = await service.generateSettlementReport({
        eventId: 'event-1',
        organizerId: 'organizer-1'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('RPC呼び出しに失敗しました')
      expect(logger.error).toHaveBeenCalledWith(
        'RPC settlement report generation failed',
        expect.objectContaining({
          tag: 'settlementReportRpcError',
          eventId: 'event-1',
          error: 'Database connection failed'
        })
      )
    })

    it('should handle exceptions gracefully', async () => {
      // Mock RPC throwing exception
      mockSupabase.rpc.mockRejectedValue(new Error('Network timeout'))

      const result = await service.generateSettlementReport({
        eventId: 'event-1',
        organizerId: 'organizer-1'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network timeout')
      expect(logger.error).toHaveBeenCalledWith(
        'Settlement report generation failed',
        expect.objectContaining({
          tag: 'settlementReportGenerationError',
          eventId: 'event-1',
          error: 'Network timeout'
        })
      )
    })
  })

  describe('regenerateAfterRefundOrDispute', () => {
    it('should call generateSettlementReport without forceRegenerate', async () => {
      // Mock RPC call
      const single = jest.fn().mockResolvedValue({
        data: { report_id: 'payout-456', already_exists: false },
        error: null,
      })
      mockSupabase.rpc.mockReturnValue({ single })

      const result = await service.regenerateAfterRefundOrDispute('event-1', 'organizer-1')

      expect(result.success).toBe(true)
      expect(result.reportId).toBe('payout-456')

      // Should still call the same RPC function
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'generate_settlement_report',
        {
          p_event_id: 'event-1',
          p_organizer_id: 'organizer-1'
        }
      )
    })
  })

  describe('Performance benchmarks', () => {
    it('should complete report generation in under 200ms for typical case', async () => {
      const single = jest.fn().mockResolvedValue({
        data: { report_id: 'payout-789', already_exists: false },
        error: null,
      })
      mockSupabase.rpc.mockReturnValue({ single })

      const iterations = 10
      const durations: number[] = []

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now()

        await service.generateSettlementReport({
          eventId: `event-${i}`,
          organizerId: 'organizer-1'
        })

        const duration = Date.now() - startTime
        durations.push(duration)
      }

      const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxDuration = Math.max(...durations)

      expect(averageDuration).toBeLessThan(200)
      expect(maxDuration).toBeLessThan(500)

      // All calls should use RPC
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(iterations)
    })

    it('should handle concurrent report generation requests efficiently', async () => {
      // Mock RPC to simulate some processing time
      mockSupabase.rpc.mockImplementation(() => ({
        single: () => new Promise(resolve =>
          setTimeout(() => resolve({ data: { report_id: 'payout-concurrent', already_exists: false }, error: null }), 50)
        )
      }))

      const concurrentRequests = 5
      const startTime = Date.now()

      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        service.generateSettlementReport({
          eventId: `event-${i}`,
          organizerId: 'organizer-1'
        })
      )

      const results = await Promise.all(promises)
      const totalDuration = Date.now() - startTime

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.reportId).toBe('payout-concurrent')
      })

      // Should complete all concurrent requests efficiently
      expect(totalDuration).toBeLessThan(300) // Much less than sequential execution
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(concurrentRequests)
    })
  })
})
