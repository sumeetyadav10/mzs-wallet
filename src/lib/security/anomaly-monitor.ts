import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

interface AnomalyEvent {
  timestamp: string;
  userId: string;
  email: string;
  type: 'WITHDRAWAL' | 'LOGIN' | 'FAILED_OTP' | 'API_ACCESS' | 'LARGE_TRANSFER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: {
    amount?: number;
    currency?: string;
    toAddress?: string;
    fromAddress?: string;
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
    flags?: string[];
    riskScore?: number;
    previousIP?: string;
    location?: string;
    attemptCount?: number;
  };
  action: 'ALLOWED' | 'BLOCKED' | 'FLAGGED' | 'REQUIRES_REVIEW';
  sessionId?: string;
}

export class AnomalyMonitor {
  private static LOG_DIR = process.env.ANOMALY_LOG_DIR || path.join(process.cwd(), 'logs', 'anomalies');
  private static STATS_FILE = path.join(this.LOG_DIR, 'user_stats.json');
  private static userStatsCache = new Map<string, any>();
  private static lastCacheUpdate = 0;
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Ensure log directory exists
  static {
    try {
      if (!fs.existsSync(this.LOG_DIR)) {
        fs.mkdirSync(this.LOG_DIR, { recursive: true });
      }
    } catch (error) {
      logger.error('Failed to create anomaly log directory:', error);
    }
  }

  /**
   * Log an anomaly event
   */
  static async logAnomaly(event: AnomalyEvent): Promise<void> {
    try {
      // Create filename based on date and severity
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `anomalies_${dateStr}_${event.severity.toLowerCase()}.json`;
      const filepath = path.join(this.LOG_DIR, filename);

      // Add server timestamp
      const logEntry = {
        ...event,
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
      };

      // Append to file (create if doesn't exist)
      const logLine = JSON.stringify(logEntry) + '\n';
      
      await fs.promises.appendFile(filepath, logLine, 'utf8');

      // Also log critical events to main logger
      if (event.severity === 'CRITICAL') {
        logger.error('🚨 CRITICAL ANOMALY:', logEntry);
      }

      // Update user stats if it's a withdrawal
      if (event.type === 'WITHDRAWAL' && event.details.amount) {
        await this.updateUserStats(event.userId, event.details);
      }

    } catch (error) {
      logger.error('Failed to log anomaly:', error);
    }
  }

  /**
   * Check withdrawal for anomalies
   */
  static async checkWithdrawal(params: {
    userId: string;
    email: string;
    amount: number;
    currency: string;
    toAddress: string;
    ipAddress: string;
    userAgent: string;
    sessionId?: string;
  }): Promise<{
    allowed: boolean;
    flags: string[];
    riskScore: number;
    requiresReview: boolean;
    shouldBlock: boolean;
  }> {
    const flags: string[] = [];
    
    try {
      // Load user stats
      const stats = await this.getUserStats(params.userId);
      
      // 1. Check if first transaction
      if (!stats.lastWithdrawal) {
        flags.push('FIRST_WITHDRAWAL');
      }

      // 2. Check amount anomaly
      const avgAmount = stats.averageAmount || 50;
      if (params.amount > avgAmount * 5) {
        flags.push('UNUSUAL_AMOUNT_5X');
      }
      if (params.amount > avgAmount * 10) {
        flags.push('UNUSUAL_AMOUNT_10X');
      }
      if (params.amount > 1000) {
        flags.push('HIGH_VALUE_TRANSACTION');
      }

      // 3. Check velocity (transactions in last 24h)
      const last24h = stats.withdrawals24h || 0;
      if (last24h > 5) {
        flags.push('HIGH_VELOCITY_24H');
      }

      // 4. Check new address
      if (!stats.knownAddresses?.includes(params.toAddress)) {
        flags.push('NEW_ADDRESS');
      }

      // 5. Check IP change
      if (stats.lastIP && stats.lastIP !== params.ipAddress) {
        flags.push('IP_CHANGED');
        
        // Check if IP is from different country (you'd need GeoIP for this)
        // For now, just flag significant IP changes
        const lastIPParts = stats.lastIP.split('.');
        const currentIPParts = params.ipAddress.split('.');
        if (lastIPParts[0] !== currentIPParts[0]) {
          flags.push('MAJOR_IP_CHANGE');
        }
      }

      // 6. Check time patterns
      const hour = new Date().getHours();
      const usualHours = stats.usualHours || [];
      if (usualHours.length > 0 && !usualHours.includes(hour)) {
        flags.push('UNUSUAL_TIME');
      }

      // 7. Check rapid withdrawals
      if (stats.lastWithdrawal) {
        const timeSinceLastTx = Date.now() - new Date(stats.lastWithdrawal).getTime();
        if (timeSinceLastTx < 5 * 60 * 1000) { // 5 minutes
          flags.push('RAPID_WITHDRAWAL');
        }
      }

      // Calculate risk score
      const riskScore = this.calculateRiskScore(flags);
      
      // Determine severity for logging only - NO BLOCKING
      const severity = riskScore >= 8 ? 'CRITICAL' : 
                      riskScore >= 5 ? 'HIGH' : 
                      riskScore >= 3 ? 'MEDIUM' : 'LOW';

      // Log the anomaly if any flags detected
      if (flags.length > 0) {
        await this.logAnomaly({
          timestamp: new Date().toISOString(),
          userId: params.userId,
          email: params.email,
          type: 'WITHDRAWAL',
          severity,
          details: {
            amount: params.amount,
            currency: params.currency,
            toAddress: params.toAddress,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            flags,
            riskScore,
            previousIP: stats.lastIP
          },
          action: 'FLAGGED' as const, // Log as flagged for monitoring
          sessionId: params.sessionId
        });
      }

      // Always return allowed - we only monitor, never block
      return {
        allowed: true,
        flags,
        riskScore,
        requiresReview: false,
        shouldBlock: false
      };

    } catch (error) {
      logger.error('Anomaly check failed:', error);
      // On error, be conservative
      return {
        allowed: true,
        flags: ['CHECK_FAILED'],
        riskScore: 0,
        requiresReview: false,
        shouldBlock: false
      };
    }
  }

  /**
   * Calculate risk score based on flags
   */
  private static calculateRiskScore(flags: string[]): number {
    const scores: Record<string, number> = {
      'FIRST_WITHDRAWAL': 1,
      'NEW_ADDRESS': 2,
      'IP_CHANGED': 1,
      'MAJOR_IP_CHANGE': 3,
      'UNUSUAL_AMOUNT_5X': 3,
      'UNUSUAL_AMOUNT_10X': 5,
      'HIGH_VALUE_TRANSACTION': 2,
      'HIGH_VELOCITY_24H': 4,
      'UNUSUAL_TIME': 1,
      'RAPID_WITHDRAWAL': 2,
    };

    return flags.reduce((total, flag) => total + (scores[flag] || 0), 0);
  }

  /**
   * Get user statistics
   */
  private static async getUserStats(userId: string): Promise<any> {
    try {
      // Check cache first
      if (Date.now() - this.lastCacheUpdate < this.CACHE_TTL) {
        const cached = this.userStatsCache.get(userId);
        if (cached) return cached;
      }

      // Load stats file
      if (fs.existsSync(this.STATS_FILE)) {
        const data = await fs.promises.readFile(this.STATS_FILE, 'utf8');
        const allStats = JSON.parse(data);
        
        // Update cache
        this.userStatsCache = new Map(Object.entries(allStats));
        this.lastCacheUpdate = Date.now();
        
        return allStats[userId] || {};
      }

      return {};
    } catch (error) {
      logger.error('Failed to load user stats:', error);
      return {};
    }
  }

  /**
   * Update user statistics
   */
  private static async updateUserStats(userId: string, details: any): Promise<void> {
    try {
      const stats = await this.getUserStats(userId);
      
      // Update stats
      stats.lastWithdrawal = new Date().toISOString();
      stats.lastIP = details.ipAddress;
      stats.totalWithdrawals = (stats.totalWithdrawals || 0) + 1;
      
      // Update average amount
      const oldAvg = stats.averageAmount || details.amount;
      const count = stats.totalWithdrawals || 1;
      stats.averageAmount = ((oldAvg * (count - 1)) + details.amount) / count;
      
      // Track known addresses
      stats.knownAddresses = stats.knownAddresses || [];
      if (!stats.knownAddresses.includes(details.toAddress)) {
        stats.knownAddresses.push(details.toAddress);
      }
      
      // Track usual hours
      const hour = new Date().getHours();
      stats.usualHours = stats.usualHours || [];
      if (!stats.usualHours.includes(hour)) {
        stats.usualHours.push(hour);
      }
      
      // Update 24h velocity
      const now = Date.now();
      stats.recentWithdrawals = (stats.recentWithdrawals || []).filter((ts: number) => 
        now - ts < 24 * 60 * 60 * 1000
      );
      stats.recentWithdrawals.push(now);
      stats.withdrawals24h = stats.recentWithdrawals.length;
      
      // Save all stats
      let allStats: Record<string, any> = {};
      if (fs.existsSync(this.STATS_FILE)) {
        const data = await fs.promises.readFile(this.STATS_FILE, 'utf8');
        allStats = JSON.parse(data);
      }
      
      allStats[userId] = stats;
      
      await fs.promises.writeFile(
        this.STATS_FILE,
        JSON.stringify(allStats, null, 2),
        'utf8'
      );
      
      // Update cache
      this.userStatsCache.set(userId, stats);
      
    } catch (error) {
      logger.error('Failed to update user stats:', error);
    }
  }

  /**
   * Get recent anomalies
   */
  static async getRecentAnomalies(severity?: string, limit = 100): Promise<AnomalyEvent[]> {
    try {
      const files = await fs.promises.readdir(this.LOG_DIR);
      const anomalies: AnomalyEvent[] = [];
      
      // Sort files by date (newest first)
      const sortedFiles = files
        .filter(f => f.startsWith('anomalies_') && f.endsWith('.json'))
        .filter(f => !severity || f.includes(severity.toLowerCase()))
        .sort()
        .reverse();
      
      // Read files until we have enough events
      for (const file of sortedFiles) {
        const filepath = path.join(this.LOG_DIR, file);
        const content = await fs.promises.readFile(filepath, 'utf8');
        const lines = content.trim().split('\n');
        
        for (const line of lines.reverse()) {
          if (line) {
            try {
              anomalies.push(JSON.parse(line));
              if (anomalies.length >= limit) {
                return anomalies;
              }
            } catch (e) {
              // Skip malformed lines
            }
          }
        }
      }
      
      return anomalies;
    } catch (error) {
      logger.error('Failed to get recent anomalies:', error);
      return [];
    }
  }

  /**
   * Log failed OTP attempts (monitoring only)
   */
  static async logFailedOTP(params: {
    userId: string;
    email: string;
    ipAddress: string;
    userAgent: string;
    attemptCount: number;
  }): Promise<void> {
    const severity = params.attemptCount > 5 ? 'CRITICAL' :
                    params.attemptCount > 3 ? 'HIGH' : 'MEDIUM';
    
    await this.logAnomaly({
      timestamp: new Date().toISOString(),
      userId: params.userId,
      email: params.email,
      type: 'FAILED_OTP',
      severity,
      details: {
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        attemptCount: params.attemptCount,
        flags: params.attemptCount > 3 ? ['MULTIPLE_FAILURES'] : []
      },
      action: 'FLAGGED' as const // Always just flagged for monitoring
    });
  }

  /**
   * Log failed OTP attempt (alias for compatibility)
   */
  static async logFailedOTPAttempt(params: {
    email: string;
    ipAddress: string;
    userAgent: string;
    reason: string;
    timestamp: Date;
  }): Promise<void> {
    logger.warn('Failed OTP attempt logged', {
      email: params.email,
      ipAddress: params.ipAddress,
      reason: params.reason,
      timestamp: params.timestamp.toISOString()
    });
  }

  /**
   * Get summary statistics
   */
  static async getSummary(): Promise<{
    total24h: number;
    critical24h: number;
    blockedTransactions: number;
    topFlags: Record<string, number>;
  }> {
    const anomalies = await this.getRecentAnomalies(undefined, 1000);
    const now = Date.now();
    const last24h = anomalies.filter(a => 
      now - new Date(a.timestamp).getTime() < 24 * 60 * 60 * 1000
    );
    
    const topFlags: Record<string, number> = {};
    last24h.forEach(a => {
      a.details.flags?.forEach(flag => {
        topFlags[flag] = (topFlags[flag] || 0) + 1;
      });
    });
    
    return {
      total24h: last24h.length,
      critical24h: last24h.filter(a => a.severity === 'CRITICAL').length,
      blockedTransactions: last24h.filter(a => a.action === 'BLOCKED').length,
      topFlags
    };
  }
}