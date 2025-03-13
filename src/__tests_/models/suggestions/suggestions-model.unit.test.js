const SuggestionModel = require('../../../models/suggestions/suggestions-model');
const { sql } = require('../../../config/database');
const { notifyAdmins, notifyUser } = require('../../../utils/suggestionEmail');

// Mock the database connection
jest.mock('../../../config/database', () => ({
  sql: {
    begin: jest.fn(),
    default: jest.fn()
  }
}));

// Mock email notifications
jest.mock('../../../utils/suggestionEmail', () => ({
  notifyAdmins: jest.fn(),
  notifyUser: jest.fn()
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid')
}));

describe('SuggestionModel Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSuggestion', () => {
    test('should create a new suggestion with valid parameters', async () => {
      const userId = 'user-123';
      const description = 'This is a test suggestion';
      const isAnonymous = false;
      const category = 'general';
      const urgency = 'normal';
      const notifyUser = true;

      sql.mockResolvedValueOnce([{ id: 'mocked-uuid' }]);
      sql.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await SuggestionModel.createSuggestion({
        userId,
        description,
        isAnonymous,
        category,
        urgency,
        notifyUser
      });

      expect(result.id).toBe('mocked-uuid');
      expect(sql).toHaveBeenCalledTimes(2);
      expect(SuggestionModel.handleNotifications).toHaveBeenCalledWith(expect.objectContaining({
        id: 'mocked-uuid'
      }));
    });

    test('should throw error for invalid description length', async () => {
      const userId = 'user-123';
      const description = 'short'; // Too short
      const isAnonymous = false;
      const category = 'general';
      const urgency = 'normal';
      const notifyUser = true;

      await expect(SuggestionModel.createSuggestion({
        userId,
        description,
        isAnonymous,
        category,
        urgency,
        notifyUser
      })).rejects.toThrow('Description must be at least 20 characters');
    });

    test('should throw error for invalid category', async () => {
      const userId = 'user-123';
      const description = 'Valid description with more than 20 characters';
      const isAnonymous = false;
      const category = 'invalid-category';
      const urgency = 'normal';
      const notifyUser = true;

      await expect(SuggestionModel.createSuggestion({
        userId,
        description,
        isAnonymous,
        category,
        urgency,
        notifyUser
      })).rejects.toThrow('Invalid category: invalid-category');
    });
  });

  describe('getAdminDashboardSuggestions', () => {
    test('should return filtered suggestions with pagination', async () => {
      const filters = { status: 'pending', category: 'general', urgency: 'high' };
      const page = 2;
      const limit = 10;

      sql.mockResolvedValueOnce([
        { id: 'suggestion-1', total_count: 25 },
        { id: 'suggestion-2' }
      ]);

      const result = await SuggestionModel.getAdminDashboardSuggestions(filters, page, limit);

      expect(result.suggestions).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3); // 25 items / 10 per page = 3 pages
      expect(sql).toHaveBeenCalledTimes(1);
    });
  });

  describe('archiveSuggestion', () => {
    test('should archive a suggestion and update admin notes', async () => {
      const suggestionId = 'suggestion-123';
      const adminId = 'admin-456';

      sql.begin.mockResolvedValueOnce({
        then: jest.fn((callback) => callback({
          begin: jest.fn()
        }))
      });

      const result = await SuggestionModel.archiveSuggestion(suggestionId, adminId);

      expect(result).toBeDefined();
      expect(sql.begin).toHaveBeenCalled();
    });

    test('should throw error if admin is not found', async () => {
      const suggestionId = 'suggestion-123';
      const adminId = 'non-existing-admin';

      sql.begin.mockResolvedValueOnce({
        then: jest.fn((callback) => {
          callback({
            begin: jest.fn(),
            execute: jest.fn(() => [null])
          });
        })
      });

      await expect(SuggestionModel.archiveSuggestion(suggestionId, adminId))
        .rejects.toThrow('Admin not found');
    });
  });

  describe('updateSuggestion', () => {
    test('should update a suggestion and send notification', async () => {
      const id = 'suggestion-123';
      const status = 'reviewed';
      const adminResponse = 'Thank you for your suggestion';
      const adminId = 'admin-456';

      sql.begin.mockResolvedValueOnce({
        then: jest.fn((callback) => {
          callback({
            begin: jest.fn(),
            execute: jest.fn((query) => {
              if (query.includes('UPDATE suggestions')) {
                return [{ id: 'suggestion-123' }];
              } else if (query.includes('SELECT email, full_name')) {
                return [{ email: 'user@example.com', full_name: 'Test User' }];
              }
              return [];
            })
          });
        })
      });

      const result = await SuggestionModel.updateSuggestion({ id, status, adminResponse, adminId });

      expect(result.id).toBe('suggestion-123');
      expect(SuggestionModel.handleStatusUpdateNotification).toHaveBeenCalled();
    });

    test('should throw error if suggestion is not found', async () => {
      const id = 'non-existing-suggestion';
      const status = 'reviewed';
      const adminResponse = 'Thank you for your suggestion';
      const adminId = 'admin-456';

      sql.begin.mockResolvedValueOnce({
        then: jest.fn((callback) => {
          callback({
            begin: jest.fn(),
            execute: jest.fn(() => [null])
          });
        })
      });

      await expect(SuggestionModel.updateSuggestion({ id, status, adminResponse, adminId }))
        .rejects.toThrow('Suggestion not found');
    });
  });

  describe('handleNotifications', () => {
    test('should notify admins and user when suggestion is created', async () => {
      const suggestion = {
        id: 'suggestion-123',
        user_id: 'user-456',
        is_anonymous: false,
        user_notification_preference: true
      };

      sql.mockResolvedValueOnce([{ email: 'admin1@example.com' }, { email: 'admin2@example.com' }]);
      sql.mockResolvedValueOnce([{ email: 'user@example.com', full_name: 'Test User' }]);

      await SuggestionModel.handleNotifications(suggestion);

      expect(notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({
        adminEmails: ['admin1@example.com', 'admin2@example.com']
      }));
      expect(notifyUser).toHaveBeenCalledWith(expect.objectContaining({
        userEmail: 'user@example.com'
      }));
    });

    test('should not notify user if anonymous or notification preference is off', async () => {
      const suggestion = {
        id: 'suggestion-123',
        user_id: 'user-456',
        is_anonymous: true,
        user_notification_preference: false
      };

      sql.mockResolvedValueOnce([{ email: 'admin1@example.com' }]);

      await SuggestionModel.handleNotifications(suggestion);

      expect(notifyAdmins).toHaveBeenCalled();
      expect(notifyUser).not.toHaveBeenCalled();
    });
  });
});