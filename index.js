const {Transformer} = require('@parcel/plugin');
const {remapSourceLocation, relativeUrl} = require('@parcel/utils');
const {default: ThrowableDiagnostic} = require('@parcel/diagnostic');
const {default: SourceMap} = require('@parcel/source-map');
const {compile, preprocess, VERSION} = require('svelte/compiler');
const path = require('path');

const sveltePreprocess = (() => {
  try {
    return require('svelte-preprocess');
  } catch (e) {
    return null;
  }
})();

function mapSourceMapPath(mapSourceRoot, sourcePath) {
  if (sourcePath.startsWith("file://")) {
    sourcePath = sourcePath.substring(7);
  }
  if (path.isAbsolute(sourcePath)) {
    return sourcePath;
  } else {
    return path.join(mapSourceRoot, sourcePath);
  }
}

/**
 * @param {string} projectRoot
 * @param {string} filePath
 * @param {SourceMap} originalMap
 * @param {any} sourceMap
 * @return {?SourceMap}
 */
function extendSourceMap(options, filePath, originalMap, sourceMap) {
  if (!sourceMap) return originalMap;
  let mapSourceRoot = path.dirname(filePath);
  let map = new SourceMap(options.projectRoot);
  map.addVLQMap({
    ...sourceMap,
    sources: sourceMap.sources.map(s => mapSourceMapPath(mapSourceRoot, s)),
  });

  if (originalMap) {
    map.extends(originalMap);
  }
  return map;
}

module.exports = new Transformer({
  async loadConfig({config, options}) {
    const conf = await config.getConfig(
        ['.svelterc', 'svelte.config.js'],
        {packageKey: 'svelte'},
    );
    let contents = {};
    if (conf && typeof conf.contents === 'object') {
      contents = conf.contents;
      if (conf.filePath.endsWith('.js')) {
        config.invalidateOnStartup();
      }
    }

    let compilerOptions = contents.compilerOptions || contents.compiler || {};
    let preprocess = contents.preprocess;
    if (preprocess === undefined) {
      if (sveltePreprocess != null) {
        preprocess = [sveltePreprocess()];
      }
    }

    if (VERSION[0] === '3') {
      compilerOptions = {
        format: 'esm',
        ...compilerOptions,
      }
    }

    return {
      compilerOptions: {
        dev: options.mode !== 'production',
        css: false,
        ...compilerOptions,
      },
      preprocess,
      filePath: conf && conf.filePath,
    };
  },

  async transform({asset, config, options, logger}) {
    // Retrieve the asset's source code and source map.
    let code = await asset.getCode();
    const originalMap = await asset.getMap();
    const filename = relativeUrl(options.projectRoot, asset.filePath);
    const compilerOptions = {
      filename,
      ...config.compilerOptions || {},
    };
    // similar fix like in https://github.com/sveltejs/language-tools/pull/1104
    const isExternal = (filename.includes('/node_modules/') || filename.includes('\\node_modules\\')) &&
      // Sapper convention: Put stuff inside node_modules below src
      !(filename.includes('/src/node_modules/') || filename.includes('\\src\\node_modules\\'));

    const convertLoc = (loc) => {
      let location = {
        filePath: asset.filePath,
        start: {
          line: loc.start.line + Number(asset.meta.startLine || 1) - 1,
          column: loc.start.column + 1,
        },
        end: {
          line: loc.end.line + Number(asset.meta.startLine || 1) - 1,
          column: loc.end.column + 1,
        },
      };
      if (originalMap) {
        location = remapSourceLocation(location, originalMap);
      }
      return location;
    };

    const convertDiagnostic = (diagnostic) => {
      let message = diagnostic.message || 'Unknown error';
      if (diagnostic.code) {
        message = `${message} (${diagnostic.code})`;
      }
      /** @type {import('@parcel/diagnostic').Diagnostic} */
      const res = {
        message,
      };
      if (diagnostic.frame) {
        res.hints = [diagnostic.frame];
      }
      if (diagnostic.start != null && diagnostic.end != null) {
        const {start, end} = convertLoc(diagnostic);
        res.codeFrames = [
          {
            filePath: asset.filePath,
            code,
            language: 'svelte',
            codeHighlights: [{
              start,
              end,
            }],
          },
        ];
      }

      if (diagnostic.name) {
        res.name = diagnostic.name;
      }
      if (diagnostic.stack) {
        res.stack = diagnostic.stack;
      }
      if (diagnostic.documentation_url) {
        res.documentationURL = diagnostic.documentation_url;
      }

      return res;
    };

    const convertError = (error) => {
      const diagnostic = convertDiagnostic(error);
      const res = new ThrowableDiagnostic({
        diagnostic,
      });
      // set error fields for displaying code-frame
      if (diagnostic.codeFrames && diagnostic.codeFrames.length>0) {
        const codeFrame = diagnostic.codeFrames[0];
        res.source = codeFrame.code;
        res.filePath = codeFrame.filePath;
        res.filename = codeFrame.filePath;
        if (codeFrame.codeHighlights && codeFrame.codeHighlights.length>0) {
          const codeHighlight = codeFrame.codeHighlights[0];
          res.start = codeHighlight.start;
          res.loc = codeHighlight.start;
          res.end = codeHighlight.end;
        }
      }
      return res;
    };

    if (config.preprocess) {
      let preprocessed;
      try {
        preprocessed = await preprocess(
            code,
            config.preprocess,
            compilerOptions,
        );
      } catch (error) {
        throw convertError(error);
      }
      if (preprocessed.map) compilerOptions.sourcemap = preprocessed.map;
      if (preprocessed.dependencies) {
        for (const dependency of preprocessed.dependencies) {
          asset.invalidateOnFileChange(dependency);
        }
      }
      code = preprocessed.code;
    }

    let compiled;
    try {
      compiled = compile(code, compilerOptions);
    } catch (error) {
      throw convertError(error);
    }

    if (compiled.warnings && !isExternal) {
      compiled.warnings.forEach((warning) => {
        if (compilerOptions.css && warning.code === 'css-unused-selector') return;
        logger.warn(convertDiagnostic(warning));
      });
    }

    const results = [
      {
        type: 'js',
        content: compiled.js.code,
        uniqueKey: `${asset.id}-js`,
        map: extendSourceMap(
            options,
            asset.filePath,
            originalMap,
            compiled.js.map,
        ),
      }
    ];
    if (compiled.css && compiled.css.code) {
      results.push({
        type: 'css',
        content: compiled.css.code,
        uniqueKey: `${asset.id}-css`,
        map: extendSourceMap(
            options,
            asset.filePath,
            originalMap,
            compiled.css.map,
        ),
      });
    }
    return results;
  },
});
