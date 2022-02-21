# parcel-transformer-svelte3-plus
Svelte3 Transformer for Parcel V2

# Installation

NPM

```
npm install -D parcel-transformer-svelte3-plus svelte3
```

Yarn
```
yarn add --dev parcel-transformer-svelte3-plus svelte3
```

Then add the transformer to the .parcelrc config

```json
{
  "extends": "@parcel/config-default",
  "transformers": {
    "*.svelte": ["parcel-transformer-svelte3-plus"]
  }
}
```

## [`svelte-preprocess`]

When you want to use [`svelte-preprocess`]
(for example when you want to use typescript in your svelte files),
you just need to add it as a dependency. It will be detected and **enabled by default**.

```
npm install -D svelte-preprocess
```
or 
```
yarn add --dev svelte-preprocess
```

[`svelte-preprocess`]: https://github.com/sveltejs/svelte-preprocess

## Configuration

You can use an optional `.svelterc` (JSON) or a `svelte.config.js` file to configure svelte. The available options are shown here:

```javascript
const sveltePreprocess = require('svelte-preprocess');

module.exports = {
  // options passed to svelte.compile
  // (https://svelte.dev/docs#compile-time-svelte-compile)
  compilerOptions: {},
 
  // preprocessors used with svelte.preprocess
  // (https://svelte.dev/docs#compile-time-svelte-preprocess)
  preprocess: [
    // sveltePreprocess is the default. It is automatically used, when the
    // dependency is resolvable, and when the `preprocess` property is not
    // defined in this configuration file, or when no configuration-file exists.
    sveltePreprocess(),
  ]
};
```

# License

[MIT License ](./LICENSE)

