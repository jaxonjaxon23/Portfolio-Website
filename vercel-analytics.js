// Vercel Web Analytics integration for vanilla React (UMD) setup
// This script provides a lightweight integration that works with React loaded from CDN

(function () {
  'use strict';

  // Initialize the analytics queue
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  // Analytics component - should be added to your React app
  window.VercelAnalytics = function VercelAnalyticsComponent(props) {
    const { beforeSend, debug, mode = 'auto' } = props || {};
    
    React.useEffect(() => {
      // Only load in production (when deployed to Vercel)
      if (typeof window === 'undefined') return;
      
      // Check if we're in production environment
      const isDev = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname.includes('192.168.');
      
      if (isDev && !debug) {
        if (debug) console.log('[Vercel Analytics] Skipping in development mode');
        return;
      }

      // Initialize analytics
      const script = document.createElement('script');
      script.defer = true;
      script.src = '/_vercel/insights/script.js';
      
      script.onerror = () => {
        if (debug) console.warn('[Vercel Analytics] Failed to load analytics script');
      };
      
      script.onload = () => {
        if (debug) console.log('[Vercel Analytics] Analytics script loaded');
        
        // Process queued calls
        if (window.vaq && window.va) {
          window.vaq.forEach(args => {
            if (typeof window.va === 'function') {
              window.va.apply(null, args);
            }
          });
          window.vaq = [];
        }
      };

      // Only inject if not already present
      if (!document.querySelector('script[src="/_vercel/insights/script.js"]')) {
        document.head.appendChild(script);
      }

      // Auto-track page views when in auto mode
      if (mode === 'auto') {
        // Track initial page load
        window.va('pageview');
        
        // Track hash changes for single-page app navigation
        const handleHashChange = () => {
          window.va('pageview', {
            path: window.location.pathname + window.location.hash
          });
        };
        
        window.addEventListener('hashchange', handleHashChange);
        
        return () => {
          window.removeEventListener('hashchange', handleHashChange);
        };
      }
    }, [beforeSend, debug, mode]);

    return null;
  };

  // Track function for custom events
  window.vaTrack = function track(name, properties) {
    if (!name) {
      console.error('[Vercel Analytics] Event name is required');
      return;
    }
    
    // Validate properties
    if (properties && typeof properties === 'object') {
      const validProps = {};
      for (const key in properties) {
        const value = properties[key];
        const type = typeof value;
        if (type === 'string' || type === 'number' || type === 'boolean' || value === null) {
          validProps[key] = value;
        } else {
          console.warn(`[Vercel Analytics] Property "${key}" has invalid type "${type}" and will be ignored`);
        }
      }
      window.va('event', { name, data: validProps });
    } else {
      window.va('event', { name });
    }
  };

  if (typeof window !== 'undefined' && window.console && window.console.log) {
    console.log('[Vercel Analytics] Integration loaded');
  }
})();
