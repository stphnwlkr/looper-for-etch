<?php
/** Additional query options and portable Etch definitions. */
defined( 'ABSPATH' ) || exit;

function lfe_query_keys( $type ) {
    static $catalog;
    if ( null === $catalog ) { $catalog = json_decode( file_get_contents( __DIR__ . '/query-options.json' ), true ); }
    return $catalog[ 'main-query' === $type ? 'wp-query' : $type ] ?? array();
}

function lfe_valid_query( $args, $type ) {
    if ( ! is_array( $args ) || strlen( wp_json_encode( $args ) ) > 80000 || array_diff( array_keys( $args ), lfe_query_keys( $type ) ) ) { return false; }
    if ( isset( $args['fields'] ) && ! in_array( $args['fields'], array( '', 'all', 'wp-users' === $type ? 'all_with_meta' : ( 'wp-terms' === $type ? 'all_with_object_id' : 'all' ) ), true ) ) { return false; }
    if ( 'wp-terms' === $type && isset( $args['orderby'] ) && ! is_string( $args['orderby'] ) ) { return false; }
    if ( 'wp-terms' === $type && empty( $args['taxonomy'] ) ) { return false; }
    $count = 0;
    $walk = function ( $value, $depth = 0 ) use ( &$walk, &$count ) {
        if ( ++$count > 4000 || $depth > 12 ) { return false; }
        if ( is_array( $value ) ) { foreach ( $value as $child ) { if ( ! $walk( $child, $depth + 1 ) ) { return false; } } return true; }
        return is_scalar( $value ) || null === $value;
    };
    return $walk( $args );
}

function lfe_decode_query_carrier( $args, $type ) {
    $encoded = null;
    if ( 'wp-terms' === $type && is_string( $args['taxonomy'] ?? null ) && str_starts_with( $args['taxonomy'], '_looper_etch_v2:' ) ) {
        $encoded = explode( '|', substr( $args['taxonomy'], 16 ) )[0];
    } elseif ( is_array( $args['meta_query'] ?? null ) ) {
        foreach ( $args['meta_query'] as $row ) {
            if ( is_array( $row ) && '_looper_etch_v2' === ( $row['key'] ?? '' ) ) { $encoded = $row['value'] ?? null; break; }
        }
    }
    if ( ! is_string( $encoded ) || strlen( $encoded ) > 110000 || ! preg_match( '/^[A-Za-z0-9_-]+$/', $encoded ) ) { return $args; }
    $decoded = json_decode( base64_decode( strtr( $encoded, '-_', '+/' ), true ) ?: '', true );
    return lfe_valid_query( $decoded, $type ) ? $decoded : $args;
}

// Expand before Etch extracts defaults and resolves loop parameters. The complete
// definition travels in Etch's own saved loop, with no separate registry to sync.
function lfe_expand_saved_queries( $loops ) {
    if ( ! is_array( $loops ) ) { return $loops; }
    foreach ( $loops as &$loop ) {
        $type = $loop['config']['type'] ?? '';
        if ( in_array( $type, array( 'wp-query', 'main-query', 'wp-users', 'wp-terms' ), true ) && is_array( $loop['config']['args'] ?? null ) ) {
            $loop['config']['args'] = lfe_decode_query_carrier( $loop['config']['args'], $type );
        }
    }
    unset( $loop );
    return $loops;
}
add_filter( 'option_etch_loops', 'lfe_expand_saved_queries', 1 );

function lfe_sample_data( $object ) {
    if ( ! trait_exists( '\Etch\Traits\DynamicData' ) ) { return null; }
    $reader = new class {
        use \Etch\Traits\DynamicData;
        public function sample( $object ) {
            if ( $object instanceof WP_Post ) { return $this->get_dynamic_data( $object ); }
            if ( $object instanceof WP_Term ) { return $this->get_dynamic_term_data( $object ); }
            if ( $object instanceof WP_User ) { return $this->get_dynamic_user_data( $object ); }
            return null;
        }
    };
    return $reader->sample( $object );
}

function lfe_relationship_query_problem( $args ) {
    if ( empty( $args['relationship'] ) ) { return null; }
    if ( ! is_array( $args['relationship'] ) || ! is_string( $args['relationship']['id'] ?? null ) ) { return new WP_Error( 'invalid_relationship', 'Choose a registered relationship ID.', array( 'status' => 400 ) ); }
    if ( ! is_callable( array( 'MB_Relationships_API', 'get_relationship' ) ) ) { return new WP_Error( 'missing_relationship_provider', 'This query requires Meta Box Relationships. Its relationship filter cannot run while that extension is unavailable.', array( 'status' => 400 ) ); }
    $id = $args['relationship']['id'] ?? '';
    if ( ! is_string( $id ) || ! MB_Relationships_API::get_relationship( $id ) ) { return new WP_Error( 'missing_relationship', 'This Meta Box relationship ID is not registered on this site. Choose a registered relationship or register the ID before previewing.', array( 'status' => 400 ) ); }
    return null;
}

// A missing relationship provider must not broaden a saved query to all posts.
add_action( 'parse_query', function ( $query ) {
    $relationship = $query->get( 'relationship' );
    if ( ! is_array( $relationship ) || ! isset( $relationship['id'] ) ) { return; }
    if ( lfe_relationship_query_problem( array( 'relationship' => $relationship ) ) ) { $query->set( 'post__in', array( 0 ) ); $query->set( 'relationship', null ); }
}, 0 );

function lfe_expanded_preview( $request ) {
    $input = $request->get_json_params(); $args = $input['args'] ?? null; $type = $input['type'] ?? 'wp-query'; $sample = ! empty( $input['sample'] );
    if ( 'main-query' === $type ) { return new WP_Error( 'template_preview', 'Preview Main Query on its archive or search page in Etch. The results depend on that page.', array( 'status' => 400 ) ); }
    if ( ! in_array( $type, array( 'wp-query', 'wp-users', 'wp-terms' ), true ) || ! lfe_valid_query( $args, $type ) ) { return new WP_Error( 'invalid_query', 'Unsupported query arguments.', array( 'status' => 400 ) ); }
    foreach ( array( 'posts_per_page', 'posts_per_archive_page', 'number', 'offset', 'paged', 'page', 'p', 'page_id', 'attachment_id', 'post_parent', 'parent', 'child_of', 'blog_id', 'menu_order', 'year', 'monthnum', 'w', 'day', 'hour', 'minute', 'second', 'm' ) as $key ) {
        if ( isset( $args[ $key ] ) && ! is_int( $args[ $key ] ) && ! ( is_string( $args[ $key ] ) && preg_match( '/^-?\d+$/D', $args[ $key ] ) ) ) { return new WP_Error( 'invalid_number', 'Numeric query settings require whole numbers.', array( 'status' => 400 ) ); }
    }
    $relationship_problem = lfe_relationship_query_problem( $args ); if ( $relationship_problem ) { return $relationship_problem; }
    $limit = $sample ? 1 : 20; $items = array(); $objects = array(); $requested = 0;
    if ( 'wp-query' === $type ) {
        $types = (array) ( $args['post_type'] ?? 'post' );
        if ( array( 'any' ) === $types ) { $args['post_type'] = $types = array_keys( lfe_types() ); }
        if ( array_diff( $types, array_keys( lfe_types() ) ) ) { return new WP_Error( 'invalid_type', 'Choose available content types.', array( 'status' => 400 ) ); }
        $requested = (int) ( $args['posts_per_page'] ?? get_option( 'posts_per_page' ) );
        // Keep the first item of the requested page when reducing the sample size.
        if ( $sample && ! isset( $args['offset'] ) && (int) ( $args['paged'] ?? 1 ) > 1 && $requested > 0 ) { $args['offset'] = ( (int) $args['paged'] - 1 ) * $requested; }
        $args['posts_per_page'] = $requested < 1 ? $limit : min( $limit, $requested );
        $args['nopaging'] = false; unset( $args['posts_per_archive_page'] );
        $args['no_found_rows'] = true; $args['update_post_meta_cache'] = false; $args['update_post_term_cache'] = false;
        // Preview always runs filters, including the gallery compatibility filter.
        $args['suppress_filters'] = false;
        $objects = ( new WP_Query( $args ) )->posts;
        foreach ( $objects as $post ) {
            if ( ! $post instanceof WP_Post || ( 'publish' !== $post->post_status && ! current_user_can( 'read_post', $post->ID ) ) ) { continue; }
            $items[] = array( 'id' => $post->ID, 'title' => html_entity_decode( wp_strip_all_tags( get_the_title( $post ) ?: '(Untitled)' ), ENT_QUOTES, get_bloginfo( 'charset' ) ), 'status' => $post->post_status, 'type' => $post->post_type );
        }
    } elseif ( 'wp-terms' === $type ) {
        foreach ( (array) ( $args['taxonomy'] ?? array() ) as $taxonomy ) { if ( ! lfe_taxonomy_available( get_taxonomy( $taxonomy ) ) ) { return new WP_Error( 'invalid_taxonomy', 'Choose available taxonomies.', array( 'status' => 400 ) ); } }
        if ( empty( $args['taxonomy'] ) ) { return new WP_Error( 'invalid_taxonomy', 'Choose a taxonomy.', array( 'status' => 400 ) ); }
        $requested = max( 0, (int) ( $args['number'] ?? 0 ) ); $args['number'] = $requested === 0 ? $limit : min( $limit, $requested );
        $args['update_term_meta_cache'] = false; $objects = get_terms( $args ); if ( is_wp_error( $objects ) ) { return $objects; }
        foreach ( $objects as $term ) { $items[] = array( 'id' => $term->term_id, 'title' => html_entity_decode( $term->name, ENT_QUOTES, get_bloginfo( 'charset' ) ), 'detail' => $term->slug . ' · ' . $term->count . ' posts' ); }
    } else {
        if ( isset( $args['blog_id'] ) && (int) $args['blog_id'] !== get_current_blog_id() ) { return new WP_Error( 'site_scope', 'Looper previews users from the current site only.', array( 'status' => 400 ) ); }
        if ( ! current_user_can( 'list_users' ) ) { return new WP_Error( 'forbidden', 'You do not have permission to preview users.', array( 'status' => 403 ) ); }
        $requested = (int) ( $args['number'] ?? 0 );
        if ( $sample && ! isset( $args['offset'] ) && (int) ( $args['paged'] ?? 1 ) > 1 && $requested > 0 ) { $args['offset'] = ( (int) $args['paged'] - 1 ) * $requested; }
        $args['number'] = $requested < 1 ? $limit : min( $limit, $requested ); $args['count_total'] = false;
        $objects = ( new WP_User_Query( $args ) )->get_results();
        foreach ( $objects as $user ) { $items[] = array( 'id' => $user->ID, 'title' => $user->display_name, 'detail' => $user->user_login ); }
    }
    $data = array( 'posts' => $items, 'limited' => $requested < 1 || $requested > $limit );
    if ( $sample && $items ) {
        $id = $items[0]['id'];
        foreach ( $objects as $object ) { if ( (int) ( $object->ID ?? $object->term_id ?? 0 ) === $id ) { $data['sample'] = lfe_sample_data( $object ); break; } }
        if ( null === ( $data['sample'] ?? null ) ) { $data['sampleUnavailable'] = 'Etch dynamic data is not available. Activate Etch to inspect copyable field paths.'; }
    }
    return rest_ensure_response( $data );
}
