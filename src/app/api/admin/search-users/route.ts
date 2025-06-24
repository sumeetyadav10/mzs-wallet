import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from '@/lib/adminAuth';

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

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  // Verify admin authentication
  const authResult = await verifyAdminToken(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { query, field } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    console.log(`Search request: query="${query}", field="${field}"`);

    const results: any[] = [];
    const collection = db.collection('mzs');

    const searchLower = query.toLowerCase();
    
    if (field && field !== '') {
      // Search specific field using Firestore queries for better performance
      try {
        // Try exact match first
        const exactQuery = collection.where(field, '==', query).limit(10);
        const exactSnapshot = await exactQuery.get();
        
        exactSnapshot.docs.forEach(doc => {
          results.push({
            documentId: doc.id,
            matchField: field,
            matchType: 'exact',
            ...doc.data()
          });
        });

        // If we have less than 10 results, try partial match
        if (results.length < 10) {
          const partialQuery = collection
            .where(field, '>=', query)
            .where(field, '<=', query + '\uf8ff')
            .limit(20 - results.length);
          
          const partialSnapshot = await partialQuery.get();
          
          partialSnapshot.docs.forEach(doc => {
            // Avoid duplicates
            if (!results.find(r => r.documentId === doc.id)) {
              results.push({
                documentId: doc.id,
                matchField: field,
                matchType: 'partial',
                ...doc.data()
              });
            }
          });
        }
      } catch (error) {
        console.error('Field search error:', error);
        // Fallback to a simple approach
        const snapshot = await collection.limit(1000).get();
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const fieldValue = data[field];
          if (fieldValue && String(fieldValue).toLowerCase().includes(searchLower)) {
            results.push({
              documentId: doc.id,
              matchField: field,
              matchType: fieldValue === query ? 'exact' : 'partial',
              ...data
            });
          }
        });
      }
    } else {
      // Search all fields - use targeted queries for better performance
      const searchFields = ['user_id', 'auth_email', 'address'];
      
      for (const searchField of searchFields) {
        try {
          // Exact match
          const exactQuery = collection.where(searchField, '==', query).limit(5);
          const exactSnapshot = await exactQuery.get();
          
          exactSnapshot.docs.forEach(doc => {
            if (!results.find(r => r.documentId === doc.id)) {
              results.push({
                documentId: doc.id,
                matchField: searchField,
                matchType: 'exact',
                ...doc.data()
              });
            }
          });

          // Partial match (only if we don't have too many results yet)
          if (results.length < 15) {
            const partialQuery = collection
              .where(searchField, '>=', query)
              .where(searchField, '<=', query + '\uf8ff')
              .limit(5);
            
            const partialSnapshot = await partialQuery.get();
            
            partialSnapshot.docs.forEach(doc => {
              if (!results.find(r => r.documentId === doc.id)) {
                results.push({
                  documentId: doc.id,
                  matchField: searchField,
                  matchType: 'partial',
                  ...doc.data()
                });
              }
            });
          }
        } catch (error) {
          console.warn(`Search failed for field ${searchField}:`, error);
          // Continue with other fields
        }
        
        // Stop if we have enough results
        if (results.length >= 20) break;
      }
    }

    // Sort results: exact matches first, then by match field
    results.sort((a, b) => {
      if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
      if (a.matchType !== 'exact' && b.matchType === 'exact') return 1;
      return a.matchField.localeCompare(b.matchField);
    });

    // Sort results: exact matches first, then by match field
    results.sort((a, b) => {
      if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
      if (a.matchType !== 'exact' && b.matchType === 'exact') return 1;
      return a.matchField.localeCompare(b.matchField);
    });

    const endTime = Date.now();
    console.log(`Search completed in ${endTime - startTime}ms, found ${results.length} results`);

    return NextResponse.json({ 
      results: results.slice(0, 30), // Limit to 30 results
      totalFound: results.length,
      searchTime: endTime - startTime
    });

  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 