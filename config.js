// Public site config. Firebase web config is public by design (security comes from Firestore rules).
// Accounts stay OFF until a Firebase project exists; see README "Accounts".
window.REELFREE_CONFIG = {
  repo: 'chrisgfree-glitch/reelfree',
  accountsEnabled: false,
  firebase: null, // { apiKey, authDomain, projectId, appId }
};
