/* Zotero bootstrap plugin entry (Zotero 8–9). The bundled code in content/defn.js defines
   `Defn` (see apps/zotero/src/index.ts). */

var Defn;

function install() {}

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise;
  Services.scriptloader.loadSubScript(rootURI + "content/defn.js");
  await Defn.startup({ id, version, rootURI });
}

function onMainWindowLoad({ window }) {
  Defn?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  Defn?.onMainWindowUnload(window);
}

async function shutdown() {
  await Defn?.shutdown();
  Defn = undefined;
}

function uninstall() {}
