# Security

Looper's administration interface and REST endpoints require `manage_options`. User discovery and previews additionally require `list_users`. WordPress's REST cookie authentication checks the `X-WP-Nonce` header. No public query execution endpoint is registered.

Preview accepts an allowlist of WordPress query keys, caps request size and nesting, limits returned samples, and uses WordPress query APIs. It never evaluates PHP. Queries saved through Etch use Etch's permissions and save mechanism. UI data is inserted as text, not HTML. Metadata-key discovery uses prepared identifiers and values, bounded results, and short-lived caching.

Only stable `vX.Y.Z` releases from this repository are considered for updates. Release and manifest versions must match. Package URLs must match this repository's exact versioned asset path. Metadata requests are size-limited HTTPS requests. Downloads must match the published SHA-256 checksum before WordPress installs them. No access token is needed on installed sites, and update checks do not send site content or the site URL.

The checksum detects a corrupted or mismatched download. It is not a signature independent of the GitHub maintainer account; GitHub account security remains part of the update trust boundary. Keep maintainer two-factor authentication and recovery methods secure.

Looper does not decide which personal fields should be published. Site administrators must choose appropriate dynamic data for visitor-facing templates. Preview data remains in the authenticated administrator interface.

Do not post sensitive security details in public issues. Use GitHub's private vulnerability reporting for this repository when available, or contact the maintainer through the GitHub profile to arrange a private report.
