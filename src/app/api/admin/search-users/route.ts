import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

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

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Verify admin authentication with device fingerprint
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin search-users access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      deviceFingerprint: request.headers.get('x-device-fingerprint') || 'missing',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    return NextResponse.json({ error: authResult.error || 'Admin session required' }, { status: 403 });
  }
  
  // Log successful admin access
  logger.log('✅ Admin search API accessed', {
    adminEmail: authResult.email,
    adminId: authResult.adminId,
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    deviceFingerprint: request.headers.get('x-device-fingerprint'),
    action: 'search_users'
  });

  try {
    const { searchTerm, searchFields, limit = 50 } = await request.json();

    if (!searchTerm) {
      return NextResponse.json({ error: 'Search term is required' }, { status: 400 });
    }

    logger.log(`Admin search: "${searchTerm}" in fields: ${searchFields?.join(', ') || 'all'}`);

    // ONLY search in mzs collection with indexed fields
    const defaultFields = [
      'user_id', 
      'auth_email', 
      'email',
      'wallet_address'
    ];

    const fieldsToSearch = searchFields || defaultFields;
    const results: any[] = [];
    const searchedQueries: string[] = [];
    const processedDocIds = new Set<string>();

    // Search exact matches for each field in mzs collection only
    for (const field of fieldsToSearch) {
      try {
        // IMPORTANT: Only query mzs collection with indexed fields
        const query = db.collection('mzs')
          .where(field, '==', searchTerm)
          .limit(limit);
        
        const snapshot = await query.get();
        searchedQueries.push(`mzs.${field} == "${searchTerm}"`);

        snapshot.docs.forEach(doc => {
          if (!processedDocIds.has(doc.id)) {
            processedDocIds.add(doc.id);
            const data = doc.data();
            // Remove sensitive fields for display
            const sanitizedData = { ...data };
            delete sanitizedData.private_key;
            
            // Add match info
            const result = {
              docId: doc.id,
              matchedField: field,
              matchedValue: searchTerm,
              matchType: 'exact',
              ...sanitizedData
            };
            
            results.push(result);
          }
        });
      } catch (error: any) {
        logger.log(`Search failed for mzs.${field}:`, error?.message || error);
        // Continue with other fields
      }
    }

    // If no exact matches and searchTerm is long enough, try prefix matching on indexed fields
    if (results.length === 0 && searchTerm.length >= 3) {
      // Only do prefix matching for user_id and auth_email to minimize reads
      const prefixFields = ['user_id', 'auth_email'];
      
      for (const field of prefixFields) {
        if (!fieldsToSearch || fieldsToSearch.includes(field)) {
          try {
            // Use Firestore range queries for prefix matching (indexed)
            const startValue = searchTerm;
            const endValue = searchTerm + '\uf8ff'; // Unicode character to ensure we get all prefixes
            
            const query = db.collection('mzs')
              .where(field, '>=', startValue)
              .where(field, '<', endValue)
              .limit(limit - results.length);
            
            const snapshot = await query.get();
            searchedQueries.push(`mzs.${field} prefix "${searchTerm}"`);
            
            snapshot.docs.forEach(doc => {
              if (!processedDocIds.has(doc.id)) {
                processedDocIds.add(doc.id);
                const data = doc.data();
                const sanitizedData = { ...data };
                delete sanitizedData.private_key;
                
                const result = {
                  docId: doc.id,
                  matchedField: field,
                  matchedValue: data[field],
                  matchType: 'partial',
                  ...sanitizedData
                };
                
                results.push(result);
              }
            });
          } catch (error: any) {
            logger.log(`Prefix search failed for mzs.${field}:`, error?.message || error);
          }
        }
      }
    }

    return NextResponse.json({
      searchTerm,
      results: results.slice(0, limit),
      totalFound: results.length,
      searchedQueries,
      timestamp: new Date().toISOString(),
      adminEmail: authResult.email
    });

  } catch (error) {
    logger.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
} 