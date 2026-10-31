// Links back to the storefront (GitHub Pages), built from FRONTEND_URL.
//
//   appLink("account.html")                    -> absolute when FRONTEND_URL is set,
//                                                 otherwise left relative
//   appLink("reset-password.html?token=..", { absolute: true })
//                                              -> always absolute (emails can't use
//                                                 relative links); falls back to the
//                                                 live site if FRONTEND_URL is unset
const DEFAULT_SITE_URL = "https://deveshsingh14.github.io/radha-e-commerce/";

function withSlash(u) { return u.endsWith("/") ? u : u + "/"; }

function appLink(path, { absolute = false } = {}) {
  const configured = process.env.FRONTEND_URL;
  if (configured) {
    try { return new URL(path, withSlash(configured)).href; } catch (e) { /* malformed: fall through */ }
  }
  return absolute ? new URL(path, DEFAULT_SITE_URL).href : path;
}

module.exports = { appLink, DEFAULT_SITE_URL };
