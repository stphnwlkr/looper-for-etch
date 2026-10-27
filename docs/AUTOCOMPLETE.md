# Experimental loop field suggestions

Enable **HTML loop field suggestions** in Looper's Settings popover. It is off by default. The preference belongs to the current user and site and takes effect immediately, without saving or reloading the Etch document. Disabling it removes its listeners and dropdown, clears the sample cache and aborts pending requests.

The first version supports Etch's HTML editor. Typing `{article.` inside a loop aliased `article` shows keys from one matching sample. Object choices drill down, for example `{article.author.`. Arrays expose sample indices. Nested loop aliases and outer aliases remain available in their correct scopes; a nearer alias with the same name shadows an outer one. Saved block ancestry is combined with the currently edited HTML loop scope.

Objects offer native `keys()` and `values()` modifier expressions. These also appear as copy controls in Looper's sample tree. `keys()` returns object field names; `values()` returns corresponding values. These are standard Etch expressions, so inserted text continues working without Looper. See [Etch modifier documentation](https://docs.etchwp.com/dynamic-data/dynamic-data-modifiers/basic-modifiers#keys).

Use Arrow Up/Down to choose, Enter to insert, and Escape to dismiss. Selecting a suggestion creates a normal CodeMirror text transaction, preserving native undo behavior. Merely opening suggestions does not alter the document or query registry, save a document or publish changes.

## Data and limits

The feature reads buffered native Etch definitions, applies literal/default arguments and available outer sample values, and uses Looper's existing protected one-record preview endpoint. It honors Etch dynamic-data filters, including site-wide data cleanup. Missing required arguments are reported rather than replaced with an unfiltered query. JSON and nested-array data can be inspected when available locally. No PHP or JavaScript expressions are evaluated.

Suggestions reflect one record, not all possible database fields or a complete schema. Fields absent from the sample are omitted. Main Query requires archive/search context and is not sampled in this prototype. Rich text, attribute controls, and component property boundaries are not covered by this first HTML-editor version. Complex argument expressions that cannot be resolved safely produce an explanatory message.

Requests are debounced, timeout after 12 seconds, and use a bounded one-minute in-memory cache. Suggestions use bounded document/scope parsing, safe own-property path access, prototype-key exclusions and a limited result list. User data requires the existing list_users permission. No assets, requests or query hooks are added for ordinary visitors.

## Editor compatibility

Etch does not expose a public completion-provider registration. Loop definitions and block ancestry use its public API. The editor adapter feature-detects the CodeMirror view attached to its DOM, then uses native selection/dispatch methods. If that connection is unavailable, suggestions do not run. This integration requires testing after Etch editor changes.

A visible native CodeMirror or Etch Enhancer completion menu takes precedence. Looper does not patch either provider or change Enhancer's settings. The disable switch remains available if another extension behaves differently.

## Direct Etch actions

Copy/paste is the default. Name/key fields are hidden while direct actions are disabled, and their values are retained when toggling the preference. **Enable direct Etch actions** in the same Settings popover to reveal saving/updating, insertion and application controls. This preference changes only their availability; it does not save or publish a document. Accepted direct actions remain in the editor until Etch Save. A native-storage fallback requires explicit Save changes and reload confirmation and saves current editor changes first.

## Validation

The local Etch 1.7.1 test editor was exercised with Etch Enhancer active: article fields, nested metadata, keyboard insertion of `{article.meta.keys()}`, and category fields within a nested term loop. A separate draft demo page and named sample record keep testing separate from existing page content.

Automated tests cover scope closing/shadowing, argument defaults and outer values, unsafe paths/expressions, nested fields, native text transactions, caching, keyboard insertion, Escape dismissal, immediate disable, accessible menus, Settings behavior, and copy-first opt-in controls. WordPress preference tests cover authentication, boolean validation, persistence and readback. This does not establish complete accessibility conformance or cross-version compatibility.
