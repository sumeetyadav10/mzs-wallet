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
  // Verify admin authentication
  const authResult = await verifyAdminSession(request);
  if (!authResult.success) {
    logger.warn('🚨 Unauthorized admin search-users access attempt', {
      error: authResult.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown'
    });
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

  try {
    const { searchTerm, searchFields, limit = 50 } = await request.json();

    if (!searchTerm) {
      return NextResponse.json({ error: 'Search term is required' }, { status: 400 });
    }

    logger.log(`Admin search: "${searchTerm}" in fields: ${searchFields?.join(', ') || 'all'}`);

    // Default searchable fields
    const defaultFields = [
      'user_id', 
      'auth_email', 
      'address', 
      'email',
      'created_at',
      'migratedAt'
    ];

    const fieldsToSearch = searchFields || defaultFields;
    const results: any[] = [];
    const searchedQueries: string[] = [];

    // Search exact matches for each field
    for (const field of fieldsToSearch) {
      try {
        const query = db.collection('users')
          .where(field, '==', searchTerm)
          .limit(limit);
        
        const snapshot = await query.get();
        searchedQueries.push(`${field} == "${searchTerm}"`);

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          // Remove sensitive fields for display
          const sanitizedData = { ...data };
          delete sanitizedData.private_key;
          delete sanitizedData.password_hash;
          
          // Add match info
          const result = {
            docId: doc.id,
            matchedField: field,
            matchedValue: searchTerm,
            ...sanitizedData
          };
          
          // Avoid duplicates
          if (!results.find(r => r.docId === doc.id)) {
            results.push(result);
          }
        });
             } catch (error: any) {
         logger.log(`Search failed for field ${field}:`, error?.message || error);
         // Continue with other fields
       }
    }

    // If no exact matches, try partial/fuzzy matching on text fields
    if (results.length === 0) {
      const textFields = ['user_id', 'auth_email', 'address'];
      
      for (const field of textFields) {
        try {
          // Get all documents and filter client-side for partial matches
          const allDocsQuery = db.collection('users').limit(1000);
          const snapshot = await allDocsQuery.get();
          
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const fieldValue = data[field];
            
            if (fieldValue && typeof fieldValue === 'string') {
              const isPartialMatch = fieldValue.toLowerCase().includes(searchTerm.toLowerCase());
              
              if (isPartialMatch) {
                const sanitizedData = { ...data };
                delete sanitizedData.private_key;
                delete sanitizedData.password_hash;
                
                const result = {
                  docId: doc.id,
                  matchedField: field,
                  matchedValue: fieldValue,
                  matchType: 'partial',
                  ...sanitizedData
                };
                
                if (!results.find(r => r.docId === doc.id)) {
                  results.push(result);
                }
              }
            }
          });
          
          searchedQueries.push(`${field} contains "${searchTerm}" (partial)`);
                 } catch (error: any) {
           logger.log(`Partial search failed for field ${field}:`, error?.message || error);
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