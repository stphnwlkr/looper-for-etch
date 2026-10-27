<?php
/** Standalone updater trust-boundary tests; no WordPress or GitHub connection required. */
define('ABSPATH', __DIR__); define('HOUR_IN_SECONDS',3600); define('MINUTE_IN_SECONDS',60);
$hooks=[];$cache=false;$requests=0;$files=[];
function add_filter($name,$fn,...$args){global $hooks;$hooks[$name]=$fn;}
function add_action($name,$fn,...$args){add_filter($name,$fn,...$args);}
function lfe_version(){return '0.7.5';}
function plugin_basename($file){return 'looper-for-etch/looper-for-etch.php';}
function get_site_transient($key){global $cache;return $cache;}
function set_site_transient($key,$value,$ttl){global $cache;$cache=$value;}
function delete_site_transient($key){global $cache;$cache=false;}
function __($text,$domain){return $text;}
function esc_html($text){return htmlspecialchars($text,ENT_QUOTES,'UTF-8');}
function esc_html__($text,$domain){return esc_html($text);}
class WP_Error {public $code;function __construct($code,...$args){$this->code=$code;}}
function is_wp_error($value){return $value instanceof WP_Error;}
function wp_remote_retrieve_response_code($response){return $response['code'];}
function wp_remote_retrieve_body($response){return $response['body'];}
function wp_safe_remote_get($url,$options){global $requests,$release,$manifest;$requests++;check($options['limit_response_size']===262144,'bounded metadata request');check(!str_contains($options['headers']['User-Agent'],'http'),'no site URL in update request');return ['code'=>200,'body'=>json_encode(str_contains($url,'api.github.com')?$release:$manifest)];}
function download_url($url,$timeout){global $files;$file=tempnam(sys_get_temp_dir(),'lfe-update-');file_put_contents($file,'verified zip fixture');$files[]=$file;return $file;}
function wp_delete_file($path){unlink($path);}
function check($ok,$name){if(!$ok)throw new Exception($name);echo "PASS $name\n";}
require dirname(__DIR__).'/updater.php';
$release=['tag_name'=>'v0.8.0','draft'=>false,'prerelease'=>false,'body'=>'<script>alert(1)</script>'];
$manifest=['version'=>'0.8.0','requires'=>'7.1','requires_php'=>'8.3','package'=>lfe_update_uri().'/releases/download/v0.8.0/looper-for-etch.zip','sha256'=>hash('sha256','verified zip fixture')];
check(lfe_validate_release($release,$manifest)!==false,'stable pinned package accepted');
foreach(['http://127.0.0.1/test.zip','https://example.com/test.zip',lfe_update_uri().'/releases/download/v0.7.5/looper-for-etch.zip']as$url){$bad=$manifest;$bad['package']=$url;check(lfe_validate_release($release,$bad)===false,'foreign, insecure, or mismatched package rejected');}
$bad=$release;$bad['prerelease']=true;check(lfe_validate_release($bad,$manifest)===false,'prerelease rejected');$bad=$manifest;$bad['sha256']='no';check(lfe_validate_release($release,$bad)===false,'invalid checksum rejected');$bad=$manifest;$bad['version']='9.0.0';check(lfe_validate_release($release,$bad)===false,'tag and manifest mismatch rejected');
check(lfe_latest_release()['version']==='0.8.0','release discovery succeeds');$before=$requests;lfe_latest_release();check($requests===$before,'metadata cached');
$update=$hooks['update_plugins_github.com'];check($update('keep',[], 'another/plugin.php')==='keep','other plugin updates untouched');$result=$update(false,['UpdateURI'=>lfe_update_uri()],plugin_basename(''));check($result['version']==='0.8.0'&&$result['requires_php']==='8.3','core update response contains compatibility fields');
$info=$hooks['plugins_api'](false,'plugin_information',(object)['slug'=>'looper-for-etch']);check(!str_contains($info->sections['changelog'],'<script>'),'release notes escaped');
$download=$hooks['upgrader_pre_download'];$file=$download(false,$manifest['package'],null,['plugin'=>plugin_basename('')]);check(is_string($file)&&file_exists($file),'valid checksum permits installation');unlink($file);
$cache['sha256']=str_repeat('0',64);$result=$download(false,$manifest['package'],null,['plugin'=>plugin_basename('')]);check(is_wp_error($result)&&$result->code==='lfe_checksum_mismatch','tampered download blocked');check(!file_exists(end($files)),'failed download removed');
check($download(false,'https://evil.example/package.zip',null,['plugin'=>plugin_basename('')]) instanceof WP_Error,'unverified package blocked');check($download('prior-result','https://evil.example/package.zip',null,[])==='prior-result','earlier updater decisions respected');
