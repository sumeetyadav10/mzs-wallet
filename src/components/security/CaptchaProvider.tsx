'use client';

import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { createContext, useContext, useCallback, ReactNode } from 'react';

interface CaptchaContextType {
  executeRecaptcha: (action: string) => Promise<string | null>;
  isLoaded: boolean;
}

const CaptchaContext = createContext<CaptchaContextType | undefined>(undefined);

interface CaptchaProviderProps {
  children: ReactNode;
}

function CaptchaProviderInner({ children }: CaptchaProviderProps) {
  const { executeRecaptcha: googleExecuteRecaptcha } = useGoogleReCaptcha();

  const executeRecaptcha = useCallback(async (action: string): Promise<string | null> => {
    if (!googleExecuteRecaptcha) {
      // reCAPTCHA not ready
      return null;
    }

    try {
      const token = await googleExecuteRecaptcha(action);
      return token;
    } catch (error) {
      // Error executing reCAPTCHA
      return null;
    }
  }, [googleExecuteRecaptcha]);

  const contextValue: CaptchaContextType = {
    executeRecaptcha,
    isLoaded: !!googleExecuteRecaptcha
  };

  return (
    <CaptchaContext.Provider value={contextValue}>
      {children}
    </CaptchaContext.Provider>
  );
}

export function CaptchaProvider({ children }: CaptchaProviderProps) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!siteKey) {
    // reCAPTCHA site key not configured
    
    // Provide a mock context for development
    const mockContext: CaptchaContextType = {
      executeRecaptcha: async () => 'development-mock-token',
      isLoaded: true
    };

    return (
      <CaptchaContext.Provider value={mockContext}>
        {children}
      </CaptchaContext.Provider>
    );
  }

  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={siteKey}
      scriptProps={{
        async: true,
        defer: true,
        appendTo: 'head',
      }}
      container={{
        element: 'captcha-container',
        parameters: {
          badge: 'bottomright',
          theme: 'light'
        }
      }}
    >
      <CaptchaProviderInner>{children}</CaptchaProviderInner>
      <div id="captcha-container" />
    </GoogleReCaptchaProvider>
  );
}

export function useCaptcha(): CaptchaContextType {
  const context = useContext(CaptchaContext);
  if (!context) {
    throw new Error('useCaptcha must be used within a CaptchaProvider');
  }
  return context;
}

// Higher-order component for forms that need CAPTCHA
export function withCaptcha<T extends object>(
  WrappedComponent: React.ComponentType<T>
): React.ComponentType<T> {
  const ComponentWithCaptcha = (props: T) => {
    return (
      <CaptchaProvider>
        <WrappedComponent {...props} />
      </CaptchaProvider>
    );
  };

  ComponentWithCaptcha.displayName = `withCaptcha(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return ComponentWithCaptcha;
}