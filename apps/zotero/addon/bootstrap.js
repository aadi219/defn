/* Zotero bootstrap plugin entry (Zotero 8–9). The bundled code in content/deflink.js defines
   `DefLink` (see apps/zotero/src/index.ts). */

var DefLink;

function install() {}

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise;
  Services.scriptloader.loadSubScript(rootURI + "content/deflink.js");
  await DefLink.startup({ id, version, rootURI });
}

function onMainWindowLoad({ window }) {
  DefLink?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  DefLink?.onMainWindowUnload(window);
}

async function shutdown() {
  await DefLink?.shutdown();
  DefLink = undefined;
}

function uninstall() {}
