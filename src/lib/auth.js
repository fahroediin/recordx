import { getSupabase } from './supabase.js';

/**
 * Get the extension's redirect URL for OAuth
 * @returns {string} Redirect URL
 */
function getRedirectURL() {
  if (typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL) {
    return chrome.identity.getRedirectURL();
  }
  return window.location.origin;
}

/**
 * Sign in with Google using PKCE flow + chrome.identity.launchWebAuthFlow
 * @returns {Promise<{data: object, error: object}>}
 */
export async function signInWithGoogle() {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };

  const redirectUrl = getRedirectURL();

  // Get the OAuth URL from Supabase without redirecting
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true, // Crucial — returns URL instead of navigating
    },
  });

  if (error) {
    return {
      data: null,
      error: { message: error.message, status: error.status },
    };
  }

  // Open the OAuth URL in Chrome's managed auth popup
  return new Promise((resolve) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: data.url,
        interactive: true,
      },
      async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          resolve({
            data: null,
            error: { message: chrome.runtime.lastError?.message || 'Authentication cancelled' },
          });
          return;
        }

        // Extract the authorization code from the callback URL
        const url = new URL(responseUrl);
        const code = url.searchParams.get('code');

        if (code) {
          // Exchange the PKCE code for a session
          const { data: sessionData, error: sessionError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (sessionError) {
            resolve({
              data: null,
              error: { message: sessionError.message, status: sessionError.status },
            });
          } else {
            resolve({ data: sessionData, error: null });
          }
        } else {
          resolve({
            data: null,
            error: { message: 'No authorization code received' },
          });
        }
      }
    );
  });
}

/**
 * Sign out the current user
 * @returns {Promise<{error: object|null}>}
 */
export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase not configured') };

  const { error } = await supabase.auth.signOut();

  // Clear any cached session data from chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const items = await chrome.storage.local.get(null);
    const supabaseKeys = Object.keys(items).filter(
      (k) => k.startsWith('sb-') || k.startsWith('supabase')
    );
    if (supabaseKeys.length > 0) {
      await chrome.storage.local.remove(supabaseKeys);
    }
  }

  return { error };
}

/**
 * Get the current auth session
 * @returns {Promise<{data: {session: object|null}, error: object|null}>}
 */
export async function getSession() {
  const supabase = getSupabase();
  if (!supabase) return { data: { session: null }, error: null };

  return await supabase.auth.getSession();
}

/**
 * Get the current user
 * @returns {Promise<{data: {user: object|null}, error: object|null}>}
 */
export async function getUser() {
  const supabase = getSupabase();
  if (!supabase) return { data: { user: null }, error: null };

  return await supabase.auth.getUser();
}

/**
 * Listen for auth state changes
 * @param {Function} callback - Called with (event, session) on state change
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

/**
 * Check if the user is authenticated
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  const { data } = await getSession();
  return !!data?.session;
}
