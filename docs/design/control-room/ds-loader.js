/* Maestro DS loader — used by specimen cards and UI kits.
   Prefers a compiled design-system bundle when one is present on window;
   otherwise fetches the raw component .jsx sources, strips module syntax,
   transpiles with Babel standalone, and exposes them on window.MaestroDS.
   Requires React, ReactDOM and Babel to be loaded first. */
(function () {
  function findCompiledBundle() {
    var skip = { MaestroDS: 1, React: 1, ReactDOM: 1, Babel: 1 };
    var names = Object.getOwnPropertyNames(window);
    for (var i = 0; i < names.length; i++) {
      var k = names[i];
      if (skip[k]) continue;
      try {
        var v = window[k];
        if (
          v &&
          typeof v === "object" &&
          typeof v.Button === "function" &&
          typeof v.Chip === "function" &&
          typeof v.TypeTag === "function"
        )
          return v;
      } catch (e) {
        /* ignore restricted props */
      }
    }
    return null;
  }

  async function loadDS(paths) {
    var ns = (window.MaestroDS = window.MaestroDS || {});
    var compiled = findCompiledBundle();
    if (compiled) {
      Object.assign(ns, compiled);
      return ns;
    }
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var src = await (await fetch(p)).text();
      var names = [];
      var re = /export\s+function\s+([A-Za-z0-9_]+)/g;
      var m;
      while ((m = re.exec(src))) names.push(m[1]);
      var body = src
        .replace(/^\s*import[^\n]*\n/gm, "")
        .replace(/export\s+function/g, "function");
      var code =
        body +
        "\n;Object.assign(window.MaestroDS, { " +
        names.join(", ") +
        " });";
      var js = Babel.transform(code, { presets: ["react"], filename: p }).code;
      (0, eval)(js);
    }
    return ns;
  }

  window.loadDS = loadDS;
})();
