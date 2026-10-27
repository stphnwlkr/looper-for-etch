<?php
/** Editor-only native query storage and one-time compatibility migration. */
defined( 'ABSPATH' ) || exit;

/** Decode old versions only when converting stored definitions, never at render time. */
function lfe_native_args( $args, $type ) {
    $encoded = null;
    if ( 'wp-terms' === $type && is_string( $args['taxonomy'] ?? null ) && str_starts_with( $args['taxonomy'], '_looper_etch_v2:' ) ) {
        $encoded = explode( '|', substr( $args['taxonomy'], 16 ) )[0];
    }
    foreach ( (array) ( $args['meta_query'] ?? array() ) as $clause ) {
        if ( is_array( $clause ) && '_looper_etch_v2' === ( $clause['key'] ?? '' ) ) {
            if ( null !== $encoded ) { return new WP_Error( 'invalid_legacy_query', 'More than one compatibility payload was found.' ); }
            $encoded = $clause['value'] ?? false;
        }
    }
    if ( null !== $encoded ) {
        if ( ! is_string( $encoded ) || strlen( $encoded ) > 110000 || ! preg_match( '/^[A-Za-z0-9_-]+$/D', $encoded ) ) { return new WP_Error( 'invalid_legacy_query', 'The compatibility payload is invalid.' ); }
        $decoded = json_decode( base64_decode( strtr( $encoded, '-_', '+/' ), true ) ?: '', true );
        if ( ! lfe_valid_query( $decoded, $type ) ) { return new WP_Error( 'invalid_legacy_query', 'The compatibility payload cannot be converted safely.' ); }
        return $decoded;
    }
    $remaining = $args['meta_query'] ?? array(); $found = false;
    foreach ( $remaining as $key => $clause ) {
        if ( ! is_array( $clause ) || ! is_string( $clause['key'] ?? null ) || ! str_starts_with( $clause['key'], '_looper_etch_' ) ) { continue; }
        $option = substr( $clause['key'], strlen( '_looper_etch_v1_' ) ); $value = $clause['value'] ?? null;
        if ( 'wp-query' !== $type || 'attachment' !== ( $args['post_type'] ?? '' ) || ! str_starts_with( $clause['key'], '_looper_etch_v1_' ) ) { return new WP_Error( 'invalid_legacy_query', 'An unrecognized compatibility setting was found.' ); }
        if ( 'post_mime_type' === $option && is_string( $value ) && ( str_starts_with( $value, '$' ) || preg_match( '~^[a-z0-9.+_-]+(?:/[a-z0-9.+_-]+)?$~iD', $value ) ) ) {
            $args[ $option ] = $value;
        } elseif ( 'post_parent' === $option && ( is_int( $value ) && $value >= 0 || is_string( $value ) && preg_match( '/^(?:\d+|\$[a-zA-Z_]\w*(?:\s*\?\?\s*\d+)?)$/D', $value ) ) ) {
            $args[ $option ] = $value;
        } elseif ( 'orderby' === $option && 'collection_order' === $value ) {
            $args[ $option ] = $value;
        } else { return new WP_Error( 'invalid_legacy_query', 'An invalid gallery compatibility setting was found.' ); }
        unset( $remaining[ $key ] ); $found = true;
    }
    if ( $found ) {
        // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- Migration transforms saved data; this does not execute a meta query.
        if ( array_diff( array_keys( $remaining ), array( 'relation' ) ) ) { $args['meta_query'] = $remaining; } else { unset( $args['meta_query'] ); }
    }
    return $args;
}

/** Compare-and-swap prevents another editor's query changes being overwritten. */
function lfe_write_native_registry( $before, $after ) {
    global $wpdb;
    if ( $before === $after ) { return true; }
    // Exact option bytes are used for the concurrency check, not interpolated SQL.
    $updated = $wpdb->query( $wpdb->prepare( "UPDATE %i SET option_value = %s WHERE option_name = %s AND BINARY option_value = %s", $wpdb->options, maybe_serialize( $after ), 'etch_loops', maybe_serialize( $before ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Atomic compare-and-swap has no update_option equivalent.
    if ( 1 !== $updated ) {
        if ( false === get_option( 'etch_loops', false ) && array() === $before && add_option( 'etch_loops', $after, '', false ) ) { return true; }
        return new WP_Error( 'query_conflict', 'The saved queries changed in another request. Refresh the editor and try again.', array( 'status' => 409 ) );
    }
    wp_cache_delete( 'etch_loops', 'options' ); wp_cache_delete( 'alloptions', 'options' );
    if ( get_option( 'etch_loops' ) !== $after ) { return new WP_Error( 'query_readback', 'The native query could not be verified. Refresh the editor before continuing.', array( 'status' => 500 ) ); }
    return true;
}

function lfe_migrate_native_queries() {
    if ( ! current_user_can( 'manage_options' ) ) { return new WP_Error( 'forbidden', 'Only a site administrator can migrate queries.', array( 'status' => 403 ) ); }
    $before = get_option( 'etch_loops', array() );
    if ( ! is_array( $before ) ) { return new WP_Error( 'invalid_registry', 'Etch’s saved query list is invalid. No queries were changed.', array( 'status' => 400 ) ); }
    $after = $before; $converted = array(); $errors = array();
    foreach ( $after as $id => &$loop ) {
        $type = $loop['config']['type'] ?? '';
        if ( ! in_array( $type, array( 'wp-query', 'main-query', 'wp-terms', 'wp-users' ), true ) || ! is_array( $loop['config']['args'] ?? null ) ) { continue; }
        $native = lfe_native_args( $loop['config']['args'], $type );
        if ( is_wp_error( $native ) ) { $errors[] = array( 'id' => (string) $id, 'message' => $native->get_error_message() ); continue; }
        if ( $native !== $loop['config']['args'] ) { $loop['config']['args'] = $native; $converted[] = (string) $id; }
    }
    unset( $loop );
    if ( $converted ) {
        // Keep the first complete pre-migration snapshot per site; never autoload it.
        if ( false === get_option( 'lfe_native_query_backup_v1', false ) && ! add_option( 'lfe_native_query_backup_v1', array( 'created' => time(), 'loops' => $before ), '', false ) ) { return new WP_Error( 'migration_backup', 'Could not back up the saved queries. No migration was applied.', array( 'status' => 500 ) ); }
        $written = lfe_write_native_registry( $before, $after ); if ( is_wp_error( $written ) ) { return $written; }
    }
    return array( 'converted' => $converted, 'errors' => $errors );
}

// Register migration only for admin/editor requests, before Etch reads the registry.
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Context check only; capability gates migration.
if ( is_admin() || isset( $_GET['etch'] ) && 'magic' === $_GET['etch'] ) {
    add_action( 'init', function () { if ( current_user_can( 'manage_options' ) ) { lfe_migrate_native_queries(); } }, 0 );
}

/** JSON reorders numeric object keys; query group relation ordering is immaterial. */
function lfe_native_equal( $left, $right ) {
    $canonical = function ( $value, $parent = '' ) use ( &$canonical ) {
        if ( ! is_array( $value ) ) { return $value; }
        if ( ! array_is_list( $value ) && 'orderby' !== $parent ) { ksort( $value, SORT_STRING ); }
        foreach ( $value as $key => $child ) { $value[ $key ] = $canonical( $child, (string) $key ); }
        return $value;
    };
    return $canonical( $left ) === $canonical( $right );
}

function lfe_save_native_query( $request ) {
    $migration = lfe_migrate_native_queries(); if ( is_wp_error( $migration ) ) { return $migration; }
    if ( strlen( $request->get_body() ) > 300000 ) { return new WP_Error( 'query_too_large', 'The query save request is too large.', array( 'status' => 413 ) ); }
    $input = $request->get_json_params(); $definition = $input['definition'] ?? null; $id = $input['id'] ?? null;
    if ( ! is_array( $definition ) || ! is_string( $id ) || ! preg_match( '/^[a-zA-Z0-9_-]{1,100}$/D', $id ) || ! is_string( $definition['key'] ?? null ) || ! preg_match( '/^[a-zA-Z][a-zA-Z0-9_-]*$/D', $definition['key'] ) || ! is_string( $definition['name'] ?? null ) || ! trim( $definition['name'] ) || strlen( $definition['name'] ) > 300 || strlen( $definition['key'] ) > 200 || ! is_bool( $definition['global'] ?? null ) || ! in_array( $definition['config']['type'] ?? '', array( 'wp-query', 'main-query', 'wp-terms', 'wp-users' ), true ) || ! lfe_valid_query( $definition['config']['args'] ?? null, $definition['config']['type'] ) ) { return new WP_Error( 'invalid_query', 'Enter a valid native WordPress query, name, and key.', array( 'status' => 400 ) ); }
    if ( 'wp-users' === $definition['config']['type'] && ! current_user_can( 'list_users' ) ) { return new WP_Error( 'user_permission', 'Saving user queries requires permission to list users.', array( 'status' => 403 ) ); }
    $native = lfe_native_args( $definition['config']['args'], $definition['config']['type'] );
    if ( is_wp_error( $native ) || $native !== $definition['config']['args'] ) { return new WP_Error( 'encoded_query', 'Save native query arguments rather than compatibility data.', array( 'status' => 400 ) ); }
    $before = get_option( 'etch_loops', array() ); $original = $before[ $id ] ?? null;
    if ( ! array_key_exists( 'expected', $input ) || ! lfe_native_equal( $original, $input['expected'] ) ) { return new WP_Error( 'query_conflict', 'This query changed since it was loaded. Refresh and load it again before saving.', array( 'status' => 409 ) ); }
    foreach ( $before as $other_id => $loop ) { if ( (string) $other_id !== $id && ( $loop['key'] ?? '' ) === $definition['key'] ) { return new WP_Error( 'duplicate_key', 'Another query already uses this key. Refresh the editor and choose another key.', array( 'status' => 409 ) ); } }
    // Keep fields unknown to Looper, including future Etch configuration attributes.
    $definition = array_replace( $original ?? array(), array_intersect_key( $definition, array_flip( array( 'key', 'name', 'global', 'config' ) ) ) );
    $definition['config'] = array_replace( $original['config'] ?? array(), $definition['config'] );
    $after = $before; $after[ $id ] = $definition;
    $written = lfe_write_native_registry( $before, $after ); if ( is_wp_error( $written ) ) { return $written; }
    $response = rest_ensure_response( array( 'id' => $id, 'definition' => $definition ) ); $response->header( 'Cache-Control', 'no-store, private' ); return $response;
}
add_action( 'rest_api_init', function () {
    register_rest_route( 'looper-for-etch/v1', '/native-query', array( 'methods' => 'POST', 'callback' => 'lfe_save_native_query', 'permission_callback' => 'lfe_permission' ) );
} );
