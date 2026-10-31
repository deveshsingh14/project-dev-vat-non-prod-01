/* Kill switch for the app installed from the OLD address.
   Installed apps and open tabs keep checking /project-dev-vat-non-prod-01/service-worker.js
   for updates; this replacement activates immediately, unregisters itself (so
   the old app stops intercepting anything) and moves open windows to the new
   address. It deliberately does NOT clear caches: the new site lives on the
   same origin and uses the same cache names. */
var OLD = "/project-dev-vat-non-prod-01/";
var NEW = "/radha-e-commerce/";

self.addEventListener("install", function () { self.skipWaiting(); });

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    await self.registration.unregister();
    var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map(function (client) {
      var url = new URL(client.url);
      if (url.pathname.indexOf(OLD) !== 0) return null;
      var target = url.origin + NEW + url.pathname.slice(OLD.length) + url.search + url.hash;
      return client.navigate(target).catch(function () {});
    }));
  })());
});
