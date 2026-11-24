// location.hostname (not .host): HTTPS is always served on the standard 443, regardless of
// which HTTP port (80 or the 8080 fallback) this onboarding page itself was reached through.
document.getElementById('continueLink').href='https://'+location.hostname+'/';
