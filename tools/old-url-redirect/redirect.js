/* Old address -> new address, keeping the page, query and hash:
   /project-dev-vat-non-prod-01/account.html?x=1  ->  /radha-e-commerce/account.html?x=1 */
(function () {
  var OLD = "/project-dev-vat-non-prod-01/";
  var NEW = "/radha-e-commerce/";
  var path = location.pathname;
  var rest = path.indexOf(OLD) === 0 ? path.slice(OLD.length) : "";
  var target = NEW + rest + location.search + location.hash;

  function go() { location.replace(target); }

  // Retire the app installed from the old address (this scope only), then go.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.filter(function (r) { return r.scope.indexOf(location.origin + OLD) === 0; })
        .map(function (r) { return r.unregister(); }));
    }).then(go, go);
    setTimeout(go, 1500); // never wait long
  } else {
    go();
  }
  var a = document.getElementById("newLink");
  if (a) a.href = target;
})();
