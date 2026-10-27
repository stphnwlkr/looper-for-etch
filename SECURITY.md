# Security

Looper's administration interface and REST endpoints require `manage_options`. User discovery and previews additionally require `list_users`. WordPress's REST cookie authentication checks the `X-WP-Nonce` header. No public query execution endpoint is registered.

Preview accepts an allowlist of WordPress query keys, caps request size and nesting, limits returned samples, and uses WordPress query APIs. It never evaluates PHP. Native query saves use a nonce-authenticated, manage_options-protected endpoint with the same bounded argument allowlist. It preserves unknown definition attributes, checks the expected original definition, and uses an atomic comparison before writing Etch's registry. Migration runs only in an authorized administrator/editor context, backs up before conversion, and leaves invalid legacy definitions untouched with a warning. No runtime query hooks or decoder are installed. UI data is inserted as text, not HTML. Metadata-key discovery uses prepared identifiers and values, bounded results, and short-lived caching.

Only stable `vX.Y.Z` releases from this repository are considered for updates. Release and manifest versions must match. Package URLs must match this repository's exact versioned asset path. Metadata requests are size-limited HTTPS requests. Downloads must match the published SHA-256 checksum before WordPress installs them. No access token is needed on installed sites, and update checks do not send site content or the site URL.

The checksum detects a corrupted or mismatched download. It is not a signature independent of the GitHub maintainer account; GitHub account security remains part of the update trust boundary. Keep maintainer two-factor authentication and recovery methods secure.

Looper does not decide which personal fields should be published. Site administrators must choose appropriate dynamic data for visitor-facing templates. Preview data remains in the authenticated administrator interface.

Do not post sensitive security details in public issues. Use GitHub's private vulnerability reporting for this repository when available, or contact the maintainer through the GitHub profile to arrange a private report.

Optional autocomplete uses the existing protected, bounded sample endpoint and never evaluates typed PHP/JavaScript. Its path reader excludes prototype properties and its editor insertions use native transactions. Builder preferences accept only known boolean flags and affect the current user's site-scoped meta keys. Direct actions are an opt-in UI preference; administrator authorization remains the server-side security boundary.
