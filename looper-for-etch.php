<?php
/**
 * Plugin Name: Looper for Etch
 * Description: Content-aware visual query builder with PHP export and Etch Public API integration.
 * Version: 0.8.0
 * Requires at least: 7.1
 * Requires PHP: 8.3
 * License: GPL-2.0-or-later
 * Plugin URI: https://github.com/stphnwlkr/looper-for-etch
 * Update URI: https://github.com/stphnwlkr/looper-for-etch
 * Author: Stephen Walker
 * License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 * Text Domain: looper-for-etch
 */
defined( 'ABSPATH' ) || exit;

function lfe_version() {
    static $version;
    if ( null === $version ) { $header = get_file_data( __FILE__, array( 'version' => 'Version' ), 'plugin' ); $version = $header['version']; }
    return $version;
}

add_action( 'admin_menu', function () {
    add_management_page( 'Looper for Etch', 'Looper for Etch', 'manage_options', 'looper-for-etch', function () {
        echo '<div id="looper-admin"></div>';
    } );
} );

function lfe_enqueue() {
    $base = plugin_dir_url( __FILE__ );
    wp_enqueue_style( 'lfe-host', $base . 'assets/host.css', array(), lfe_version() );
    wp_enqueue_script( 'lfe-query', $base . 'assets/query.js', array(), lfe_version(), true );
    wp_enqueue_script( 'lfe-app', $base . 'assets/looper.js', array( 'lfe-query' ), lfe_version(), true );
    wp_add_inline_script( 'lfe-app', 'window.looperConfig=' . wp_json_encode( array(
        'version' => lfe_version(),
        'styles' => $base . 'assets/looper.css?ver=' . lfe_version(),
        'api' => rest_url( 'looper-for-etch/v1/' ),
        'nonce' => wp_create_nonce( 'wp_rest' ),
    ) ) . ';', 'before' );
}
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( 'tools_page_looper-for-etch' === $hook ) { lfe_enqueue(); }
} );
add_action( 'wp_enqueue_scripts', function () {
    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only editor routing; capabilities are checked and no data is changed.
    if ( isset( $_GET['etch'] ) && 'magic' === $_GET['etch'] && current_user_can( 'manage_options' ) ) { lfe_enqueue(); }
} );

function lfe_permission() { return current_user_can( 'manage_options' ); }

function lfe_types() {
    return array_filter( get_post_types( array( 'show_ui' => true ), 'objects' ), function ( $type ) {
        if ( 'attachment' === $type->name ) { return current_user_can( 'upload_files' ); }
        return ( $type->public || $type->publicly_queryable ) && ! in_array( $type->name, array( 'wp_block', 'wp_navigation', 'wp_template', 'wp_template_part' ), true )
            && current_user_can( $type->cap->edit_posts );
    } );
}

function lfe_taxonomy_available( $tax ) {
    return $tax && ( $tax->show_ui || ( 'etch_collection' === $tax->name && in_array( 'attachment', $tax->object_type, true ) ) );
}
function lfe_taxonomy_label( $tax ) { return 'etch_collection' === $tax->name ? 'Etch Collections' : $tax->label; }

function lfe_relationships() {
    $result = array( 'relationships' => array(), 'relationshipsAvailable' => is_callable( array( 'MB_Relationships_API', 'get_all_relationships_settings' ) ) );
    if ( ! $result['relationshipsAvailable'] ) { return $result; }
    $side_data = function ( $side ) {
        if ( is_string( $side ) ) { $side = array( 'object_type' => 'post', 'field' => array( 'post_type' => $side ) ); }
        $object_type = $side['object_type'] ?? 'post';
        $types = 'post' === $object_type ? array_values( array_filter( (array) ( $side['field']['post_type'] ?? $side['post_type'] ?? 'post' ), 'is_string' ) ) : array();
        $labels = array();
        foreach ( $types as $type ) { $object = get_post_type_object( $type ); $labels[] = $object ? $object->label : $type; }
        if ( ! $labels ) { $labels[] = 'user' === $object_type ? 'Users' : ( 'term' === $object_type ? 'Terms' : ucfirst( $object_type ) ); }
        return array( 'objectType' => $object_type, 'postTypes' => $types, 'label' => implode( ', ', $labels ) );
    };
    try {
        foreach ( (array) MB_Relationships_API::get_all_relationships_settings() as $key => $settings ) {
            if ( ! is_array( $settings ) ) { continue; }
            $id = $settings['id'] ?? $key;
            if ( ! is_string( $id ) || '' === $id ) { continue; }
            $result['relationships'][] = array( 'id' => $id, 'from' => $side_data( $settings['from'] ?? array() ), 'to' => $side_data( $settings['to'] ?? array() ) );
        }
        usort( $result['relationships'], function ( $a, $b ) { return strnatcasecmp( $a['id'], $b['id'] ); } );
    } catch ( Throwable $error ) {
        $result['relationshipsError'] = 'Registered relationships could not be read. You can still enter an ID manually.';
    }
    return $result;
}

/** Discover stored keys using bounded, prepared, briefly cached read-only queries. */
function lfe_stored_meta_keys( $object_type, $post_type = '' ) {
    global $wpdb;
    $cache_key = md5( $object_type . ':' . $post_type );
    $keys = wp_cache_get( $cache_key, 'looper_meta_keys', false, $found );
    if ( $found ) { return $keys; }
    if ( 'post' === $object_type ) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Key discovery has no core API; results are cached below.
        $keys = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT pm.meta_key FROM %i pm INNER JOIN %i p ON p.ID=pm.post_id WHERE p.post_type=%s AND LEFT(pm.meta_key,1) <> '_' ORDER BY pm.meta_key LIMIT 200", $wpdb->postmeta, $wpdb->posts, $post_type ) );
    } else {
        $table = 'user' === $object_type ? $wpdb->usermeta : $wpdb->termmeta;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Key discovery has no core API; results are cached below.
        $keys = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT meta_key FROM %i WHERE LEFT(meta_key,1) <> '_' ORDER BY meta_key LIMIT 200", $table ) );
    }
    $keys = is_array( $keys ) ? $keys : array();
    wp_cache_set( $cache_key, $keys, 'looper_meta_keys', MINUTE_IN_SECONDS );
    return $keys;
}

function lfe_content( $request ) {
    if ( 'wp-users' === $request->get_param( 'source' ) && ! current_user_can( 'list_users' ) ) { return new WP_Error( 'forbidden', __( 'You do not have permission to inspect users.', 'looper-for-etch' ), array( 'status' => 403 ) ); }
    $types = lfe_types();
    $type = sanitize_key( $request->get_param( 'post_type' ) ?: 'post' );
    if ( ! isset( $types[ $type ] ) ) { return new WP_Error( 'invalid_type', 'Choose an available post type.', array( 'status' => 400 ) ); }
    $taxonomies = array();
    foreach ( get_object_taxonomies( $type, 'objects' ) as $tax ) {
        if ( ! lfe_taxonomy_available( $tax ) ) { continue; }
        $terms = get_terms( array( 'taxonomy' => $tax->name, 'hide_empty' => false, 'number' => 200 ) );
        $taxonomies[] = array( 'name' => $tax->name, 'label' => lfe_taxonomy_label( $tax ), 'terms' => is_wp_error( $terms ) ? array() : array_map( function ( $term ) {
            return array( 'id' => $term->term_id, 'taxonomyId' => $term->term_taxonomy_id, 'slug' => $term->slug, 'name' => $term->name );
        }, $terms ) );
    }
    $fields = array();
    foreach ( array_merge( get_registered_meta_keys( 'post' ), get_registered_meta_keys( 'post', $type ) ) as $key => $field ) {
        if ( ! is_protected_meta( $key, 'post' ) ) { $fields[ $key ] = array( 'key' => $key, 'label' => $key, 'type' => $field['type'] ?? 'string' ); }
    }
    // Registered definitions cover fields with no values yet. Stored keys cover other field plugins.
    $keys = lfe_stored_meta_keys( 'post', $type );
    foreach ( $keys as $key ) {
        if ( ! isset( $fields[ $key ] ) ) { $fields[ $key ] = array( 'key' => $key, 'label' => $key, 'type' => 'string' ); }
    }
    if ( function_exists( 'rwmb_get_object_fields' ) ) {
        foreach ( rwmb_get_object_fields( $type, 'post' ) as $key => $field ) {
            $fields[ $key ] = array( 'key' => $key, 'label' => $field['name'] ?? $key, 'type' => $field['type'] ?? 'string' );
        }
    }
    if ( function_exists( 'acf_get_field_groups' ) && function_exists( 'acf_get_fields' ) ) {
        foreach ( acf_get_field_groups( array( 'post_type' => $type ) ) as $group ) {
            foreach ( acf_get_fields( $group ) ?: array() as $field ) {
                if ( ! empty( $field['name'] ) ) { $fields[ $field['name'] ] = array( 'key' => $field['name'], 'label' => $field['label'], 'type' => $field['type'] ); }
            }
        }
    }
    if ( in_array( $request->get_param( 'source' ), array( 'wp-users', 'wp-terms' ), true ) ) {
        $object_type = 'wp-users' === $request->get_param( 'source' ) ? 'user' : 'term';
        $fields = array();
        foreach ( get_registered_meta_keys( $object_type ) as $key => $field ) { $fields[ $key ] = array( 'key' => $key, 'label' => $key, 'type' => $field['type'] ?? 'string' ); }
        foreach ( lfe_stored_meta_keys( $object_type ) as $key ) { $fields[ $key ] = array( 'key' => $key, 'label' => $key, 'type' => 'string' ); }
    }
    return rest_ensure_response( array_merge( lfe_relationships(), array(
        'isMultisite' => is_multisite(),
        'roles' => array_map( function ( $key, $role ) { return array( 'name' => $key, 'label' => translate_user_role( $role['name'] ) ); }, array_keys( wp_roles()->roles ), array_values( wp_roles()->roles ) ),
        'postTypes' => array_values( array_map( function ( $t ) { return array( 'name' => $t->name, 'label' => $t->label ); }, $types ) ),
        'taxonomies' => $taxonomies, 'fields' => array_values( $fields ),
        'allTaxonomies' => array_values( array_map( function ( $tax ) { return array( 'name' => $tax->name, 'label' => lfe_taxonomy_label( $tax ) ); }, array_filter( get_taxonomies( array(), 'objects' ), 'lfe_taxonomy_available' ) ) ),
        'statuses' => array_values( array_map( function ( $s ) { return array( 'name' => $s->name, 'label' => 'inherit' === $s->name ? 'Inherit' : $s->label ); }, array_merge( get_post_stati( array( 'internal' => false ), 'objects' ), 'attachment' === $type ? array( get_post_status_object( 'inherit' ) ) : array() ) ) ),
    ) ) );
}

require_once __DIR__ . '/query-support.php';
function lfe_preview( $request ) {
    try { return lfe_expanded_preview( $request ); }
    catch ( Throwable $error ) { return new WP_Error( 'invalid_query', __( 'Invalid query values. Review the enabled options.', 'looper-for-etch' ), array( 'status' => 400 ) ); }
}
function lfe_terms( $request ) {
    $type = sanitize_key( $request->get_param( 'post_type' ) ?: 'post' );
    $taxonomy = sanitize_key( $request->get_param( 'taxonomy' ) ?: '' );
    $tax = get_taxonomy( $taxonomy );
    if ( ! isset( lfe_types()[ $type ] ) || ! lfe_taxonomy_available( $tax ) || ! in_array( $type, $tax->object_type, true ) ) {
        return new WP_Error( 'invalid_taxonomy', 'Choose a taxonomy assigned to this content type.', array( 'status' => 400 ) );
    }
    $terms = get_terms( array( 'taxonomy' => $taxonomy, 'hide_empty' => false, 'number' => 30, 'search' => sanitize_text_field( $request->get_param( 'search' ) ?: '' ), 'orderby' => 'name', 'order' => 'ASC' ) );
    if ( is_wp_error( $terms ) ) { return $terms; }
    return rest_ensure_response( array( 'terms' => array_map( function ( $term ) {
        return array( 'id' => $term->term_id, 'taxonomyId' => $term->term_taxonomy_id, 'slug' => $term->slug, 'name' => html_entity_decode( $term->name, ENT_QUOTES, get_bloginfo( 'charset' ) ), 'count' => $term->count );
    }, $terms ), 'limited' => count( $terms ) === 30 ) );
}
add_action( 'rest_api_init', function () {
    register_rest_route( 'looper-for-etch/v1', '/content', array( 'methods' => 'GET', 'callback' => 'lfe_content', 'permission_callback' => 'lfe_permission' ) );
    register_rest_route( 'looper-for-etch/v1', '/preview', array( 'methods' => 'POST', 'callback' => 'lfe_preview', 'permission_callback' => 'lfe_permission' ) );
    register_rest_route( 'looper-for-etch/v1', '/terms', array( 'methods' => 'GET', 'callback' => 'lfe_terms', 'permission_callback' => 'lfe_permission' ) );
} );


// Etch validates a narrower argument schema than WordPress. Carry attachment-only
// settings through valid meta clauses, then restore them before SQL is built.
add_action( 'pre_get_posts', function ( $query ) {
    if ( 'attachment' !== $query->get( 'post_type' ) ) { return; }
    $group = $query->get( 'meta_query' );
    if ( ! is_array( $group ) ) { return; }
    $remaining = array(); $found = false;
    foreach ( $group as $key => $clause ) {
        if ( 'relation' === $key ) { $remaining['relation'] = $clause; continue; }
        $option = is_array( $clause ) ? ( $clause['key'] ?? '' ) : '';
        $value = is_array( $clause ) ? ( $clause['value'] ?? null ) : null;
        if ( '_looper_etch_v1_post_mime_type' === $option && is_string( $value ) && preg_match( '~^[a-z0-9.+_-]+(?:/[a-z0-9.+_-]+)?$~i', $value ) ) {
            $query->set( 'post_mime_type', $value ); $found = true;
        } elseif ( '_looper_etch_v1_post_parent' === $option && is_numeric( $value ) && (float) $value >= 0 && floor( (float) $value ) === (float) $value ) {
            $query->set( 'post_parent', (int) $value ); $found = true;
        } elseif ( '_looper_etch_v1_orderby' === $option && 'collection_order' === $value ) {
            $query->set( 'orderby', 'collection_order' ); $found = true;
        } else { $remaining[] = $clause; }
    }
    if ( $found ) { $query->set( 'meta_query', count( array_filter( array_keys( $remaining ), 'is_int' ) ) ? $remaining : array() ); }
}, 1 );

function lfe_saved_loops() {
    $loops = get_option( 'etch_loops', array() );
    $response = rest_ensure_response( array( 'loops' => is_array( $loops ) ? (object) $loops : (object) array() ) );
    $response->header( 'Cache-Control', 'no-store, private' );
    return $response;
}
add_action( 'rest_api_init', function () {
    register_rest_route( 'looper-for-etch/v1', '/loops', array( 'methods' => 'GET', 'callback' => 'lfe_saved_loops', 'permission_callback' => 'lfe_permission' ) );
} );

require_once __DIR__ . '/updater.php';
