'use strict';

var isDev = process.env.npm_lifecycle_event === 'dev';
var presets = [
  ["env", Object.assign({"loose": true}, isDev ? {"targets": {"node": "current"}} : {})]
];

module.exports = {
  "presets": presets,
  "plugins": [
    "lodash",
    "transform-runtime",
    "add-module-exports",
    "transform-object-rest-spread",
    "transform-async-to-generator",
    "transform-es2015-modules-commonjs"
  ]
};