import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // CSP reports come as JSON
    const report = await request.json();
    
    // Extract the violation details
    const violation = report['csp-report'] || report;
    
    // Log critical violations
    if (violation) {
      const violationData = {
        documentUri: violation['document-uri'],
        violatedDirective: violation['violated-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        referrer: violation['referrer'],
        timestamp: new Date(),
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      };
      
      // Check if this is a critical violation
      const isCritical = 
        violationData.violatedDirective?.includes('script-src') ||
        violationData.blockedUri?.includes('eval') ||
        violationData.blockedUri?.includes('javascript:');
      
      if (isCritical) {
        logger.error('🚨 Critical CSP Violation:', violationData);
        
        // Store in database for analysis
        await db.collection('csp_violations').add({
          ...violationData,
          severity: 'critical'
        });
        
        // You could also send alerts here
        // await sendSecurityAlert('Critical CSP violation detected', violationData);
      } else {
        logger.warn('CSP Violation:', {
          directive: violationData.violatedDirective,
          blocked: violationData.blockedUri,
          source: violationData.sourceFile
        });
      }
    }
    
    // CSP reporting endpoints should return 204 No Content
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error('CSP Report Error:', error);
    // Still return 204 to prevent report flooding
    return new Response(null, { status: 204 });
  }
}

// CSP reports can be large, increase size limit
export const runtime = 'nodejs';
export const maxDuration = 10;