import { Resend } from 'resend';

// Resend API key from environment variable (required)
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is not set');
}

const resend = new Resend(RESEND_API_KEY);

export interface OTPEmailData {
  email: string;
  otp: string;
  amount: string;
  currency: string;
  toAddress: string;
}

export interface AdminMFAEmailData {
  email: string;
  code: string;
}

export class EmailService {
  static async sendOTPEmail(data: OTPEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { email, otp, amount, currency, toAddress } = data;

      console.log('[Email Service] Sending OTP to:', email);
      const result = await resend.emails.send({
        from: 'MZS Wallet <noreply@mzswallet.com>',
        to: [email],
        subject: 'MZS Wallet - Withdrawal Verification Required',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: #1aDb749F; padding: 30px; text-align: center;">
              <h1 style="color: #000000; margin: 0; font-size: 28px; font-weight: bold;">MZS Wallet</h1>
              <p style="color: #333333; margin: 10px 0 0 0; font-weight: 500;">Secure Withdrawal Verification</p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #000000; margin: 0 0 20px 0; font-weight: bold;">Withdrawal Verification Required</h2>
              
              <div style="background: #f0f9ff; border-left: 4px solid #1aDb749F; padding: 20px; margin: 20px 0;">
                <p style="margin: 0; color: #000000; font-weight: bold;"><strong>Amount:</strong> ${amount} ${currency}</p>
                <p style="margin: 10px 0 0 0; color: #000000; font-weight: bold;"><strong>To Address:</strong></p>
                <code style="background: #e5e7eb; padding: 8px; border-radius: 4px; font-size: 12px; color: #000000; word-break: break-all; font-weight: bold;">${toAddress}</code>
              </div>
              
              <p style="color: #000000; margin: 20px 0; font-weight: bold;">Your verification code is:</p>
              
              <div style="background: #1aDb749F; border: 3px solid #16a085; padding: 30px; text-align: center; margin: 30px 0; border-radius: 8px;">
                <span style="font-size: 36px; font-weight: bold; color: #000000; letter-spacing: 8px;">${otp}</span>
              </div>
              
              <div style="background: #fee2e2; border: 2px solid #ef4444; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; color: #dc2626; font-weight: bold;">IMPORTANT SECURITY NOTICE</p>
                <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #dc2626; font-weight: bold;">
                  <li>This code expires in <strong>5 minutes</strong></li>
                  <li>Never share this code with anyone</li>
                  <li>MZS support will never ask for this code</li>
                </ul>
              </div>
              
              <p style="color: #000000; margin: 20px 0; font-weight: bold;">If you didn't initiate this withdrawal, please:</p>
              <ol style="color: #000000; margin: 0; padding-left: 20px; font-weight: bold;">
                <li>Do not enter this verification code</li>
                <li>Log into your account and change your password immediately</li>
                <li>Contact our support team</li>
              </ol>
            </div>
            
            <div style="background: #f9fafb; padding: 20px 30px; border-top: 2px solid #1aDb749F;">
              <p style="margin: 0; color: #374151; font-size: 12px; text-align: center; font-weight: bold;">
                This email was sent from MZS Wallet security system.<br>
                Time: ${new Date().toLocaleString()} UTC
              </p>
            </div>
          </div>
        `
      });

      if (result.error) {
        // Email sending failed
        console.error('[Email Service] Resend error:', result.error);
        return { success: false, error: result.error.message };
      }

      console.log('[Email Service] Email sent successfully to:', email, 'MessageId:', result.data?.id);
      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      // Detailed error logging for troubleshooting
      console.error('[Email Service] Exception:', error);
      if (error.name === 'application_error') {
        // Email sending failed - detailed error

        // Check for network/DNS issues
        if (error.message?.includes('fetch failed') || error.message?.includes('Unable to fetch data')) {
          return {
            success: false,
            error: 'Email service temporarily unavailable. Please try again in a few moments.'
          };
        }
      }

      // Email service error
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async sendWithdrawalAlert(email: string, amount: string, currency: string, toAddress: string): Promise<void> {
    try {
      await resend.emails.send({
        from: 'MZS Wallet <noreply@mzswallet.com>',
        to: [email],
        subject: 'MZS Wallet - Withdrawal Completed',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: #1aDb749F; padding: 30px; text-align: center;">
              <h1 style="color: #000000; margin: 0; font-size: 28px; font-weight: bold;">MZS Wallet</h1>
              <p style="color: #333333; margin: 10px 0 0 0; font-weight: 500;">Transaction Completed</p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #059669; margin: 0 0 20px 0; font-weight: bold;">Withdrawal Successful</h2>
              <p style="color: #000000; font-weight: bold;">Your withdrawal has been processed:</p>
              
              <div style="background: #f0f9ff; border-left: 4px solid #1aDb749F; padding: 20px; margin: 20px 0;">
                <ul style="margin: 0; padding-left: 20px; color: #000000; font-weight: bold;">
                  <li><strong>Amount:</strong> ${amount} ${currency}</li>
                  <li><strong>To:</strong> ${toAddress}</li>
                  <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
                </ul>
              </div>
            </div>
            
            <div style="background: #f9fafb; padding: 20px 30px; border-top: 2px solid #1aDb749F;">
              <p style="margin: 0; color: #374151; font-size: 12px; text-align: center; font-weight: bold;">
                This is an automated notification from MZS Wallet.
              </p>
            </div>
          </div>
        `
      });
    } catch (error) {
      // Failed to send withdrawal alert
    }
  }

  static async sendAdminMFAEmail(data: AdminMFAEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { email, code } = data;
      
      const result = await resend.emails.send({
        from: 'MZS Wallet <noreply@mzswallet.com>',
        to: [email],
        subject: 'MZS Admin Panel - 인증 코드',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #1aDb749F 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: #000000; margin: 0; font-size: 28px; font-weight: bold;">🔒 MZS Admin Panel</h1>
              <p style="color: #000000; margin: 10px 0 0 0; font-weight: 600;">관리자 인증 요청</p>
            </div>
            
            <div style="padding: 40px 30px;">
              <h2 style="color: #059669; margin: 0 0 20px 0; font-weight: bold;">Multi-Factor Authentication</h2>
              <p style="color: #000000; margin: 20px 0; font-size: 16px; font-weight: 500;">
                관리자 패널 접속을 위해 아래 6자리 인증 코드를 입력해주세요:
              </p>
              
              <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 3px solid #1aDb749F; padding: 30px; text-align: center; margin: 30px 0; border-radius: 12px; box-shadow: 0 4px 12px rgba(26, 219, 116, 0.2);">
                <span style="font-size: 42px; font-weight: 900; color: #059669; letter-spacing: 12px; font-family: 'Courier New', monospace;">${code}</span>
              </div>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #92400e; font-weight: 600;">
                  ⚠️ 보안 알림: 이 코드는 5분 후 만료되며, 본인이 요청하지 않은 경우 무시하세요.
                </p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  생성 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
              </div>
            </div>
            
            <div style="background: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                © 2024 MZS Wallet Admin System. 이 이메일은 관리자 인증을 위해 자동으로 전송되었습니다.
              </p>
            </div>
          </div>
        `
      });

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      if (error.name === 'application_error') {
        if (error.message?.includes('fetch failed') || error.message?.includes('Unable to fetch data')) {
          return { 
            success: false, 
            error: 'Email service temporarily unavailable. Please try again in a few moments.' 
          };
        }
      }
      
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}