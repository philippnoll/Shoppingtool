"use strict";

const path = require("node:path");
const MiniSearch = require("minisearch");

function createUi5ModuleLoader() {
  const mModules = {};
  let sCurrentModule = "";

  global.window = { MiniSearch };
  global.sap = {
    ui: {
      define: function (aDependencies, fnFactory) {
        mModules[sCurrentModule] = fnFactory.apply(null, aDependencies.map(function (sDependency) {
          return mModules[sDependency];
        }));
      }
    }
  };

  function load(sModuleName, sRelativePath) {
    sCurrentModule = sModuleName;
    require(path.join(__dirname, "..", "..", sRelativePath));
    sCurrentModule = "";

    return mModules[sModuleName];
  }

  return {
    load: load,
    modules: mModules
  };
}

module.exports = {
  createUi5ModuleLoader
};
