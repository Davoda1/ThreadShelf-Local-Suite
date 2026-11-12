<?php
declare(strict_types=1);
$root=dirname(__DIR__);
$source=file_get_contents($root.'/src/gopher.php');
$css=file_get_contents($root.'/assets/gopher.css');
$icons=file_get_contents($root.'/assets/icons.json');
$js=file_get_contents($root.'/assets/search.js');
$features=file_get_contents($root.'/src/features.php');
if($source===false||$css===false||$icons===false||$js===false||$features===false){fwrite(STDERR,"Missing source asset.\n");exit(1);}
json_decode($icons,true,16,JSON_THROW_ON_ERROR);
$source=str_replace(["'__GH_CSS__'","'__GH_ICONS_JSON__'","'__GH_SEARCH_JS__'","/*__GH_FEATURES__*/"],[var_export($css,true),var_export($icons,true),var_export($js,true),$features],$source);
if(file_put_contents($root.'/index.php',$source)===false){fwrite(STDERR,"Cannot write index.php.\n");exit(1);}
echo "Built single-file index.php (".strlen($source)." bytes).\n";
