<?php
/** Per-user, per-site builder preferences. No frontend behavior. */
defined( 'ABSPATH' ) || exit;
function lfe_autocomplete_enabled() {
    return '1' === get_user_meta( get_current_user_id(), 'lfe_autocomplete_' . get_current_blog_id(), true );
}
function lfe_direct_actions_enabled() {
    return '1' === get_user_meta( get_current_user_id(), 'lfe_direct_actions_' . get_current_blog_id(), true );
}
function lfe_preferences( $request ) {
    if ( 'POST' === $request->get_method() ) {
        $input = $request->get_json_params();
        $keys = array( 'autocomplete' => 'lfe_autocomplete_', 'directActions' => 'lfe_direct_actions_' );
        if ( ! is_array( $input ) || ! $input || array_diff( array_keys( $input ), array_keys( $keys ) ) ) { return new WP_Error( 'invalid_preference', 'Choose a supported builder setting.', array( 'status' => 400 ) ); }
        foreach ( $input as $value ) { if ( ! is_bool( $value ) ) { return new WP_Error( 'invalid_preference', 'Builder settings must be enabled or disabled.', array( 'status' => 400 ) ); } }
        foreach ( $input as $name => $enabled ) {
            $value = $enabled ? '1' : '0'; $key = $keys[ $name ] . get_current_blog_id();
            update_user_meta( get_current_user_id(), $key, $value );
            if ( get_user_meta( get_current_user_id(), $key, true ) !== $value ) { return new WP_Error( 'preference_save', 'The setting could not be saved. Try again.', array( 'status' => 500 ) ); }
        }
    }
    $response = rest_ensure_response( array( 'autocomplete' => lfe_autocomplete_enabled(), 'directActions' => lfe_direct_actions_enabled() ) );
    $response->header( 'Cache-Control', 'no-store, private' ); return $response;
}
add_action( 'rest_api_init', function () {
    register_rest_route( 'looper-for-etch/v1', '/preferences', array( 'methods' => array( 'GET', 'POST' ), 'callback' => 'lfe_preferences', 'permission_callback' => 'lfe_permission' ) );
} );
