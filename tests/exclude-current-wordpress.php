<?php
/** Reversible native Etch rendering check; run with Studio wp eval-file. */
$before = get_option( 'etch_loops', array() );
$key = 'lfeExcludeCurrentCheck';
if ( isset( $before[$key] ) ) { throw new Exception('Temporary loop key already exists'); }
$old_post = $GLOBALS['post'] ?? null;
$posts = get_posts(array('post_type'=>'post','post_status'=>'publish','numberposts'=>3));
if ( count($posts) < 3 ) { throw new Exception('Three published posts required'); }
try {
    $args = array('post_type'=>'post','posts_per_page'=>-1,'post_status'=>'publish','post__not_in'=>array(1,'$exclude ?? 0')); 
    $args['post_type'] = 'post';
    $args['post__not_in'][0] = $posts[1]->ID;
    update_option('etch_loops', array_merge($before, array($key=>array('key'=>$key,'name'=>'Temporary related posts','config'=>array('type'=>'wp-query','args'=>$args)))));
    $GLOBALS['post'] = $posts[0];
    \Etch\Blocks\Global\DynamicContent\DynamicContextProvider::reset_global_context();
    \Etch\Blocks\Global\Utilities\LoopHandlerManager::reset();
    $markup = '<!-- wp:etch/loop ' . wp_json_encode(array('loopId'=>$key,'itemId'=>'related','loopParams'=>array('$exclude'=>'this.id'))) . ' --><!-- wp:etch/text {"content":"CHECK-{related.id}-END"} /--><!-- /wp:etch/loop -->';
    $html = do_blocks($markup);
    foreach (array($posts[0]->ID, $posts[1]->ID) as $excluded) { if (str_contains($html, 'CHECK-'.$excluded.'-END')) { throw new Exception('Excluded post rendered'); } }
    if (!str_contains($html, 'CHECK-'.$posts[2]->ID.'-END')) { throw new Exception('Other post missing: '.$html); }
    echo "PASS native Etch loop resolves this.id and excludes the current post plus fixed IDs\n";
    $handler = new \Etch\Blocks\Global\Utilities\LoopHandlers\WpQueryLoopHandler();
    $data = $handler->get_loop_data($key);
    if (!in_array($posts[0]->ID, array_column($data,'id'))) { throw new Exception('Missing context should fall back to zero'); }
    echo "PASS absent argument falls back to zero without excluding unrelated content\n";
} finally {
    update_option('etch_loops',$before);
    $GLOBALS['post']=$old_post;
    \Etch\Blocks\Global\DynamicContent\DynamicContextProvider::reset_global_context();
    \Etch\Blocks\Global\Utilities\LoopHandlerManager::reset();
    \Etch\Blocks\Global\CachedLoopPresets::clear_cache();
}
