const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

async function searchUserSecurityLogs() {
  const targetEmail = 'aszx7939@gmail.com';
  const targetUserId = '00034102882';
  
  console.log(`🔍 SEARCHING SECURITY LOGS FOR USER:`);
  console.log(`📧 Email: ${targetEmail}`);
  console.log(`🆔 User ID: ${targetUserId}`);
  console.log('='.repeat(80));
  
  const results = {
    userDocuments: [],
    adminLoginAttempts: [],
    adminSessions: [],
    anomalyLogs: [],
    auditLogs: [],
    authSessions: []
  };

  try {
    // 1. Search main user collection
    console.log('\n📁 1. SEARCHING MAIN USER COLLECTION (mzs)...');
    const userQuery1 = await db.collection('mzs')
      .where('auth_email', '==', targetEmail)
      .get();
    
    const userQuery2 = await db.collection('mzs')
      .where('user_id', '==', targetUserId)
      .get();

    userQuery1.forEach(doc => {
      const data = doc.data();
      results.userDocuments.push({
        source: 'mzs collection (by email)',
        docId: doc.id,
        userId: data.user_id,
        email: data.auth_email,
        createdAt: data.created_at,
        migrated: data.migrated,
        migratedAt: data.migratedAt,
        lastLogin: data.last_login,
        loginCount: data.login_count
      });
    });

    userQuery2.forEach(doc => {
      const data = doc.data();
      if (!results.userDocuments.find(u => u.docId === doc.id)) {
        results.userDocuments.push({
          source: 'mzs collection (by user_id)',
          docId: doc.id,
          userId: data.user_id,
          email: data.auth_email,
          createdAt: data.created_at,
          migrated: data.migrated,
          migratedAt: data.migratedAt,
          lastLogin: data.last_login,
          loginCount: data.login_count
        });
      }
    });

    if (results.userDocuments.length > 0) {
      console.log(`✅ Found ${results.userDocuments.length} user document(s)`);
      results.userDocuments.forEach((doc, i) => {
        console.log(`   ${i+1}. Doc ID: ${doc.docId} (${doc.source})`);
        console.log(`      User ID: ${doc.userId}`);
        console.log(`      Email: ${doc.email}`);
        console.log(`      Created: ${doc.createdAt ? new Date(doc.createdAt.toDate ? doc.createdAt.toDate() : doc.createdAt).toLocaleString() : 'N/A'}`);
        console.log(`      Migrated: ${doc.migrated ? 'Yes' : 'No'}`);
        if (doc.lastLogin) {
          console.log(`      Last Login: ${new Date(doc.lastLogin.toDate ? doc.lastLogin.toDate() : doc.lastLogin).toLocaleString()}`);
        }
      });
    } else {
      console.log('❌ No user documents found');
    }

    // 2. Search admin login attempts
    console.log('\n🔐 2. SEARCHING ADMIN LOGIN ATTEMPTS...');
    try {
      const adminLoginQuery = await db.collection('admin_login_attempts')
        .where('email', '==', targetEmail)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

      adminLoginQuery.forEach(doc => {
        const data = doc.data();
        results.adminLoginAttempts.push({
          id: doc.id,
          email: data.email,
          success: data.success,
          timestamp: data.timestamp,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          reason: data.reason
        });
      });

      if (results.adminLoginAttempts.length > 0) {
        console.log(`✅ Found ${results.adminLoginAttempts.length} admin login attempt(s)`);
        results.adminLoginAttempts.forEach((attempt, i) => {
          const timestamp = attempt.timestamp.toDate ? attempt.timestamp.toDate() : new Date(attempt.timestamp);
          console.log(`   ${i+1}. ${timestamp.toLocaleString()} - ${attempt.success ? '✅ SUCCESS' : '❌ FAILED'}`);
          console.log(`      IP: ${attempt.ipAddress}`);
          console.log(`      User Agent: ${attempt.userAgent?.substring(0, 60)}...`);
          if (attempt.reason) console.log(`      Reason: ${attempt.reason}`);
        });
      } else {
        console.log('❌ No admin login attempts found');
      }
    } catch (error) {
      console.log(`❌ Error searching admin login attempts: ${error.message}`);
    }

    // 3. Search admin sessions
    console.log('\n👤 3. SEARCHING ADMIN SESSIONS...');
    try {
      const adminSessionQuery = await db.collection('admin_sessions')
        .where('email', '==', targetEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      adminSessionQuery.forEach(doc => {
        const data = doc.data();
        results.adminSessions.push({
          id: doc.id,
          adminId: data.adminId,
          email: data.email,
          role: data.role,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          ipAddress: data.ipAddress,
          deviceFingerprint: data.deviceFingerprint,
          lastActivity: data.lastActivity
        });
      });

      if (results.adminSessions.length > 0) {
        console.log(`✅ Found ${results.adminSessions.length} admin session(s)`);
        results.adminSessions.forEach((session, i) => {
          const createdAt = session.createdAt.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
          const expiresAt = session.expiresAt.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
          const lastActivity = session.lastActivity ? (session.lastActivity.toDate ? session.lastActivity.toDate() : new Date(session.lastActivity)) : null;
          
          console.log(`   ${i+1}. Session ID: ${session.id}`);
          console.log(`      Admin ID: ${session.adminId}`);
          console.log(`      Role: ${session.role}`);
          console.log(`      Created: ${createdAt.toLocaleString()}`);
          console.log(`      Expires: ${expiresAt.toLocaleString()}`);
          console.log(`      Last Activity: ${lastActivity ? lastActivity.toLocaleString() : 'N/A'}`);
          console.log(`      IP: ${session.ipAddress}`);
        });
      } else {
        console.log('❌ No admin sessions found');
      }
    } catch (error) {
      console.log(`❌ Error searching admin sessions: ${error.message}`);
    }

    // 4. Search audit logs
    console.log('\n📋 4. SEARCHING AUDIT LOGS...');
    try {
      const auditQuery = await db.collection('audit_logs')
        .where('email', '==', targetEmail)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

      auditQuery.forEach(doc => {
        const data = doc.data();
        results.auditLogs.push({
          id: doc.id,
          action: data.action,
          email: data.email,
          userId: data.userId,
          timestamp: data.timestamp,
          details: data.details,
          ipAddress: data.ipAddress
        });
      });

      if (results.auditLogs.length > 0) {
        console.log(`✅ Found ${results.auditLogs.length} audit log(s)`);
        results.auditLogs.forEach((log, i) => {
          const timestamp = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
          console.log(`   ${i+1}. ${timestamp.toLocaleString()} - ${log.action}`);
          console.log(`      User ID: ${log.userId}`);
          console.log(`      IP: ${log.ipAddress}`);
          console.log(`      Details: ${JSON.stringify(log.details)}`);
        });
      } else {
        console.log('❌ No audit logs found');
      }
    } catch (error) {
      console.log(`❌ Error searching audit logs: ${error.message}`);
    }

    // 5. Search auth sessions
    console.log('\n🔑 5. SEARCHING AUTH SESSIONS...');
    try {
      const authSessionQuery = await db.collection('auth_sessions')
        .where('email', '==', targetEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const authSessionQuery2 = await db.collection('auth_sessions')
        .where('userId', '==', targetUserId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      [...authSessionQuery.docs, ...authSessionQuery2.docs].forEach(doc => {
        const data = doc.data();
        if (!results.authSessions.find(s => s.id === doc.id)) {
          results.authSessions.push({
            id: doc.id,
            userId: data.userId,
            email: data.email,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            deviceFingerprint: data.deviceFingerprint,
            lastActivity: data.lastActivity
          });
        }
      });

      if (results.authSessions.length > 0) {
        console.log(`✅ Found ${results.authSessions.length} auth session(s)`);
        results.authSessions.forEach((session, i) => {
          const createdAt = session.createdAt.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
          const lastActivity = session.lastActivity ? (session.lastActivity.toDate ? session.lastActivity.toDate() : new Date(session.lastActivity)) : null;
          
          console.log(`   ${i+1}. Session ID: ${session.id}`);
          console.log(`      User ID: ${session.userId}`);
          console.log(`      Created: ${createdAt.toLocaleString()}`);
          console.log(`      Last Activity: ${lastActivity ? lastActivity.toLocaleString() : 'N/A'}`);
          console.log(`      IP: ${session.ipAddress}`);
          console.log(`      User Agent: ${session.userAgent?.substring(0, 60)}...`);
        });
      } else {
        console.log('❌ No auth sessions found');
      }
    } catch (error) {
      console.log(`❌ Error searching auth sessions: ${error.message}`);
    }

    // 6. Search local anomaly logs
    console.log('\n🚨 6. SEARCHING LOCAL ANOMALY LOGS...');
    const anomalyLogDir = path.join(__dirname, 'logs', 'anomalies');
    
    if (fs.existsSync(anomalyLogDir)) {
      const files = fs.readdirSync(anomalyLogDir);
      const anomalyFiles = files.filter(f => f.startsWith('anomalies_') && f.endsWith('.json'));
      
      for (const file of anomalyFiles) {
        try {
          const filePath = path.join(anomalyLogDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.trim().split('\n');
          
          for (const line of lines) {
            if (line) {
              try {
                const log = JSON.parse(line);
                if (log.email === targetEmail || log.userId === targetUserId) {
                  results.anomalyLogs.push({
                    file,
                    timestamp: log.timestamp,
                    type: log.type,
                    severity: log.severity,
                    action: log.action,
                    details: log.details
                  });
                }
              } catch (e) {
                // Skip malformed lines
              }
            }
          }
        } catch (error) {
          console.log(`❌ Error reading file ${file}: ${error.message}`);
        }
      }

      if (results.anomalyLogs.length > 0) {
        console.log(`✅ Found ${results.anomalyLogs.length} anomaly log(s)`);
        results.anomalyLogs.forEach((log, i) => {
          console.log(`   ${i+1}. ${new Date(log.timestamp).toLocaleString()} - ${log.type} (${log.severity})`);
          console.log(`      Action: ${log.action}`);
          console.log(`      File: ${log.file}`);
          console.log(`      Details: ${JSON.stringify(log.details)}`);
        });
      } else {
        console.log('❌ No anomaly logs found');
      }
    } else {
      console.log('❌ Anomaly log directory does not exist');
    }

    // 7. Search for any other collections that might contain user activity
    console.log('\n📊 7. SEARCHING OTHER COLLECTIONS...');
    try {
      // Search for OTP attempts
      const otpQuery = await db.collection('otp_attempts')
        .where('email', '==', targetEmail)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();

      if (!otpQuery.empty) {
        console.log(`✅ Found ${otpQuery.size} OTP attempt(s)`);
        otpQuery.forEach((doc, i) => {
          const data = doc.data();
          const timestamp = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          console.log(`   ${i+1}. ${timestamp.toLocaleString()} - ${data.success ? 'SUCCESS' : 'FAILED'}`);
          console.log(`      IP: ${data.ipAddress}`);
          console.log(`      Type: ${data.type || 'N/A'}`);
        });
      }

      // Search for security events
      const securityEventsQuery = await db.collection('security_events')
        .where('email', '==', targetEmail)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();

      if (!securityEventsQuery.empty) {
        console.log(`✅ Found ${securityEventsQuery.size} security event(s)`);
        securityEventsQuery.forEach((doc, i) => {
          const data = doc.data();
          const timestamp = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          console.log(`   ${i+1}. ${timestamp.toLocaleString()} - ${data.type}`);
          console.log(`      IP: ${data.ipAddress}`);
          console.log(`      Details: ${JSON.stringify(data.details)}`);
        });
      }

    } catch (error) {
      console.log(`❌ Error searching other collections: ${error.message}`);
    }

    // Summary
    console.log('\n📈 SUMMARY:');
    console.log('='.repeat(80));
    console.log(`👤 User Documents Found: ${results.userDocuments.length}`);
    console.log(`🔐 Admin Login Attempts: ${results.adminLoginAttempts.length}`);
    console.log(`👤 Admin Sessions: ${results.adminSessions.length}`);
    console.log(`📋 Audit Logs: ${results.auditLogs.length}`);
    console.log(`🔑 Auth Sessions: ${results.authSessions.length}`);
    console.log(`🚨 Anomaly Logs: ${results.anomalyLogs.length}`);

    if (results.userDocuments.length === 0 && 
        results.adminLoginAttempts.length === 0 && 
        results.adminSessions.length === 0 && 
        results.auditLogs.length === 0 && 
        results.authSessions.length === 0 && 
        results.anomalyLogs.length === 0) {
      console.log('\n⚠️  NO SECURITY LOGS OR USER ACTIVITY FOUND');
      console.log('This could mean:');
      console.log('- User has never logged in');
      console.log('- User email/ID is incorrect');
      console.log('- Logs have been cleaned up/expired');
      console.log('- User exists but has no recent activity');
    }

    // Write detailed results to file
    const resultsFile = path.join(__dirname, `security_search_${targetUserId}_${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${resultsFile}`);

  } catch (error) {
    console.error('❌ Error during search:', error);
    process.exit(1);
  }
}

// Run the search
searchUserSecurityLogs()
  .then(() => {
    console.log('\n✅ Security log search completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Security log search failed:', error);
    process.exit(1);
  });