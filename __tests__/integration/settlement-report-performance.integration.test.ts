/**
 * Settlement Report Performance Integration Tests
 *
 * Tests the performance characteristics of the RPC-based report generation.
 * All processing is now done in the database via generate_settlement_report RPC.
 * These tests require a real DB connection and should be run in a test environment with sample data.
 */

import { SettlementReportService } from '@/lib/services/settlement-report/service'
import { createClient } from '@/lib/supabase/server'

describe('Settlement Report Performance Integration', () => {
  let service: SettlementReportService
  let supabase: ReturnType<typeof createClient>

  beforeAll(() => {
    supabase = createClient()
    service = new SettlementReportService(supabase)
  })

  // Skip these tests in CI/CD unless explicitly enabled
  const runPerformanceTests = process.env.RUN_PERFORMANCE_TESTS === 'true'

  describe('RPC Aggregation Performance', () => {
    beforeAll(() => {
      if (!runPerformanceTests) {
        console.log('Skipping performance tests: RUN_PERFORMANCE_TESTS not set to true')
      }
    })

    it('should complete aggregation for large event within 2 seconds', async () => {
      if (!runPerformanceTests) {
        console.log('Skipping: RUN_PERFORMANCE_TESTS not set to true')
        return
      }
      // This test requires a test event with substantial payment data
      const testEventId = process.env.TEST_EVENT_ID_LARGE
      const testOrganizerId = process.env.TEST_ORGANIZER_ID

      if (!testEventId || !testOrganizerId) {
        console.warn('Skipping performance test: TEST_EVENT_ID_LARGE or TEST_ORGANIZER_ID not set')
        return
      }

      const startTime = Date.now()

      const result = await service.generateSettlementReport({
        eventId: testEventId,
        organizerId: testOrganizerId,

      })

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(result.success).toBe(true)
      expect(duration).toBeLessThan(2000) // Should complete within 2 seconds

      console.log(`Performance test completed in ${duration}ms`)

      if (result.reportData) {
        console.log(`Processed ${result.reportData.totalPaymentCount} payments`)
        console.log(`Total sales: ¥${result.reportData.totalStripeSales.toLocaleString()}`)
      }
    }, 10000) // 10 second timeout

    it('should demonstrate network efficiency vs theoretical old implementation', async () => {
      const testEventId = process.env.TEST_EVENT_ID_MEDIUM
      const testOrganizerId = process.env.TEST_ORGANIZER_ID

      if (!testEventId || !testOrganizerId) {
        console.warn('Skipping network efficiency test: TEST_EVENT_ID_MEDIUM or TEST_ORGANIZER_ID not set')
        return
      }

      // Test the new RPC-based approach
      const startTime = Date.now()

      const result = await service.generateSettlementReport({
        eventId: testEventId,
        organizerId: testOrganizerId,

      })

      const endTime = Date.now()
      const rpcDuration = endTime - startTime

      expect(result.success).toBe(true)

      // Simulate what the old approach would have done
      const oldApproachStart = Date.now()

      // Old approach: Fetch all payments and reduce in JS
      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`
          amount,
          application_fee_amount,
          refunded_amount,
          application_fee_refunded_amount,
          attendances!inner (
            event_id
          )
        `)
        .eq('attendances.event_id', testEventId)
        .eq('method', 'stripe')
        .eq('status', 'paid')

      // Simulate JS reduce operations
      const payments = paymentsData || []
      const totalSales = payments.reduce((sum, p) => sum + p.amount, 0)
      const totalAppFee = payments.reduce((sum, p) => sum + (p.application_fee_amount || 0), 0)
      const totalRefunded = payments.reduce((sum, p) => sum + (p.refunded_amount || 0), 0)

      const oldApproachEnd = Date.now()
      const oldApproachDuration = oldApproachEnd - oldApproachStart

      console.log(`RPC approach: ${rpcDuration}ms`)
      console.log(`Old approach simulation: ${oldApproachDuration}ms`)
      console.log(`Processed ${payments.length} payment records`)
      console.log(`Performance improvement: ${Math.round((oldApproachDuration / rpcDuration) * 100)}%`)

      // RPC approach should be faster, especially with more data
      if (payments.length > 50) {
        expect(rpcDuration).toBeLessThan(oldApproachDuration)
      }

      // Verify results are consistent
      if (result.reportData) {
        expect(result.reportData.totalStripeSales).toBe(totalSales)
        expect(result.reportData.totalApplicationFee).toBe(totalAppFee)
        expect(result.reportData.totalRefundedAmount).toBe(totalRefunded)
      }
    }, 15000) // 15 second timeout

    it('should handle concurrent report generation efficiently', async () => {
      const testEventIds = [
        process.env.TEST_EVENT_ID_1,
        process.env.TEST_EVENT_ID_2,
        process.env.TEST_EVENT_ID_3
      ].filter(Boolean) as string[]

      const testOrganizerId = process.env.TEST_ORGANIZER_ID

      if (testEventIds.length < 2 || !testOrganizerId) {
        console.warn('Skipping concurrent test: Need at least 2 test event IDs and organizer ID')
        return
      }

      const startTime = Date.now()

      // Generate reports concurrently
      const promises = testEventIds.map(eventId =>
        service.generateSettlementReport({
          eventId,
          organizerId: testOrganizerId,

        })
      )

      const results = await Promise.all(promises)

      const endTime = Date.now()
      const totalDuration = endTime - startTime

      // All should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        console.log(`Event ${testEventIds[index]}: ${result.success ? 'SUCCESS' : 'FAILED'}`)
      })

      console.log(`Concurrent generation of ${testEventIds.length} reports: ${totalDuration}ms`)

      // Should complete all within reasonable time
      expect(totalDuration).toBeLessThan(5000) // 5 seconds for multiple reports
    }, 20000) // 20 second timeout
  })

  describe('Memory Usage', () => {
    it('should maintain low memory footprint with large datasets', async () => {
      if (!runPerformanceTests) {
        console.log('Skipping: RUN_PERFORMANCE_TESTS not set to true')
        return
      }
      const testEventId = process.env.TEST_EVENT_ID_LARGE
      const testOrganizerId = process.env.TEST_ORGANIZER_ID

      if (!testEventId || !testOrganizerId) {
        console.warn('Skipping memory test: TEST_EVENT_ID_LARGE or TEST_ORGANIZER_ID not set')
        return
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const initialMemory = process.memoryUsage()

      const result = await service.generateSettlementReport({
        eventId: testEventId,
        organizerId: testOrganizerId,

      })

      const finalMemory = process.memoryUsage()

      expect(result.success).toBe(true)

      const heapUsedDelta = finalMemory.heapUsed - initialMemory.heapUsed
      const heapUsedMB = heapUsedDelta / (1024 * 1024)

      console.log(`Memory delta: ${heapUsedMB.toFixed(2)} MB`)

      // Should not use excessive memory (threshold: 10MB for report generation)
      expect(heapUsedMB).toBeLessThan(10)
    }, 15000)
  })
})

/**
 * Setup instructions for performance tests:
 *
 * 1. Set environment variables:
 *    - RUN_PERFORMANCE_TESTS=true
 *    - TEST_EVENT_ID_LARGE=<event with 500+ payments>
 *    - TEST_EVENT_ID_MEDIUM=<event with 100+ payments>
 *    - TEST_EVENT_ID_1, TEST_EVENT_ID_2, TEST_EVENT_ID_3=<various test events>
 *    - TEST_ORGANIZER_ID=<valid organizer UUID>
 *
 * 2. Ensure test database has the new RPC function:
 *    - Apply migration: 20241220_add_settlement_aggregations_rpc.sql
 *
 * 3. Run with: npm test -- --testNamePattern="Performance Integration"
 */
