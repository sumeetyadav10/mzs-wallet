import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await verifyAdminSession(req);
    if (!authResult.success) {
      logger.warn('🚨 Unauthorized admin roam-airdrop access attempt', {
        error: authResult.error,
        ip: req.headers.get('x-forwarded-for') || 'unknown'
      });
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }

    // Read airdrop data from files
    const airdropDir = path.join(process.cwd(), 'ROAM_AIRDROP');
    
    // Check for actual results first, then mapping file
    let airdropData: any = null;
    
    // Try to read the actual results file first
    const resultsPath = path.join(airdropDir, 'airdrop_results.json');
    if (fs.existsSync(resultsPath)) {
      const resultsContent = fs.readFileSync(resultsPath, 'utf8');
      const results = JSON.parse(resultsContent);
      
      // Combine the first entry (which was skipped) with the results
      const allRecipients = [];
      
      // Add the first entry if it exists
      if (results.summary.firstEntryDetails) {
        allRecipients.push({
          polygonAddress: results.summary.firstEntryDetails.polygonAddress,
          solanaAddress: results.summary.firstEntryDetails.solanaAddress,
          amount: results.summary.firstEntryDetails.amount,
          email: results.summary.firstEntryDetails.email,
          signature: 'Already sent' // This was sent separately
        });
      }
      
      // Add all other recipients
      allRecipients.push(...results.results.map((r: any) => ({
        polygonAddress: r.polygonAddress,
        solanaAddress: r.solanaAddress,
        amount: r.amount,
        email: r.email,
        signature: r.signature || null
      })));
      
      airdropData = {
        recipients: allRecipients
      };
    } else {
      // Fallback to mapping file
      const mappingPath = path.join(airdropDir, 'solana_addresses_mapping.json');
      if (fs.existsSync(mappingPath)) {
        const mappingContent = fs.readFileSync(mappingPath, 'utf8');
        const mapping = JSON.parse(mappingContent);
        
        // For mapping file, we don't have transaction signatures
        airdropData = {
          recipients: mapping.results.map((r: any) => ({
            polygonAddress: r.polygonAddress,
            solanaAddress: r.solanaAddress,
            amount: r.amount,
            email: r.email,
            signature: null
          }))
        };
      }
    }

    if (!airdropData) {
      return NextResponse.json({ error: 'No airdrop data found' }, { status: 404 });
    }

    return NextResponse.json(airdropData);

  } catch (error: any) {
    // Error fetching airdrop data
    return NextResponse.json({ 
      error: 'Failed to fetch airdrop data', 
      message: error.message 
    }, { status: 500 });
  }
}