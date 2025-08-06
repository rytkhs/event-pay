import { deleteUserById, checkUserProfileExists, createEmergencyAdminClient, createMaintenanceAdminClient } from "@/lib/security/admin-operations";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { getSecureClientFactory } from "@/lib/security";

// モック設定
jest.mock("@/lib/security", () => ({
  getSecureClientFactory: jest.fn(),
}));

describe("Admin Operations", () => {
  let mockSecureFactory: any;
  let mockAdminClient: any;

  beforeEach(() => {
    // モッククライアントの設定
    mockAdminClient = {
      auth: {
        admin: {
          deleteUser: jest.fn(),
        },
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    mockSecureFactory = {
      createAuditedAdminClient: jest.fn().mockResolvedValue(mockAdminClient),
    };

    (getSecureClientFactory as jest.Mock).mockReturnValue(mockSecureFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("deleteUserById", () => {
    it("should delete user with default reason and context", async () => {
      mockAdminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });

      await deleteUserById("user-123");

      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.USER_CLEANUP,
        "User deletion for compensation transaction"
      );
      expect(mockAdminClient.auth.admin.deleteUser).toHaveBeenCalledWith("user-123");
    });

    it("should delete user with custom reason and context", async () => {
      mockAdminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });

      await deleteUserById(
        "user-123",
        AdminReason.EMERGENCY_ACCESS,
        "Emergency user deletion due to security incident"
      );

      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.EMERGENCY_ACCESS,
        "Emergency user deletion due to security incident"
      );
      expect(mockAdminClient.auth.admin.deleteUser).toHaveBeenCalledWith("user-123");
    });

    it("should throw error when deletion fails", async () => {
      const deleteError = new Error("User not found");
      mockAdminClient.auth.admin.deleteUser.mockResolvedValue({ error: deleteError });

      await expect(deleteUserById("user-123")).rejects.toThrow("Failed to delete user: User not found");
    });
  });

  describe("checkUserProfileExists", () => {
    it("should return true when user profile exists", async () => {
      mockAdminClient.single.mockResolvedValue({
        data: { id: "user-123" },
        error: null,
      });

      const result = await checkUserProfileExists("user-123");

      expect(result).toBe(true);
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.SYSTEM_MAINTENANCE,
        "User profile existence check"
      );
      expect(mockAdminClient.from).toHaveBeenCalledWith("users");
      expect(mockAdminClient.select).toHaveBeenCalledWith("id");
      expect(mockAdminClient.eq).toHaveBeenCalledWith("id", "user-123");
    });

    it("should return false when user profile does not exist", async () => {
      mockAdminClient.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" }, // No rows returned
      });

      const result = await checkUserProfileExists("user-123");

      expect(result).toBe(false);
    });

    it("should return false when user profile data is null", async () => {
      mockAdminClient.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await checkUserProfileExists("user-123");

      expect(result).toBe(false);
    });

    it("should throw error for non-PGRST116 errors", async () => {
      const dbError = { code: "PGRST500", message: "Database connection failed" };
      mockAdminClient.single.mockResolvedValue({
        data: null,
        error: dbError,
      });

      await expect(checkUserProfileExists("user-123")).rejects.toThrow(
        "Failed to check user profile: Database connection failed"
      );
    });

    it("should use custom reason and context", async () => {
      mockAdminClient.single.mockResolvedValue({
        data: { id: "user-123" },
        error: null,
      });

      await checkUserProfileExists(
        "user-123",
        AdminReason.EMERGENCY_ACCESS,
        "Emergency profile check"
      );

      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.EMERGENCY_ACCESS,
        "Emergency profile check"
      );
    });
  });

  describe("createEmergencyAdminClient", () => {
    it("should create emergency admin client with proper audit context", async () => {
      const client = await createEmergencyAdminClient("user-123", "Security incident response");

      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.EMERGENCY_ACCESS,
        "Emergency access for user user-123: Security incident response"
      );
      expect(client).toBe(mockAdminClient);
    });
  });

  describe("createMaintenanceAdminClient", () => {
    it("should create maintenance admin client with proper audit context", async () => {
      const client = await createMaintenanceAdminClient("Database schema update");

      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.SYSTEM_MAINTENANCE,
        "System maintenance: Database schema update"
      );
      expect(client).toBe(mockAdminClient);
    });
  });

  describe("Integration with SecureClientFactory", () => {
    it("should properly integrate with secure client factory", async () => {
      mockAdminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });

      await deleteUserById("user-123", AdminReason.TEST_DATA_CLEANUP, "Test cleanup");

      // セキュアファクトリーが正しく呼び出されることを確認
      expect(getSecureClientFactory).toHaveBeenCalled();
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledWith(
        AdminReason.TEST_DATA_CLEANUP,
        "Test cleanup"
      );
    });

    it("should handle secure factory errors gracefully", async () => {
      const factoryError = new Error("Failed to create audited admin client");
      mockSecureFactory.createAuditedAdminClient.mockRejectedValue(factoryError);

      await expect(deleteUserById("user-123")).rejects.toThrow(factoryError);
    });
  });

  describe("Audit Trail", () => {
    it("should ensure all operations are audited", async () => {
      mockAdminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });
      mockAdminClient.single.mockResolvedValue({ data: { id: "user-123" }, error: null });

      // 複数の操作を実行
      await deleteUserById("user-1");
      await checkUserProfileExists("user-2");
      await createEmergencyAdminClient("user-3", "Emergency");
      await createMaintenanceAdminClient("Maintenance task");

      // 全ての操作で監査付きクライアントが作成されることを確認
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenCalledTimes(4);

      // 各操作で適切な理由が記録されることを確認
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenNthCalledWith(
        1,
        AdminReason.USER_CLEANUP,
        "User deletion for compensation transaction"
      );
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenNthCalledWith(
        2,
        AdminReason.SYSTEM_MAINTENANCE,
        "User profile existence check"
      );
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenNthCalledWith(
        3,
        AdminReason.EMERGENCY_ACCESS,
        "Emergency access for user user-3: Emergency"
      );
      expect(mockSecureFactory.createAuditedAdminClient).toHaveBeenNthCalledWith(
        4,
        AdminReason.SYSTEM_MAINTENANCE,
        "System maintenance: Maintenance task"
      );
    });
  });
});