<?php
/**
 * Stable public GitHub releases through the WordPress plugin updater.
 *
 * @package LooperForEtch
 */
defined( 'ABSPATH' ) || exit;

function lfe_release_repository() { return 'stphnwlkr/looper-for-etch'; }
function lfe_update_uri() { return 'https://github.com/' . lfe_release_repository(); }

/** Validate untrusted release metadata before exposing a package to WordPress. */
function lfe_validate_release( $release, $manifest ) {
    if ( ! is_array( $release ) || ! empty( $release['draft'] ) || ! empty( $release['prerelease'] ) || ! is_array( $manifest ) ) { return false; }
    $tag = $release['tag_name'] ?? '';
    if ( ! is_string( $tag ) || ! preg_match( '/^v(\d+\.\d+\.\d+)$/D', $tag, $matches ) ) { return false; }
    $base = lfe_update_uri() . '/releases/download/' . $tag . '/';
    if ( ( $manifest['version'] ?? null ) !== $matches[1] || ( $manifest['package'] ?? null ) !== $base . 'looper-for-etch.zip' ) { return false; }
    foreach ( array( 'requires', 'requires_php' ) as $key ) {
        if ( ! is_string( $manifest[ $key ] ?? null ) || ! preg_match( '/^\d+\.\d+(?:\.\d+)?$/D', $manifest[ $key ] ) ) { return false; }
    }
    if ( ! is_string( $manifest['sha256'] ?? null ) || ! preg_match( '/^[a-f0-9]{64}$/D', $manifest['sha256'] ) ) { return false; }
    $manifest['url'] = lfe_update_uri() . '/releases/tag/' . $tag;
    $manifest['changelog'] = is_string( $release['body'] ?? null ) ? $release['body'] : '';
    return $manifest;
}

function lfe_release_json( $url ) {
    $response = wp_safe_remote_get( $url, array( 'timeout' => 10, 'redirection' => 3, 'limit_response_size' => 262144, 'headers' => array( 'Accept' => 'application/json', 'User-Agent' => 'Looper-for-Etch/' . lfe_version() ) ) );
    if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) { return false; }
    return json_decode( wp_remote_retrieve_body( $response ), true );
}

function lfe_latest_release() {
    $cached = get_site_transient( 'lfe_github_release' );
    if ( false !== $cached ) { return is_array( $cached ) && isset( $cached['version'] ) ? $cached : false; }
    $release = lfe_release_json( 'https://api.github.com/repos/' . lfe_release_repository() . '/releases/latest' );
    $result = false;
    if ( is_array( $release ) && is_string( $release['tag_name'] ?? null ) && preg_match( '/^v\d+\.\d+\.\d+$/D', $release['tag_name'] ) && empty( $release['draft'] ) && empty( $release['prerelease'] ) ) {
        $manifest_url = lfe_update_uri() . '/releases/download/' . $release['tag_name'] . '/looper-for-etch-update.json';
        $result = lfe_validate_release( $release, lfe_release_json( $manifest_url ) );
    }
    set_site_transient( 'lfe_github_release', $result ?: array( 'unavailable' => true ), $result ? HOUR_IN_SECONDS : 5 * MINUTE_IN_SECONDS );
    return $result;
}

add_filter( 'update_plugins_github.com', function ( $update, $plugin_data, $plugin_file ) {
    if ( plugin_basename( __DIR__ . '/looper-for-etch.php' ) !== $plugin_file || ( $plugin_data['UpdateURI'] ?? '' ) !== lfe_update_uri() ) { return $update; }
    $release = lfe_latest_release();
    if ( ! $release ) { return $update; }
    return array( 'id' => lfe_update_uri(), 'slug' => 'looper-for-etch', 'version' => $release['version'], 'url' => $release['url'], 'package' => $release['package'], 'requires' => $release['requires'], 'requires_php' => $release['requires_php'] );
}, 10, 3 );

add_filter( 'plugins_api', function ( $result, $action, $args ) {
    if ( 'plugin_information' !== $action || 'looper-for-etch' !== ( $args->slug ?? '' ) ) { return $result; }
    $release = lfe_latest_release(); if ( ! $release ) { return $result; }
    return (object) array( 'name' => 'Looper for Etch', 'slug' => 'looper-for-etch', 'version' => $release['version'], 'author' => 'Stephen Walker', 'homepage' => lfe_update_uri(), 'requires' => $release['requires'], 'requires_php' => $release['requires_php'], 'download_link' => $release['package'], 'sections' => array( 'description' => esc_html__( 'Build WordPress queries for Etch with visual filters, generated PHP, and dynamic-field previews.', 'looper-for-etch' ), 'changelog' => nl2br( esc_html( $release['changelog'] ) ) ) );
}, 10, 3 );

// Let WordPress install the ZIP normally, after verifying its release checksum.
add_filter( 'upgrader_pre_download', function ( $reply, $package, $upgrader, $extra ) {
    if ( false !== $reply || ( $extra['plugin'] ?? '' ) !== plugin_basename( __DIR__ . '/looper-for-etch.php' ) ) { return $reply; }
    $release = lfe_latest_release();
    if ( ! $release || $package !== $release['package'] ) { return new WP_Error( 'lfe_invalid_update', __( 'The Looper release could not be verified. Please check for updates again.', 'looper-for-etch' ) ); }
    $file = download_url( $package, 60 );
    if ( is_wp_error( $file ) ) { return $file; }
    $checksum = hash_file( 'sha256', $file );
    if ( ! is_string( $checksum ) || ! hash_equals( $release['sha256'], $checksum ) ) { wp_delete_file( $file ); return new WP_Error( 'lfe_checksum_mismatch', __( 'The Looper download checksum did not match the release. Installation stopped.', 'looper-for-etch' ) ); }
    return $file;
}, 10, 4 );

add_action( 'upgrader_process_complete', function ( $upgrader, $options ) {
    if ( in_array( plugin_basename( __DIR__ . '/looper-for-etch.php' ), (array) ( $options['plugins'] ?? array() ), true ) ) { delete_site_transient( 'lfe_github_release' ); }
}, 10, 2 );
